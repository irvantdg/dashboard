"""Mesin insight berbasis aturan + analisis driver untuk Management Insights.
Semua aturan transparan, memakai threshold dari konfigurasi database,
dan tidak pernah mengklaim kausalitas."""
from common import db
from metrics import aggregate, direction, pct_change, totals


def _driver_rows(A, B):
    amap = {r["_id"]: r for r in A}
    bmap = {r["_id"]: r for r in B}
    keys = set(amap) | set(bmap)
    rows = []
    for k in keys:
        a, b = amap.get(k), bmap.get(k)
        rows.append({
            "key": k,
            "a_volume": a["volume"] if a else 0,
            "b_volume": b["volume"] if b else 0,
            "a_nominal": a["nominal"] if a else 0,
            "b_nominal": b["nominal"] if b else 0,
            "a_fee": a["fee"] if a else 0,
            "b_fee": b["fee"] if b else 0,
        })
    return rows


def _with_diff(rows, metric):
    for r in rows:
        r["diff"] = r[f"a_{metric}"] - r[f"b_{metric}"]
        r["change_pct"] = pct_change(r[f"a_{metric}"], r[f"b_{metric}"])
    return rows


def top_drivers(rows, total_diff, metric, n=5):
    """Top n positif & negatif; contribution_pct terhadap total perubahan (rekonsiliasi)."""
    for r in rows:
        r["contribution_pct"] = (r["diff"] / total_diff * 100) if total_diff else None
    pos = sorted([r for r in rows if r["diff"] > 0], key=lambda r: -r["diff"])[:n]
    neg = sorted([r for r in rows if r["diff"] < 0], key=lambda r: r["diff"])[:n]
    return {"positive": pos, "negative": neg,
            "total_diff": total_diff,
            "reconciled": abs(sum(r["diff"] for r in rows) - total_diff) < 1e-6}


async def driver_analysis(fA, fB, metric="volume"):
    out = {}
    A_all = await aggregate(db, fA)
    B_all = await aggregate(db, fB) if fB else []
    total_a = A_all[0][metric] if A_all else 0
    total_b = B_all[0][metric] if B_all else 0
    total_diff = total_a - total_b
    dims = {"member": "member_code", "product": "product_code",
            "position": "position", "border": "product_border"}
    for name, field in dims.items():
        A = await aggregate(db, fA, group=field)
        B = await aggregate(db, fB, group=field) if fB else []
        rows = _with_diff(_driver_rows(A, B), metric)
        out[name] = {"rows": rows, **top_drivers(rows, total_diff, metric)}
    out["total"] = {"a": total_a, "b": total_b, "diff": total_diff,
                    "change_pct": pct_change(total_a, total_b)}
    return out


def _insight(iid, title, text, metric, cur, comp, severity, link, rule, contributors=None):
    return {
        "id": iid, "title": title, "text": text, "metric": metric,
        "current": cur, "comparison": comp,
        "change_abs": (cur - comp) if comp is not None else None,
        "change_pct": pct_change(cur, comp) if comp else None,
        "severity": severity, "link": link, "rule": rule,
        "contributors": contributors or [],
        "disclaimer": "Indikator otomatis berbasis aturan; menunjukkan korelasi data, bukan kesimpulan kausal atau rekomendasi final.",
    }


