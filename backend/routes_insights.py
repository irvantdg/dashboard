"""Rute Management Insights: perbandingan periode, driver, kartu insight,
kuadran, heatmap, benchmark, tampilan tersimpan, threshold."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user, require_roles
from common import audit, db, get_thresholds, new_id, now_utc, parse_filters, DEFAULT_THRESHOLDS
from insights_engine import (driver_analysis, generate_insights, live_no_transactions,
                             member_product_concentration)
from metrics import (add_months, aggregate, aggregate_series, comparison_periods,
                     direction, parse_ym, pct_change, period_label, totals, ym)

router = APIRouter(prefix="/api", tags=["insights"])


def _safe_pct(cur, prev):
    p = pct_change(cur, prev)
    return {"value": cur, "comparison": prev, "abs": (cur - prev) if prev is not None else None,
            "pct": p, "direction": direction(p),
            "comparable": prev is not None and prev != 0,
            "note": None if (prev is not None and prev != 0) else "Tidak dapat dibandingkan: nilai pembanding nol atau tidak tersedia"}


@router.get("/insights")
async def insights(request: Request, user: dict = Depends(get_current_user)):
    qp = request.query_params
    mode = qp.get("mode", "mom")
    try:
        periods = comparison_periods(mode, qp)
    except (KeyError, ValueError) as e:
        raise HTTPException(422, f"Parameter periode tidak lengkap/valid: {e}")

    base = parse_filters(qp)
    fA = {**base, "start": periods["a_start"], "end": periods["a_end"]}
    has_b = periods["b_start"] is not None
    fB = {**base, "start": periods["b_start"], "end": periods["b_end"]} if has_b else None

    tA = await totals(db, fA)
    tB_raw = await totals(db, fB) if fB else None
    div = periods["avg_divisor"]
    if tB_raw and div > 1:
        tB = {**tB_raw, "volume": tB_raw["volume"] / div, "nominal": tB_raw["nominal"] / div,
              "fee": tB_raw["fee"] / div}
    else:
        tB = tB_raw

    metric = qp.get("metric", "volume")
    if metric not in ("volume", "nominal", "fee"):
        metric = "volume"

    drivers = await driver_analysis(fA, fB, metric)
    member_rows = drivers["member"]["rows"]
    product_rows = drivers["product"]["rows"]
    position_rows = drivers["position"]["rows"]

    T = await get_thresholds()
    cards = await generate_insights(fA, fB, tA, tB, member_rows, product_rows, position_rows, T,
                                    periods["label_a"], periods["label_b"])

    # Insight: produk Live tanpa transaksi
    zero = await live_no_transactions(periods["a_start"], periods["a_end"])
    if zero:
        cards.append({
            "id": "live-no-trx", "title": f"{len(zero)} kombinasi Live tanpa transaksi",
            "text": f"Terdapat {len(zero)} kombinasi member-produk berstatus Live tanpa transaksi pada {periods['label_a']}, mis. {zero[0]['member_name']} – {zero[0]['product_name']}.",
            "metric": "Aktivitas", "current": len(zero), "comparison": None,
            "change_abs": None, "change_pct": None, "severity": "Perhatian",
            "link": "/matriks",
            "rule": "Aturan: status implementasi = Live dan volume = 0 pada periode berjalan.",
            "contributors": [{"name": f"{z['member_alias']} – {z['product_code']}", "value": 0, "pct": None} for z in zero[:5]],
            "disclaimer": "Indikator otomatis berbasis aturan; bukan kesimpulan kausal.",
        })

    # Insight: konsentrasi produk per member
    conc = await member_product_concentration(fA, T)
    if conc:
        top = conc[0]
        cards.append({
            "id": "member-conc", "title": f"Aktivitas {top['member_code']} terkonsentrasi pada satu produk",
            "text": f"{top['share_pct']:.0f}% volume {top['member_code']} berasal dari produk {top['product_code']} (ambang {T['product_concentration_pct']}%).",
            "metric": "Konsentrasi", "current": top["share_pct"], "comparison": T["product_concentration_pct"],
            "change_abs": None, "change_pct": None, "severity": "Perhatian",
            "link": f"/member/{top['member_code']}",
            "rule": f"Aturan: pangsa produk terbesar dalam volume member ≥ {T['product_concentration_pct']}%.",
            "contributors": [{"name": c["member_code"], "value": c["share_pct"], "pct": None} for c in conc[:5]],
            "disclaimer": "Indikator otomatis berbasis aturan; bukan kesimpulan kausal.",
        })

    # Minimum materiality filter
    min_mat = float(qp.get("min_materiality", 0))
    if min_mat > 0:
        cards = [c for c in cards if c["change_pct"] is None or abs(c["change_pct"]) >= min_mat]

    # Tren kedua periode (per bulan)
    seriesA = await aggregate_series(db, fA)
    seriesB = await aggregate_series(db, fB) if fB else []

    # Waterfall dari driver member (rekonsiliasi dengan total perubahan)
    wd = drivers["member"]
    rest = wd["total_diff"] - sum(r["diff"] for r in wd["positive"]) - sum(r["diff"] for r in wd["negative"])
    waterfall = ([{"name": r["key"], "value": r["diff"]} for r in wd["positive"]] +
                 [{"name": r["key"], "value": r["diff"]} for r in wd["negative"]])
    if abs(rest) > 0:
        waterfall.append({"name": "Lainnya", "value": rest})
    waterfall.append({"name": "Total Perubahan", "value": wd["total_diff"], "total": True})

    # Kuadran pertumbuhan vs kontribusi (per member, metrik terpilih)
    n_act = max(len([r for r in member_rows if r[f"a_{metric}"] > 0]), 1)
    avg_share = 100 / n_act
    quadrant = []
    for r in member_rows:
        share = (r[f"a_{metric}"] / drivers["total"]["a"] * 100) if drivers["total"]["a"] else 0
        g = r["change_pct"]
        high_g = g is not None and g >= T["material_change_pct"]
        high_c = share >= avg_share
        if g is None:
            cat = "Data Pembanding Tidak Ada"
        elif high_g and high_c:
            cat = "Pertumbuhan Strategis"
        elif not high_g and high_c:
            cat = "Lindungi & Pantau"
        elif high_g and not high_c:
            cat = "Peluang Baru"
        else:
            cat = "Prioritas Tinjauan"
        quadrant.append({"member": r["key"], "growth_pct": g, "share_pct": share, "category": cat,
                         "a_value": r[f"a_{metric}"], "b_value": r[f"b_{metric}"]})

    # Heatmap member × produk (pertumbuhan % metrik terpilih)
    top_members = [r["key"] for r in sorted(member_rows, key=lambda r: -r[f"a_{metric}"])[:12]]
    top_products = [r["key"] for r in sorted(product_rows, key=lambda r: -r[f"a_{metric}"])[:12]]
    if top_members and top_products:
        from metrics import build_match
        mpA = await db.transactions.aggregate([
            {"$match": {**build_match(fA), "member_code": {"$in": top_members}, "product_code": {"$in": top_products}}},
            {"$group": {"_id": {"m": "$member_code", "p": "$product_code"}, "v": {"$sum": f"${metric}"}}}]).to_list(None)
        mpB = await db.transactions.aggregate([
            {"$match": {**build_match(fB), "member_code": {"$in": top_members}, "product_code": {"$in": top_products}}},
            {"$group": {"_id": {"m": "$member_code", "p": "$product_code"}, "v": {"$sum": f"${metric}"}}}]).to_list(None) if fB else []
        amap = {(r["_id"]["m"], r["_id"]["p"]): r["v"] for r in mpA}
        bmap = {(r["_id"]["m"], r["_id"]["p"]): r["v"] for r in mpB}
        heatmap = {"members": top_members, "products": top_products,
                   "cells": [{"member": m, "product": p, "a": amap.get((m, p), 0),
                              "b": bmap.get((m, p), 0),
                              "growth_pct": pct_change(amap.get((m, p), 0), bmap.get((m, p), 0))}
                             for m in top_members for p in top_products]}
    else:
        heatmap = {"members": [], "products": [], "cells": []}

    # Benchmark member/produk vs rata-rata
    benchmark = None
    bm_member = qp.get("benchmark_member")
    bm_product = qp.get("benchmark_product")
    if bm_member:
        sel = next((r for r in member_rows if r["key"] == bm_member), None)
        if sel and member_rows:
            n = len(member_rows)
            benchmark = {"type": "member", "key": bm_member,
                         "a_value": sel[f"a_{metric}"],
                         "avg_value": sum(r[f"a_{metric}"] for r in member_rows) / n,
                         "share_pct": (sel[f"a_{metric}"] / drivers["total"]["a"] * 100) if drivers["total"]["a"] else 0,
                         "growth_pct": sel["change_pct"]}
    elif bm_product:
        sel = next((r for r in product_rows if r["key"] == bm_product), None)
        if sel and product_rows:
            n = len(product_rows)
            benchmark = {"type": "product", "key": bm_product,
                         "a_value": sel[f"a_{metric}"],
                         "avg_value": sum(r[f"a_{metric}"] for r in product_rows) / n,
                         "share_pct": (sel[f"a_{metric}"] / drivers["total"]["a"] * 100) if drivers["total"]["a"] else 0,
                         "growth_pct": sel["change_pct"]}

    # Produk live & produk aktif bertransaksi (KPI tambahan)
    live_products = await db.member_products.distinct("product_code", {"status": "Live"})

    return {
        "mode": mode,
        "periods": {"label_a": periods["label_a"], "label_b": periods["label_b"],
                    "a_start": ym(periods["a_start"]), "a_end": ym(periods["a_end"]),
                    "b_start": ym(periods["b_start"]) if periods["b_start"] else None,
                    "b_end": ym(periods["b_end"]) if periods["b_end"] else None,
                    "period_type": periods["period_type"],
                    "avg_note": f"Periode pembanding adalah rata-rata bulanan {div} bulan." if div > 1 else None},
        "kpis": {
            "volume": _safe_pct(tA["volume"], tB["volume"] if tB else None),
            "nominal": _safe_pct(tA["nominal"], tB["nominal"] if tB else None),
            "fee": _safe_pct(tA["fee"], tB["fee"] if tB else None),
            "active_members": _safe_pct(tA["active_members"], tB["active_members"] if tB else None),
            "avg_value": _safe_pct(tA["avg_value"], tB["avg_value"] if tB else None),
            "live_products": {"value": len(live_products), "comparison": None, "abs": None, "pct": None,
                              "direction": "tetap", "comparable": False, "note": "Jumlah produk berstatus Live (bukan perbandingan)"},
            "trx_products": _safe_pct(tA["trx_products"], tB["trx_products"] if tB else None),
        },
        "insights": cards,
        "drivers": {
            "metric": metric,
            "total": drivers["total"],
            "member": {"positive": drivers["member"]["positive"], "negative": drivers["member"]["negative"], "reconciled": drivers["member"]["reconciled"]},
            "product": {"positive": drivers["product"]["positive"], "negative": drivers["product"]["negative"], "reconciled": drivers["product"]["reconciled"]},
            "position": {"positive": drivers["position"]["positive"], "negative": drivers["position"]["negative"], "reconciled": drivers["position"]["reconciled"]},
            "border": {"positive": drivers["border"]["positive"], "negative": drivers["border"]["negative"], "reconciled": drivers["border"]["reconciled"]},
        },
        "waterfall": waterfall,
        "trend": {"a": seriesA, "b": seriesB},
        "quadrant": quadrant,
        "heatmap": heatmap,
        "benchmark": benchmark,
        "thresholds_used": T,
    }


# ---------- Threshold (Admin) ----------

@router.get("/config/thresholds")
async def get_cfg(user: dict = Depends(get_current_user)):
    return {"thresholds": await get_thresholds(), "defaults": DEFAULT_THRESHOLDS}


class ThresholdBody(BaseModel):
    values: dict


@router.put("/config/thresholds")
async def put_cfg(body: ThresholdBody, user: dict = Depends(require_roles("admin"))):
    clean = {k: float(v) for k, v in body.values.items() if k in DEFAULT_THRESHOLDS}
    prev = await get_thresholds()
    await db.config.update_one({"_id": "thresholds"},
                               {"$set": {"values": clean, "updated_by": user["email"], "updated_at": now_utc()}},
                               upsert=True)
    await audit(user, "update_thresholds", "config", "thresholds", prev=prev, new=clean)
    return {"thresholds": await get_thresholds()}


# ---------- Tampilan Tersimpan ----------

class SavedViewBody(BaseModel):
    name: str
    params: dict
    is_default: bool = False


@router.get("/saved-views")
async def list_views(user: dict = Depends(get_current_user)):
    rows = await db.saved_views.find({"user_email": user["email"]}).to_list(100)
    return {"views": [{"id": str(r["_id"]), "name": r["name"], "params": r["params"],
                       "is_default": r.get("is_default", False),
                       "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at")}
                      for r in rows]}


@router.post("/saved-views")
async def create_view(body: SavedViewBody, user: dict = Depends(get_current_user)):
    if body.is_default:
        await db.saved_views.update_many({"user_email": user["email"]}, {"$set": {"is_default": False}})
    doc = {"user_email": user["email"], "name": body.name.strip()[:80], "params": body.params,
           "is_default": body.is_default, "created_at": now_utc()}
    res = await db.saved_views.insert_one(doc)
    await audit(user, "save_view", "saved_view", str(res.inserted_id), new={"name": body.name})
    return {"id": str(res.inserted_id)}


@router.delete("/saved-views/{vid}")
async def delete_view(vid: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId
    res = await db.saved_views.delete_one({"_id": ObjectId(vid), "user_email": user["email"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Tampilan tidak ditemukan")
    return {"message": "Tampilan dihapus"}


@router.put("/saved-views/{vid}/default")
async def default_view(vid: str, user: dict = Depends(get_current_user)):
    from bson import ObjectId
    await db.saved_views.update_many({"user_email": user["email"]}, {"$set": {"is_default": False}})
    res = await db.saved_views.update_one({"_id": ObjectId(vid), "user_email": user["email"]},
                                          {"$set": {"is_default": True}})
    if res.matched_count == 0:
        raise HTTPException(404, "Tampilan tidak ditemukan")
    return {"message": "Tampilan default diperbarui"}
