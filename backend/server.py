import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from common import db
from auth import router as auth_router, seed_users
from demo_data import seed_demo
from routes_core import router as core_router
from routes_insights import router as insights_router
from routes_admin import router as admin_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_requests.create_index("email")
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    await db.transactions.create_index([("period", 1)])
    await db.transactions.create_index([("member_code", 1), ("period", 1)])
    await db.transactions.create_index([("product_code", 1), ("period", 1)])
    await db.member_products.create_index([("member_code", 1), ("product_code", 1)], unique=True)
    await db.audit_logs.create_index([("timestamp", -1)])
    await seed_users()
    await seed_demo(db)
    logger.info("Startup selesai: user & data demo siap")
    yield


app = FastAPI(title="Member & Transaction Intelligence", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(core_router)
app.include_router(insights_router)
app.include_router(admin_router)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