async def generate_insights(fA, fB, tA, tB, member_rows, product_rows, position_rows, T, month_a_label="", month_b_label=""):
    """Hasilkan kartu insight berbasis aturan. tA/tB: dict totals. T: thresholds."""
    cards = []
    g_sig, d_sig = T["growth_significant_pct"], T["decline_significant_pct"]
    mat = T["material_change_pct"]

    vA, vB = tA["volume"], tB["volume"] if tB else None
    nA, nB = tA["nominal"], tB["nominal"] if tB else None
    fAe, fBe = tA["fee"], tB["fee"] if tB else None

    if vB:
        pv, pn, pf = pct_change(vA, vB), pct_change(nA, nB), pct_change(fAe, fBe)

        if pv is not None and abs(pv) >= mat and vA >= T["min_volume_insight"]:
            sev = "Informasi" if pv >= g_sig else ("Perhatian" if pv <= d_sig else "Informasi")
            cards.append(_insight(
                "vol-change",
                f"Volume transaksi {'naik' if pv > 0 else 'turun'} {abs(pv):.1f}%",
                f"Total volume {month_a_label} sebesar {vA:,.0f} transaksi, {'naik' if pv > 0 else 'turun'} {abs(pv):.1f}% dibanding {month_b_label}.",
                "Volume", vA, vB, sev, "/transaksi",
                f"Aturan: |perubahan volume| ≥ {mat}% dan volume ≥ {T['min_volume_insight']:,.0f}."))

        if pn is not None and pv is not None and pn > mat and pv < -mat:
            cards.append(_insight(
                "nom-up-vol-down", "Nominal naik saat volume turun",
                f"Nominal naik {pn:.1f}% namun volume turun {abs(pv):.1f}% — nilai rata-rata per transaksi meningkat.",
                "Nominal", nA, nB, "Perhatian", "/transaksi",
                f"Aturan: pertumbuhan nominal > {mat}% dan pertumbuhan volume < -{mat}%."))

        if pf is not None and pv is not None and pv > mat and pf < pv - mat:
            cards.append(_insight(
                "fee-lag", "Pertumbuhan revenue lebih rendah dari volume",
                f"Revenue tumbuh {pf:.1f}% sementara volume tumbuh {pv:.1f}% — efektivitas fee per transaksi menurun.",
                "Revenue", fAe, fBe, "Perhatian", "/transaksi",
                f"Aturan: pertumbuhan volume > {mat}% dan pertumbuhan revenue < pertumbuhan volume - {mat}%."))

        avgA = nA / vA if vA else 0
        avgB = nB / vB if vB else None
        pavg = pct_change(avgA, avgB) if avgB else None
        if pavg is not None and abs(pavg) >= mat:
            cards.append(_insight(
                "avg-value", f"Nilai rata-rata transaksi berubah {pavg:+.1f}%",
                f"Nilai rata-rata transaksi {month_a_label}: Rp{avgA:,.0f} vs Rp{avgB:,.0f} pada {month_b_label}.",
                "Nilai Rata-rata", avgA, avgB, "Informasi", "/transaksi",
                f"Aturan: |perubahan nilai rata-rata| ≥ {mat}%."))

        # Konsentrasi pertumbuhan pada sedikit member
        pos_rows = [r for r in member_rows if r["diff"] > 0]
        total_pos = sum(r["diff"] for r in pos_rows)
        total_diff = vA - vB
        if total_pos > 0 and total_diff > 0:
            top3 = sorted(pos_rows, key=lambda r: -r["diff"])[:3]
            share = sum(r["diff"] for r in top3) / total_diff * 100
            if share >= T["revenue_concentration_pct"]:
                names = ", ".join(r["key"] for r in top3)
                cards.append(_insight(
                    "growth-conc", "Pertumbuhan terkonsentrasi pada sedikit member",
                    f"3 member teratas menyumbang {share:.0f}% dari total kenaikan volume ({names}).",
                    "Volume", vA, vB, "Informasi", "/insights",
                    f"Aturan: kontribusi 3 member teratas terhadap kenaikan ≥ {T['revenue_concentration_pct']}%.",
                    [{"name": r["key"], "value": r["diff"], "pct": r["diff"] / total_diff * 100} for r in top3]))

        # Member dengan penurunan signifikan
        declines = [r for r in member_rows if r["change_pct"] is not None and r["change_pct"] <= d_sig and r["b_volume"] >= T["min_volume_insight"]]
        if declines:
            worst = sorted(declines, key=lambda r: r["change_pct"])[0]
            sev = "Kritis" if worst["change_pct"] <= -25 else "Perhatian"
            cards.append(_insight(
                "member-decline", f"{worst['key']} turun {abs(worst['change_pct']):.1f}%",
                f"Volume {worst['key']} turun dari {worst['b_volume']:,.0f} menjadi {worst['a_volume']:,.0f} transaksi. {len(declines)} member mengalami penurunan signifikan.",
                "Volume", worst["a_volume"], worst["b_volume"], sev,
                f"/member/{worst['key']}",
                f"Aturan: perubahan volume member ≤ {d_sig}% dengan volume pembanding ≥ {T['min_volume_insight']:,.0f}.",
                [{"name": r["key"], "value": r["diff"], "pct": r["change_pct"]} for r in sorted(declines, key=lambda r: r["change_pct"])[:5]]))

        # Produk kontributor pertumbuhan terbesar
        posp = [r for r in product_rows if r["diff"] > 0]
        if posp and total_diff > 0:
            top = sorted(posp, key=lambda r: -r["diff"])[0]
            share = top["diff"] / total_diff * 100
            cards.append(_insight(
                "product-driver", f"{top['key']} kontributor pertumbuhan terbesar",
                f"Produk {top['key']} menyumbang {share:.0f}% dari perubahan volume ({top['diff']:+,.0f} transaksi).",
                "Volume", top["a_volume"], top["b_volume"], "Peluang", "/transaksi",
                "Aturan: produk dengan selisih volume positif terbesar terhadap total perubahan.",
                [{"name": top["key"], "value": top["diff"], "pct": share}]))

        # Divergensi issuer vs acquirer
        prow = {r["key"]: r for r in position_rows}
        if "Issuer" in prow and "Acquirer" in prow:
            gi, ga = prow["Issuer"]["change_pct"], prow["Acquirer"]["change_pct"]
            if gi is not None and ga is not None and abs(gi - ga) > 2 * mat:
                cards.append(_insight(
                    "iss-acq-div", "Pertumbuhan issuer dan acquirer berbeda signifikan",
                    f"Sisi issuer tumbuh {gi:+.1f}% sedangkan acquirer {ga:+.1f}% (selisih {abs(gi-ga):.1f} poin persen).",
                    "Volume", prow["Issuer"]["a_volume"], prow["Acquirer"]["a_volume"], "Informasi",
                    "/transaksi", f"Aturan: |selisih pertumbuhan issuer vs acquirer| > {2*mat:.0f} poin persen."))

        # Konsentrasi revenue pada top member
        fee_by_member = sorted(member_rows, key=lambda r: -r["a_fee"])
        if fAe > 0 and fee_by_member:
            top3fee = sum(r["a_fee"] for r in fee_by_member[:3])
            share = top3fee / fAe * 100
            if share >= T["revenue_concentration_pct"]:
                names = ", ".join(r["key"] for r in fee_by_member[:3])
                cards.append(_insight(
                    "fee-conc", "Kontribusi revenue terkonsentrasi pada member teratas",
                    f"3 member teratas menyumbang {share:.0f}% dari total revenue ({names}).",
                    "Revenue", fAe, fBe, "Perhatian", "/transaksi",
                    f"Aturan: pangsa revenue 3 member teratas ≥ {T['revenue_concentration_pct']}%."))

        # Konsentrasi produk pada member
        conc = []
        for r in member_rows:
            if r["a_volume"] < T["min_volume_insight"]:
                continue
            prows = [p for p in product_rows if p["key"]]  # dihitung ulang per member di bawah
        # (konsentrasi produk per member dihitung di endpoint karena butuh query terpisah)

    return cards


