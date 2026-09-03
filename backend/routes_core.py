"""Rute inti: meta, overview, matriks mitra, detail member, rekap transaksi, export."""
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from auth import get_current_user, require_roles
from common import audit, db, doc_out, docs_out, get_thresholds, new_id, now_utc, parse_filters
from insights_engine import live_no_transactions, member_product_concentration
from metrics import (add_months, aggregate, aggregate_series, build_match, parse_ym,
                     pct_change, period_label, prev_equal_period, totals)

router = APIRouter(prefix="/api", tags=["core"])

STATUSES = ["Live", "UAT", "Development", "Preparation", "On Hold", "Not Implemented"]


async def _fee_allowed(user):
    return user.get("permissions", {}).get("view_fee", True)


def _strip_fee(obj, allowed):
    """Sembunyikan informasi fee bila akses dibatasi."""
    if allowed:
        return obj
    def scrub(o):
        if isinstance(o, dict):
            return {k: (None if k in ("fee", "revenue") else scrub(v)) for k, v in o.items()}
        if isinstance(o, list):
            return [scrub(v) for v in o]
        return o
    return scrub(obj)


@router.get("/meta/options")
async def meta_options(user: dict = Depends(get_current_user)):
    members = await db.members.find({}, {"_id": 0, "member_code": 1, "member_name": 1, "alias": 1, "member_type": 1, "status": 1}).sort("member_code", 1).to_list(500)
    products = await db.products.find({}, {"_id": 0, "product_code": 1, "product_name": 1, "category": 1, "is_cross_border": 1, "status": 1}).sort("product_code", 1).to_list(500)
    latest = await db.transactions.find_one({}, sort=[("period", -1)])
    earliest = await db.transactions.find_one({}, sort=[("period", 1)])
    fresh = await db.transactions.find_one({}, sort=[("updated_at", -1)])
    categories = await db.products.distinct("category")
    return {
        "members": members,
        "products": products,
        "categories": sorted(categories),
        "statuses": STATUSES,
        "period_min": earliest["period_ym"] if earliest else None,
        "period_max": latest["period_ym"] if latest else None,
        "data_updated_at": fresh["updated_at"].isoformat() if fresh and fresh.get("updated_at") else None,
        "agg_rule": {"single_side": "Issuer", "cross": "Issuer",
                     "deskripsi": "Position=All: Single Side memakai record Issuer; Cross dihitung sekali dari sisi Issuer."},
    }


async def _resolve_status_filter(f, status):
    """Bila filter status implementasi dipilih, batasi member ke yang punya status tsb."""
    if not status:
        return f
    q = {"status": status}
    if f.get("products"):
        q["product_code"] = {"$in": f["products"]}
    codes = await db.member_products.distinct("member_code", q)
    if f.get("members"):
        codes = [c for c in codes if c in f["members"]]
    f = dict(f)
    f["members"] = codes or ["__none__"]
    return f


