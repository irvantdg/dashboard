"""Generator data demo fiktif: 24 member bank, 14 produk, 30 bulan histori transaksi.
Tidak ada nama bank asli maupun data rahasia. Deterministik (seed=42)."""
import random
from datetime import datetime, timedelta, timezone

from common import new_id

PRODUCTS = [
    {"code": "QRIS",   "name": "QRIS",                    "category": "Pembayaran", "cross": True,  "border": False, "base_vol": 1000000, "ticket": 85000,    "fee": 0.0030},
    {"code": "QRISCB", "name": "QRIS Cross Border",       "category": "Pembayaran", "cross": True,  "border": True,  "base_vol": 40000,   "ticket": 320000,   "fee": 0.0060},
    {"code": "BIFAST", "name": "BI-FAST",                 "category": "Transfer",   "cross": True,  "border": False, "base_vol": 300000,  "ticket": 2500000,  "fee": 0.0004},
    {"code": "SKN",    "name": "Transfer Antar Bank",     "category": "Transfer",   "cross": True,  "border": False, "base_vol": 120000,  "ticket": 8000000,  "fee": 0.0002},
    {"code": "ATM",    "name": "ATM Bersama",             "category": "Kartu",      "cross": True,  "border": False, "base_vol": 500000,  "ticket": 1200000,  "fee": 0.0050},
    {"code": "DEBIT",  "name": "Debit Bersama",           "category": "Kartu",      "cross": True,  "border": False, "base_vol": 350000,  "ticket": 450000,   "fee": 0.0060},
    {"code": "KREDIT", "name": "Kartu Kredit",            "category": "Kartu",      "cross": True,  "border": False, "base_vol": 150000,  "ticket": 950000,   "fee": 0.0120},
    {"code": "VA",     "name": "Virtual Account",         "category": "Pembayaran", "cross": False, "border": False, "base_vol": 250000,  "ticket": 1500000,  "fee": 0.0025},
    {"code": "EMONEY", "name": "Uang Elektronik",         "category": "Pembayaran", "cross": False, "border": False, "base_vol": 800000,  "ticket": 120000,   "fee": 0.0040},
    {"code": "REMIT",  "name": "Remitansi",               "category": "Lintas Negara", "cross": True, "border": True, "base_vol": 25000,  "ticket": 4500000,  "fee": 0.0080},
    {"code": "DISB",   "name": "Disbursement",            "category": "Transfer",   "cross": False, "border": False, "base_vol": 200000,  "ticket": 3000000,  "fee": 0.0010},
    {"code": "SNAP",   "name": "SNAP Open API",           "category": "Layanan API", "cross": False, "border": False, "base_vol": 450000, "ticket": 600000,   "fee": 0.0015},
    {"code": "ECOMM",  "name": "Pembayaran e-Commerce",   "category": "Pembayaran", "cross": False, "border": False, "base_vol": 600000,  "ticket": 350000,   "fee": 0.0050},
    {"code": "AGEN",   "name": "Agen Laku Pandai",        "category": "Layanan",    "cross": False, "border": False, "base_vol": 90000,   "ticket": 500000,   "fee": 0.0070},
]

MEMBER_TYPES = ["Bank Umum", "Bank Digital", "BPR", "Lembaga Selain Bank"]
STATUSES = ["Live", "UAT", "Development", "Preparation", "On Hold", "Not Implemented"]
STATUS_WEIGHTS = [0.50, 0.13, 0.13, 0.09, 0.06, 0.09]
GROWING = {2, 5, 9, 14, 19, 23}
DECLINING = {4, 8, 12, 17, 21}
VOLATILE = {7, 16}

START = (2024, 1)
MONTHS = 30  # 2024-01 .. 2026-06


def _months():
    out = []
    y, m = START
    for _ in range(MONTHS):
        out.append((y, m))
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _growth_factor(arch, t, rng):
    base = {"growing": 1.025, "declining": 0.978, "stable": 1.003, "volatile": 1.0}[arch]
    f = base ** t
    if arch == "volatile":
        f *= rng.uniform(0.82, 1.18)
    return f * rng.uniform(0.92, 1.08)