async def live_no_transactions(start, end, member=None, product=None):
    """Produk berstatus Live tanpa transaksi pada periode terpilih."""
    q = {"status": "Live"}
    if member:
        q["member_code"] = member
    if product:
        q["product_code"] = product
    mps = await db.member_products.find(q).to_list(2000)
    if not mps:
        return []
    match = {"period": {"$gte": start, "$lte": end}}
    active = await db.transactions.distinct("member_code", match)
    apairs = await db.transactions.aggregate([
        {"$match": match},
        {"$group": {"_id": {"m": "$member_code", "p": "$product_code"}, "v": {"$sum": "$volume"}}},
    ]).to_list(None)
    have = {(r["_id"]["m"], r["_id"]["p"]) for r in apairs if r["v"] > 0}
    return [{"member_code": mp["member_code"], "member_name": mp["member_name"],
             "member_alias": mp.get("member_alias", ""), "product_code": mp["product_code"],
             "product_name": mp["product_name"], "status_date": mp.get("status_date")}
            for mp in mps if (mp["member_code"], mp["product_code"]) not in have]


async def member_product_concentration(fA, T, min_members=1):
    """Member yang volumenya sangat terkonsentrasi pada satu produk."""
    rows = await aggregate(db, fA, group="member_code")
    total_by_member = {r["_id"]: r["volume"] for r in rows}
    mp = await db.transactions.aggregate([
        {"$match": __import__("metrics").build_match(fA)},
        {"$group": {"_id": {"m": "$member_code", "p": "$product_code"}, "v": {"$sum": "$volume"}}},
    ]).to_list(None)
    by_member = {}
    for r in mp:
        by_member.setdefault(r["_id"]["m"], []).append((r["_id"]["p"], r["v"]))
    out = []
    for mcode, items in by_member.items():
        tot = total_by_member.get(mcode, 0)
        if tot < T["min_volume_insight"]:
            continue
        top_prod, top_v = max(items, key=lambda x: x[1])
        share = top_v / tot * 100 if tot else 0
        if share >= T["product_concentration_pct"]:
            out.append({"member_code": mcode, "product_code": top_prod, "share_pct": share, "volume": tot})
    return sorted(out, key=lambda r: -r["share_pct"])
