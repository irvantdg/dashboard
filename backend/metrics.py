"""Lapisan metrik terpusat: agregasi, periode pembanding, pertumbuhan.
Semua perhitungan MoM/YoY/YTD/QoQ/rolling/rata-rata HANYA dilakukan di sini.
Aturan anti-double-counting diisolasi di AGGREGATION_RULE agar mudah diubah."""
from datetime import datetime, timezone

# Aturan agregasi saat Position = "All":
# - Transaksi Single Side: gunakan record sisi Issuer
# - Transaksi Cross: hitung sekali, gunakan sisi yang dikonfigurasi di sini
AGGREGATION_RULE = {
    "single_side_position": "Issuer",
    "cross_position": "Issuer",
}


def parse_ym(s: str) -> datetime:
    y, m = s.split("-")[:2]
    return datetime(int(y), int(m), 1, tzinfo=timezone.utc)


def ym(d: datetime) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def add_months(d: datetime, n: int) -> datetime:
    m = d.month - 1 + n
    return datetime(d.year + m // 12, m % 12 + 1, 1, tzinfo=timezone.utc)


def quarter_start(d: datetime) -> datetime:
    return datetime(d.year, ((d.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)


def build_match(f: dict) -> dict:
    """Bangun query Mongo dari filter; menerapkan aturan anti-double-counting."""
    match = {}
    if f.get("start"):
        match.setdefault("period", {})["$gte"] = f["start"]
    if f.get("end"):
        match.setdefault("period", {})["$lte"] = f["end"]
    if f.get("members"):
        match["member_code"] = {"$in": f["members"]}
    if f.get("products"):
        match["product_code"] = {"$in": f["products"]}
    if f.get("category"):
        match["product_category"] = f["category"]
    pos = f.get("position", "All")
    agg = f.get("agg_type")
    if pos == "Raw":
        # Tanpa pembatas posisi (mis. grafik distribusi issuer vs acquirer)
        if agg:
            match["aggregation_type"] = agg
    elif pos in ("Issuer", "Acquirer"):
        match["position"] = pos
        if agg:
            match["aggregation_type"] = agg
    else:
        types = [agg] if agg else ["Single Side", "Cross"]
        match["$or"] = [
            {"aggregation_type": t,
             "position": AGGREGATION_RULE["single_side_position"] if t == "Single Side" else AGGREGATION_RULE["cross_position"]}
            for t in types
        ]
    return match


async def aggregate(db, f: dict, group: str | None = None):
    """Agregasi volume/nominal/fee. group: nama field (mis. 'member_code')."""
    pipeline = [{"$match": build_match(f)}]
    pipeline.append({"$group": {
        "_id": f"${group}" if group else None,
        "volume": {"$sum": "$volume"},
        "nominal": {"$sum": "$nominal"},
        "fee": {"$sum": "$fee"},
        "members": {"$addToSet": "$member_code"},
        "products": {"$addToSet": "$product_code"},
    }})
    return await db.transactions.aggregate(pipeline).to_list(None)


async def aggregate_series(db, f: dict):
    rows = await aggregate(db, f, group="period_ym")
    rows.sort(key=lambda r: r["_id"] or "")
    return [{"period": r["_id"], "volume": r["volume"], "nominal": r["nominal"], "fee": r["fee"]} for r in rows]


def totals_from(row: dict | None) -> dict:
    if not row:
        return {"volume": 0, "nominal": 0, "fee": 0, "active_members": 0, "trx_products": 0, "avg_value": 0}
    vol = row["volume"] or 0
    return {
        "volume": vol,
        "nominal": row["nominal"] or 0,
        "fee": row["fee"] or 0,
        "active_members": len(row.get("members") or []),
        "trx_products": len(row.get("products") or []),
        "avg_value": (row["nominal"] / vol) if vol else 0,
    }


async def totals(db, f: dict) -> dict:
    rows = await aggregate(db, f)
    return totals_from(rows[0] if rows else None)


def pct_change(cur: float, prev: float):
    """None berarti tidak dapat dibandingkan (pembanding nol/tidak ada)."""
    if prev is None or prev == 0:
        return None
    return (cur - prev) / abs(prev) * 100


def direction(pct):
    if pct is None:
        return "tidak-dapat-dibandingkan"
    if pct > 0.05:
        return "naik"
    if pct < -0.05:
        return "turun"
    return "tetap"


MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
             "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def period_label(start: datetime, end: datetime) -> str:
    if start == end:
        return f"{MONTHS_ID[start.month - 1]} {start.year}"
    return f"{MONTHS_ID[start.month - 1]} {start.year} – {MONTHS_ID[end.month - 1]} {end.year}"


def comparison_periods(mode: str, p: dict) -> dict:
    """Kembalikan periode berjalan (A) dan pembanding (B) untuk mode perbandingan.
    avg_divisor > 1 berarti nilai B adalah rata-rata bulanan."""
    if mode in ("mom", "yoy", "avg"):
        m = parse_ym(p["month"])
        a = (m, m)
        if mode == "mom":
            b = (add_months(m, -1), add_months(m, -1)); div = 1
        elif mode == "yoy":
            b = (add_months(m, -12), add_months(m, -12)); div = 1
        else:
            n = int(p.get("avg_n", 3))
            b = (add_months(m, -n), add_months(m, -1)); div = n
    elif mode in ("ytd", "ytd_yoy"):
        m = parse_ym(p["month"])
        a = (datetime(m.year, 1, 1, tzinfo=timezone.utc), m)
        if mode == "ytd":
            b = (None, None); div = 1
        else:
            b = (datetime(m.year - 1, 1, 1, tzinfo=timezone.utc), add_months(m, -12)); div = 1
    elif mode in ("qoq", "qoq_yoy"):
        q = quarter_start(parse_ym(p["month"]))
        a = (q, add_months(q, 2))
        b = (add_months(q, -3), add_months(q, -1)) if mode == "qoq" else (add_months(q, -12), add_months(q, -10))
        div = 1
    elif mode == "custom":
        a = (parse_ym(p["a_start"]), parse_ym(p["a_end"]))
        b = (parse_ym(p["b_start"]), parse_ym(p["b_end"])); div = 1
    elif mode == "rolling":
        n = int(p.get("rolling_n", 3))
        m = parse_ym(p["month"])
        a = (add_months(m, -(n - 1)), m)
        b = (add_months(m, -(2 * n - 1)), add_months(m, -n)); div = 1
    else:
        raise ValueError("Mode perbandingan tidak dikenal")
    out = {
        "a_start": a[0], "a_end": a[1],
        "b_start": b[0], "b_end": b[1],
        "label_a": period_label(*a) if a[0] else "-",
        "label_b": period_label(*b) if b[0] else "Tidak ada pembanding",
        "avg_divisor": div,
        "period_type": "Bulanan" if a[0] == a[1] else "Kumulatif",
    }
    return out


def prev_equal_period(start: datetime, end: datetime):
    """Periode sebelumnya dengan panjang sama (untuk growth KPI umum)."""
    n = (end.year - start.year) * 12 + (end.month - start.month) + 1
    return add_months(start, -n), add_months(end, -n)