async def seed_demo(db):
    if await db.members.count_documents({}) > 0:
        return
    rng = random.Random(42)
    now = datetime.now(timezone.utc)

    members = []
    for i in range(1, 25):
        arch = "stable"
        if i in GROWING:
            arch = "growing"
        elif i in DECLINING:
            arch = "declining"
        elif i in VOLATILE:
            arch = "volatile"
        members.append({
            "_id": new_id(),
            "member_code": f"MB{i:03d}",
            "member_name": f"Bank Alias {i:02d}",
            "alias": f"BA{i:02d}",
            "member_type": MEMBER_TYPES[(i - 1) % 4],
            "pic": f"PIC Member {i:02d}",
            "status": "Aktif",
            "created_at": now,
            "_arch": arch,
            "_size": round(rng.uniform(0.3, 3.2), 2),
        })

    products = []
    for p in PRODUCTS:
        products.append({**{k: p[k] for k in ("code", "name", "category")},
                         "_id": new_id(),
                         "product_code": p["code"],
                         "product_name": p["name"],
                         "is_cross_border": p["border"],
                         "description": f"Layanan {p['name']}",
                         "status": "Aktif"})

    def pick_status():
        return rng.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0]

    member_products = []
    for m in members:
        adopted = 0
        for p in PRODUCTS:
            if rng.random() > 0.62 and adopted >= 5:
                continue
            adopted += 1
            status = pick_status()
            sd = now - timedelta(days=rng.randint(10, 720))
            member_products.append({
                "_id": new_id(),
                "member_code": m["member_code"],
                "member_name": m["member_name"],
                "member_alias": m["alias"],
                "product_code": p["code"],
                "product_name": p["name"],
                "position": rng.choice(["Issuer", "Acquirer", "Issuer & Acquirer"]),
                "status": status,
                "status_date": sd,
                "pic": m["pic"],
                "notes": rng.choice(["", "Menunggu sertifikasi", "Integrasi API tahap 2",
                                     "Migrasi dari switching lama", "Prioritas kuartal ini", ""]),
                "updated_by": "admin@mti.internal",
                "updated_at": now - timedelta(days=rng.randint(0, 30)),
            })
    # Pastikan tiap produk punya minimal 8 member
    for p in PRODUCTS:
        have = {mp["member_code"] for mp in member_products if mp["product_code"] == p["code"]}
        for m in members:
            if len(have) >= 8:
                break
            if m["member_code"] not in have:
                sd = now - timedelta(days=rng.randint(10, 720))
                member_products.append({
                    "_id": new_id(), "member_code": m["member_code"], "member_name": m["member_name"],
                    "member_alias": m["alias"], "product_code": p["code"], "product_name": p["name"],
                    "position": "Issuer & Acquirer", "status": pick_status(), "status_date": sd,
                    "pic": m["pic"], "notes": "", "updated_by": "admin@mti.internal",
                    "updated_at": now - timedelta(days=rng.randint(0, 30))})
                have.add(m["member_code"])

    # Beberapa kombinasi Live tanpa transaksi (untuk indikator)
    live_mps = [mp for mp in member_products if mp["status"] == "Live"]
    zero_trx = {(mp["member_code"], mp["product_code"]) for mp in rng.sample(live_mps, min(8, len(live_mps)))}

    pmap = {p["code"]: p for p in PRODUCTS}
    mmap = {m["member_code"]: m for m in members}
    months = _months()
    batch_id = "SEED-DEMO"
    docs = []
    for mp in live_mps:
        key = (mp["member_code"], mp["product_code"])
        if key in zero_trx:
            continue
        m = mmap[mp["member_code"]]
        p = pmap[mp["product_code"]]
        for t, (y, mo) in enumerate(months):
            gf = _growth_factor(m["_arch"], t, rng)
            vol = int(p["base_vol"] * m["_size"] * 0.18 * gf)
            if vol < 20:
                continue
            period = datetime(y, mo, 1, tzinfo=timezone.utc)
            upd = min(now, period + timedelta(days=36))
            base = {
                "period": period,
                "period_ym": f"{y:04d}-{mo:02d}",
                "member_code": m["member_code"],
                "member_name": m["member_name"],
                "member_alias": m["alias"],
                "product_code": p["code"],
                "product_name": p["name"],
                "product_category": p["category"],
                "product_border": p["border"],
                "aggregation_type": "Cross" if p["cross"] else "Single Side",
                "batch_id": batch_id,
                "updated_at": upd,
            }
            nominal = round(vol * p["ticket"] * rng.uniform(0.95, 1.05))
            docs.append({**base, "_id": new_id(), "position": "Issuer",
                         "volume": vol, "nominal": nominal, "fee": round(nominal * p["fee"])})
            if p["cross"]:
                vol2 = int(vol * rng.uniform(0.75, 1.25))
                nom2 = round(vol2 * p["ticket"] * rng.uniform(0.95, 1.05))
                docs.append({**base, "_id": new_id(), "position": "Acquirer",
                             "volume": vol2, "nominal": nom2, "fee": round(nom2 * p["fee"])})

    for m in members:
        m.pop("_arch"); m.pop("_size")
    await db.members.insert_many(members)
    await db.products.insert_many(products)
    await db.member_products.insert_many(member_products)
    for i in range(0, len(docs), 2000):
        await db.transactions.insert_many(docs[i:i + 2000])