@router.get("/overview")
async def overview(request: Request, user: dict = Depends(get_current_user)):
    qp = request.query_params
    f = parse_filters(qp)
    if not f.get("end"):
        latest = await db.transactions.find_one({}, sort=[("period", -1)])
        if latest:
            f["end"] = latest["period"]
            f["start"] = add_months(latest["period"], -11)
    f = await _resolve_status_filter(f, qp.get("status"))
    fee_ok = await _fee_allowed(user)

    cur = await totals(db, f)
    ps, pe = prev_equal_period(f["start"], f["end"])
    fprev = {**f, "start": ps, "end": pe}
    prev = await totals(db, fprev)

    vol_trend = await aggregate_series(db, f)
    member_rows = await aggregate(db, f, group="member_code")
    product_rows = await aggregate(db, f, group="product_code")
    member_prev = {r["_id"]: r for r in await aggregate(db, fprev, group="member_code")}

    total_members = await db.members.count_documents({})
    total_products = await db.products.count_documents({})
    mq = {}
    if f.get("members"):
        mq["member_code"] = {"$in": f["members"]}
    if f.get("products"):
        mq["product_code"] = {"$in": f["products"]}
    if qp.get("status"):
        mq["status"] = qp["status"]
    mp_status = await db.member_products.aggregate([
        {"$match": mq}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(None)
    live_members = len(await db.member_products.distinct("member_code", {**mq, "status": "Live"}))
    uat_members = len(await db.member_products.distinct("member_code", {**mq, "status": "UAT"}))

    def growth_of(r):
        p = member_prev.get(r["_id"])
        return pct_change(r["volume"], p["volume"] if p else 0)

    rows_sorted = sorted(member_rows, key=lambda r: -r["volume"])
    with_growth = [(r, growth_of(r)) for r in member_rows]
    growing = sorted([x for x in with_growth if x[1] is not None and x[1] > 0], key=lambda x: -x[1])[:5]
    declining = sorted([x for x in with_growth if x[1] is not None and x[1] < 0], key=lambda x: x[1])[:5]

    names = {m["member_code"]: m["member_name"] for m in await db.members.find({}, {"member_code": 1, "member_name": 1, "_id": 0}).to_list(500)}
    pnames = {p["product_code"]: p["product_name"] for p in await db.products.find({}, {"product_code": 1, "product_name": 1, "_id": 0}).to_list(500)}

    live_no_trx = await live_no_transactions(f["start"], f["end"])

    out = {
        "period_label": period_label(f["start"], f["end"]),
        "prev_label": period_label(ps, pe),
        "kpis": {
            "total_members": total_members,
            "total_products": total_products,
            "members_live": live_members,
            "members_uat": uat_members,
            "volume": cur["volume"],
            "nominal": cur["nominal"],
            "fee": cur["fee"] if fee_ok else None,
            "volume_growth_pct": pct_change(cur["volume"], prev["volume"]),
            "nominal_growth_pct": pct_change(cur["nominal"], prev["nominal"]),
            "fee_growth_pct": pct_change(cur["fee"], prev["fee"]) if fee_ok else None,
            "active_members": cur["active_members"],
        },
        "volume_trend": [{"period": r["period"], "volume": r["volume"]} for r in vol_trend],
        "nominal_fee_trend": [{"period": r["period"], "nominal": r["nominal"], "fee": r["fee"] if fee_ok else None} for r in vol_trend],
        "status_distribution": [{"status": s["_id"], "count": s["count"]} for s in mp_status],
        "top_members": [{"code": r["_id"], "name": names.get(r["_id"], r["_id"]), "volume": r["volume"], "nominal": r["nominal"], "fee": r["fee"] if fee_ok else None} for r in rows_sorted[:5]],
        "top_products": [{"code": r["_id"], "name": pnames.get(r["_id"], r["_id"]), "volume": r["volume"], "nominal": r["nominal"], "fee": r["fee"] if fee_ok else None} for r in sorted(product_rows, key=lambda r: -r["volume"])[:5]],
        "growing_members": [{"code": r["_id"], "name": names.get(r["_id"], r["_id"]), "growth_pct": g, "volume": r["volume"]} for r, g in growing],
        "declining_members": [{"code": r["_id"], "name": names.get(r["_id"], r["_id"]), "growth_pct": g, "volume": r["volume"]} for r, g in declining],
        "live_no_trx": live_no_trx[:20],
        "live_no_trx_count": len(live_no_trx),
    }
    return out


# ---------- Matriks Mitra ----------

@router.get("/matrix")
async def matrix(request: Request, user: dict = Depends(get_current_user)):
    qp = request.query_params
    mq = {}
    if qp.get("product"):
        mq["product_code"] = {"$in": qp["product"].split(",")}
    if qp.get("status"):
        mq["status"] = qp["status"]
    if qp.get("position"):
        pos = qp["position"]
        mq["position"] = pos if pos != "Issuer & Acquirer" else "Issuer & Acquirer"
    mps = await db.member_products.find(mq, {"_id": 0}).to_list(10000)
    memq = {}
    if qp.get("search"):
        s = qp["search"]
        memq["$or"] = [{"member_name": {"$regex": s, "$options": "i"}},
                       {"member_code": {"$regex": s, "$options": "i"}},
                       {"alias": {"$regex": s, "$options": "i"}}]
    members = await db.members.find(memq, {"_id": 0}).sort("member_code", 1).to_list(500)
    if qp.get("status") or qp.get("product") or qp.get("position"):
        codes_in = {mp["member_code"] for mp in mps}
        members = [m for m in members if m["member_code"] in codes_in]
    products = await db.products.find({}, {"_id": 0}).sort("product_code", 1).to_list(500)
    if qp.get("product"):
        wanted = set(qp["product"].split(","))
        products = [p for p in products if p["product_code"] in wanted]

    cells = {}
    for mp in mps:
        cells.setdefault(mp["member_code"], {})[mp["product_code"]] = mp

    sort = qp.get("sort", "name")
    rows = []
    for m in members:
        mcells = cells.get(m["member_code"], {})
        live_n = sum(1 for c in mcells.values() if c["status"] == "Live")
        rows.append({"member": m, "cells": mcells, "live_count": live_n})
    if sort == "live_desc":
        rows.sort(key=lambda r: (-r["live_count"], r["member"]["member_code"]))
    else:
        rows.sort(key=lambda r: r["member"]["member_name"])

    all_codes = [m["member_code"] for m in members]
    all_mps = await db.member_products.find({"member_code": {"$in": all_codes}}, {"_id": 0}).to_list(10000)
    summary = {
        "total_members": len(members),
        "total_products": len(products),
        "live_combos": sum(1 for mp in all_mps if mp["status"] == "Live"),
        "uat_combos": sum(1 for mp in all_mps if mp["status"] == "UAT"),
        "issuer_members": len({mp["member_code"] for mp in all_mps if "Issuer" in mp["position"]}),
        "acquirer_members": len({mp["member_code"] for mp in all_mps if "Acquirer" in mp["position"]}),
    }
    for r in rows:
        for c in r["cells"].values():
            for k in ("status_date", "updated_at"):
                if isinstance(c.get(k), datetime):
                    c[k] = c[k].isoformat()
    return {"rows": rows, "products": products, "summary": summary}


@router.get("/matrix/cell")
async def matrix_cell(member: str, product: str, user: dict = Depends(get_current_user)):
    mp = await db.member_products.find_one({"member_code": member, "product_code": product}, {"_id": 0})
    if not mp:
        raise HTTPException(404, "Kombinasi member-produk tidak ditemukan")
    for k in ("status_date", "updated_at"):
        if isinstance(mp.get(k), datetime):
            mp[k] = mp[k].isoformat()
    return mp


class CellUpdate(__import__("pydantic").BaseModel):
    member_code: str
    product_code: str
    status: str | None = None
    position: str | None = None
    status_date: str | None = None
    pic: str | None = None
    notes: str | None = None


@router.put("/matrix/cell")
async def matrix_cell_update(body: CellUpdate, user: dict = Depends(require_roles("admin"))):
    mp = await db.member_products.find_one({"member_code": body.member_code, "product_code": body.product_code})
    if not mp:
        raise HTTPException(404, "Kombinasi member-produk tidak ditemukan")
    upd = {"updated_by": user["email"], "updated_at": now_utc()}
    if body.status:
        if body.status not in STATUSES:
            raise HTTPException(422, "Status tidak valid")
        upd["status"] = body.status
        upd["status_date"] = parse_ym(body.status_date) if body.status_date else now_utc()
    if body.position:
        if body.position not in ("Issuer", "Acquirer", "Issuer & Acquirer"):
            raise HTTPException(422, "Posisi tidak valid")
        upd["position"] = body.position
    if body.pic is not None:
        upd["pic"] = body.pic
    if body.notes is not None:
        upd["notes"] = body.notes
    prev = {k: (mp[k].isoformat() if isinstance(mp.get(k), datetime) else mp.get(k)) for k in ("status", "position", "pic", "notes")}
    await db.member_products.update_one({"_id": mp["_id"]}, {"$set": upd})
    await audit(user, "update_matrix_cell", "member_product", mp["_id"], prev=prev,
                new={k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in upd.items()})
    return {"message": "Sel matriks diperbarui"}


# ---------- Detail Member ----------

@router.get("/members/{code}")
async def member_detail(code: str, request: Request, user: dict = Depends(get_current_user)):
    m = await db.members.find_one({"member_code": code}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Member tidak ditemukan")
    qp = request.query_params
    f = parse_filters(qp)
    f["members"] = [code]
    if not f.get("end"):
        latest = await db.transactions.find_one({}, sort=[("period", -1)])
        if latest:
            f["end"] = latest["period"]
            f["start"] = add_months(latest["period"], -11)
    fee_ok = await _fee_allowed(user)

    cur = await totals(db, f)
    ps, pe = prev_equal_period(f["start"], f["end"])
    prev = await totals(db, {**f, "start": ps, "end": pe})
    trend = await aggregate_series(db, f)
    comp = await aggregate(db, f, group="product_code")
    pos_issuer = await totals(db, {**f, "position": "Issuer"})
    pos_acq = await totals(db, {**f, "position": "Acquirer"})

    mps = await db.member_products.find({"member_code": code}, {"_id": 0}).sort("product_code", 1).to_list(200)
    for mp in mps:
        for k in ("status_date", "updated_at"):
            if isinstance(mp.get(k), datetime):
                mp[k] = mp[k].isoformat()
    all_products = await db.products.find({}, {"_id": 0}).sort("product_code", 1).to_list(500)
    adopted = {mp["product_code"] for mp in mps if mp["status"] not in ("Not Implemented",)}

    T = await get_thresholds()
    indicators = []
    zero = await live_no_transactions(f["start"], f["end"], member=code)
    for z in zero:
        indicators.append({"type": "Perhatian", "title": f"{z['product_name']} Live tanpa transaksi",
                           "detail": f"Produk {z['product_name']} berstatus Live namun tidak ada transaksi pada {period_label(f['start'], f['end'])}."})
    vg = pct_change(cur["volume"], prev["volume"])
    if vg is not None and vg <= T["decline_significant_pct"]:
        indicators.append({"type": "Perhatian", "title": "Volume transaksi menurun",
                           "detail": f"Volume turun {abs(vg):.1f}% dibanding periode sebelumnya ({period_label(ps, pe)})."})
    now = now_utc()
    for mp in mps:
        if mp["status"] == "UAT" and mp.get("status_date"):
            sd = datetime.fromisoformat(mp["status_date"]) if isinstance(mp["status_date"], str) else mp["status_date"]
            if sd.tzinfo is None:
                sd = sd.replace(tzinfo=timezone.utc)
            if (now - sd).days > T["uat_max_days"]:
                indicators.append({"type": "Perhatian", "title": f"{mp['product_name']} UAT melewati batas waktu",
                                   "detail": f"Status UAT sejak {sd.strftime('%d/%m/%Y')} ({(now - sd).days} hari, ambang {T['uat_max_days']} hari)."})
    popular = await db.member_products.aggregate([
        {"$match": {"status": "Live"}},
        {"$group": {"_id": "$product_code", "n": {"$sum": 1}}}]).to_list(None)
    total_members = await db.members.count_documents({})
    for p in popular:
        if p["n"] >= 0.6 * total_members and p["_id"] not in adopted:
            pname = next((x["product_name"] for x in all_products if x["product_code"] == p["_id"]), p["_id"])
            indicators.append({"type": "Peluang", "title": f"Belum mengadopsi {pname}",
                               "detail": f"{pname} telah Live di {p['n']} dari {total_members} member."})
    if cur["volume"] > 0 and comp:
        top = max(comp, key=lambda r: r["volume"])
        share = top["volume"] / cur["volume"] * 100
        if share >= T["product_concentration_pct"]:
            indicators.append({"type": "Perhatian", "title": "Ketergantungan tinggi pada satu produk",
                               "detail": f"{top['_id']} menyumbang {share:.0f}% dari total volume member (ambang {T['product_concentration_pct']}%)."})

    if isinstance(m.get("created_at"), datetime):
        m["created_at"] = m["created_at"].isoformat()
    latest_upd = await db.transactions.find_one({"member_code": code}, sort=[("updated_at", -1)])
    out = {
        "member": m,
        "last_data_update": latest_upd["updated_at"].isoformat() if latest_upd and latest_upd.get("updated_at") else None,
        "products": mps,
        "performance": {
            "period_label": period_label(f["start"], f["end"]),
            "prev_label": period_label(ps, pe),
            "volume": cur["volume"], "nominal": cur["nominal"], "fee": cur["fee"] if fee_ok else None,
            "volume_growth_pct": vg,
            "nominal_growth_pct": pct_change(cur["nominal"], prev["nominal"]),
            "fee_growth_pct": pct_change(cur["fee"], prev["fee"]) if fee_ok else None,
            "avg_value": cur["avg_value"],
            "trend": trend if fee_ok else [{**r, "fee": None} for r in trend],
            "composition": [{"product_code": r["_id"], "volume": r["volume"], "nominal": r["nominal"],
                             "fee": r["fee"] if fee_ok else None,
                             "share_pct": (r["volume"] / cur["volume"] * 100) if cur["volume"] else 0}
                            for r in sorted(comp, key=lambda r: -r["volume"])],
            "issuer": pos_issuer if fee_ok else {**pos_issuer, "fee": None},
            "acquirer": pos_acq if fee_ok else {**pos_acq, "fee": None},
        },
        "indicators": indicators,
    }
    return out


# ---------- Rekap Transaksi ----------

@router.get("/transactions/summary")
async def trx_summary(request: Request, user: dict = Depends(get_current_user)):
    f = parse_filters(request.query_params)
    if not f.get("end"):
        latest = await db.transactions.find_one({}, sort=[("period", -1)])
        if latest:
            f["end"] = latest["period"]; f["start"] = add_months(latest["period"], -11)
    fee_ok = await _fee_allowed(user)
    cur = await totals(db, f)
    ps, pe = prev_equal_period(f["start"], f["end"])
    prev = await totals(db, {**f, "start": ps, "end": pe})
    return {
        "period_label": period_label(f["start"], f["end"]),
        "prev_label": period_label(ps, pe),
        "kpis": {
            "active_members": cur["active_members"],
            "volume": cur["volume"], "nominal": cur["nominal"],
            "fee": cur["fee"] if fee_ok else None,
            "avg_value": cur["avg_value"],
            "volume_growth_pct": pct_change(cur["volume"], prev["volume"]),
            "nominal_growth_pct": pct_change(cur["nominal"], prev["nominal"]),
            "fee_growth_pct": pct_change(cur["fee"], prev["fee"]) if fee_ok else None,
        },
    }


@router.get("/transactions/series")
async def trx_series(request: Request, user: dict = Depends(get_current_user)):
    f = parse_filters(request.query_params)
    if not f.get("end"):
        latest = await db.transactions.find_one({}, sort=[("period", -1)])
        if latest:
            f["end"] = latest["period"]; f["start"] = add_months(latest["period"], -11)
    fee_ok = await _fee_allowed(user)
    rows = await aggregate_series(db, f)
    if not fee_ok:
        for r in rows:
            r["fee"] = None
    return {"series": rows}


@router.get("/transactions/breakdown")
async def trx_breakdown(request: Request, dimension: str = "product", user: dict = Depends(get_current_user)):
    dim_field = {"product": "product_code", "member": "member_code", "position": "position",
                 "agg": "aggregation_type", "category": "product_category", "border": "product_border"}.get(dimension)
    if not dim_field:
        raise HTTPException(422, "Dimensi tidak valid")
    f = parse_filters(request.query_params)
    if dimension == "position" and f.get("position") == "All":
        f["position"] = "Raw"  # distribusi issuer vs acquirer butuh kedua sisi
    if not f.get("end"):
        latest = await db.transactions.find_one({}, sort=[("period", -1)])
        if latest:
            f["end"] = latest["period"]; f["start"] = add_months(latest["period"], -11)
    fee_ok = await _fee_allowed(user)
    rows = await aggregate(db, f, group=dim_field)
    tot = sum(r["volume"] for r in rows) or 1
    return {"rows": [{"key": r["_id"], "volume": r["volume"], "nominal": r["nominal"],
                      "fee": r["fee"] if fee_ok else None,
                      "share_pct": r["volume"] / tot * 100} for r in sorted(rows, key=lambda r: -r["volume"])]}


@router.get("/transactions/table")
async def trx_table(request: Request, page: int = 1, page_size: int = 25,
                    sort_by: str = "period", sort_dir: str = "desc",
                    user: dict = Depends(get_current_user)):
    f = parse_filters(request.query_params)
    match = build_match(f)
    allowed_sort = {"period": "period", "member_name": "member_name", "product_name": "product_name",
                    "volume": "volume", "nominal": "nominal", "fee": "fee", "position": "position"}
    sf = allowed_sort.get(sort_by, "period")
    sd = -1 if sort_dir == "desc" else 1
    total = await db.transactions.count_documents(match)
    cur = db.transactions.find(match, {"_id": 0}).sort(sf, sd).skip((page - 1) * page_size).limit(min(page_size, 200))
    rows = await cur.to_list(None)
    fee_ok = await _fee_allowed(user)
    for r in rows:
        if isinstance(r.get("period"), datetime):
            r["period"] = r["period"].isoformat()
        if isinstance(r.get("updated_at"), datetime):
            r["updated_at"] = r["updated_at"].isoformat()
        if not fee_ok:
            r["fee"] = None
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


# ---------- Export Excel ----------

def _xlsx_response(wb: Workbook, filename: str):
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/export/matrix.xlsx")
async def export_matrix(request: Request, user: dict = Depends(get_current_user)):
    data = await matrix(request, user)
    wb = Workbook()
    ws = wb.active
    ws.title = "Matriks Mitra"
    ws.append(["Kode Member", "Nama Member"] + [p["product_name"] for p in data["products"]])
    for r in data["rows"]:
        row = [r["member"]["member_code"], r["member"]["member_name"]]
        for p in data["products"]:
            c = r["cells"].get(p["product_code"])
            row.append(c["status"] if c else "-")
        ws.append(row)
    await audit(user, "export_excel", "matrix", "-", new={"filters": dict(request.query_params)})
    return _xlsx_response(wb, "matriks-mitra.xlsx")


@router.get("/export/transactions.xlsx")
async def export_trx(request: Request, user: dict = Depends(get_current_user)):
    f = parse_filters(request.query_params)
    match = build_match(f)
    fee_ok = await _fee_allowed(user)
    rows = await db.transactions.find(match, {"_id": 0}).sort("period", 1).limit(50000).to_list(None)
    wb = Workbook()
    ws = wb.active
    ws.title = "Rekap Transaksi"
    header = ["Periode", "Kode Member", "Nama Member", "Produk", "Posisi", "Tipe Agregasi", "Volume", "Nominal (Rp)"]
    if fee_ok:
        header.append("Fee (Rp)")
    ws.append(header)
    for r in rows:
        row = [r["period_ym"], r["member_code"], r["member_name"], r["product_name"],
               r["position"], r["aggregation_type"], r["volume"], r["nominal"]]
        if fee_ok:
            row.append(r["fee"])
        ws.append(row)
    await audit(user, "export_excel", "transactions", "-", new={"rows": len(rows)})
    return _xlsx_response(wb, "rekap-transaksi.xlsx")
