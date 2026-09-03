import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


def new_id() -> str:
    return uuid.uuid4().hex


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def doc_out(d: dict) -> dict:
    d = {k: v for k, v in d.items()}
    d["id"] = str(d.pop("_id"))
    return d


def docs_out(items):
    return [doc_out(d) for d in items]


def parse_filters(params) -> dict:
    """Parse filter umum dari query params (dipakai semua modul)."""
    from metrics import parse_ym
    f = {}
    if params.get("start"):
        f["start"] = parse_ym(params["start"])
    if params.get("end"):
        f["end"] = parse_ym(params["end"])
    if params.get("member"):
        f["members"] = [s for s in params["member"].split(",") if s]
    if params.get("product"):
        f["products"] = [s for s in params["product"].split(",") if s]
    if params.get("position") and params["position"] != "All":
        f["position"] = params["position"]
    else:
        f["position"] = "All"
    if params.get("agg_type") and params["agg_type"] != "All":
        f["agg_type"] = params["agg_type"]
    if params.get("category") and params["category"] != "All":
        f["category"] = params["category"]
    return f


async def audit(user: dict, action: str, entity_type: str, entity_id: str = "",
                prev=None, new=None):
    await db.audit_logs.insert_one({
        "_id": new_id(),
        "user_email": user.get("email", "system") if user else "system",
        "user_name": user.get("name", "Sistem") if user else "Sistem",
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "previous_value": prev,
        "new_value": new,
        "timestamp": now_utc(),
    })


DEFAULT_THRESHOLDS = {
    "growth_significant_pct": 10.0,
    "decline_significant_pct": -10.0,
    "min_volume_insight": 1000,
    "max_months_no_trx": 3,
    "revenue_concentration_pct": 60.0,
    "product_concentration_pct": 70.0,
    "uat_max_days": 180,
    "material_change_pct": 5.0,
}


async def get_thresholds() -> dict:
    doc = await db.config.find_one({"_id": "thresholds"})
    if not doc:
        return dict(DEFAULT_THRESHOLDS)
    return {**DEFAULT_THRESHOLDS, **doc.get("values", {})}
