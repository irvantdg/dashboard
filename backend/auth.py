import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import urlparse

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from common import audit, db, doc_out, new_id, now_utc

logger = logging.getLogger(__name__)
JWT_ALG = "HS256"

EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "Member & Transaction Intelligence"

LOCKOUT_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": ver, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=30)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def create_refresh_token(user_id: str, ver: int = 0) -> str:
    payload = {"sub": user_id, "ver": ver, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def _set_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=1800, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def _public_user(u: dict) -> dict:
    u = doc_out(u)
    u.pop("password_hash", None)
    return u


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Tidak terautentikasi")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(401, "Tipe token tidak valid")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesi berakhir, silakan masuk kembali")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid")
    user = await db.users.find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(401, "Pengguna tidak ditemukan")
    if payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(401, "Sesi kedaluwarsa")
    if user.get("status", "Aktif") != "Aktif":
        raise HTTPException(403, "Akun dinonaktifkan")
    return _public_user(user)


def require_roles(*roles: str):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(403, "Anda tidak memiliki akses ke fitur ini")
        return user
    return dep


async def require_fee_access(user: dict = Depends(get_current_user)):
    if not user.get("permissions", {}).get("view_fee", True):
        raise HTTPException(403, "Akses informasi fee/revenue dibatasi")
    return user


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "analyst"


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str
    password: str


async def _locked(email: str, ip: str) -> bool:
    ident = f"{ip}:{email}"
    since = now_utc() - timedelta(minutes=LOCKOUT_MINUTES)
    n = await db.login_attempts.count_documents({"identifier": ident, "created_at": {"$gte": since}})
    return n >= LOCKOUT_ATTEMPTS


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    if await _locked(email, ip):
        raise HTTPException(429, "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        await db.login_attempts.insert_one({"identifier": f"{ip}:{email}", "email": email, "created_at": now_utc()})
        raise HTTPException(401, "Email atau kata sandi salah")
    if user.get("status", "Aktif") != "Aktif":
        raise HTTPException(403, "Akun dinonaktifkan. Hubungi administrator.")
    await db.login_attempts.delete_many({"identifier": f"{ip}:{email}"})
    ver = user.get("token_version", 0)
    _set_cookies(response, create_access_token(user["_id"], email, ver), create_refresh_token(user["_id"], ver))
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now_utc()}})
    await audit(_public_user(user), "login", "user", user["_id"])
    return _public_user(user)


@router.post("/register")
async def register(body: RegisterBody, response: Response, admin: dict = Depends(require_roles("admin"))):
    """Pembuatan akun hanya oleh Administrator (aplikasi internal)."""
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email sudah terdaftar")
    if body.role not in ("admin", "analyst", "management"):
        raise HTTPException(422, "Peran tidak valid")
    if len(body.password) < 8:
        raise HTTPException(422, "Kata sandi minimal 8 karakter")
    doc = {"_id": new_id(), "name": body.name.strip(), "email": email,
           "password_hash": hash_password(body.password), "role": body.role,
           "status": "Aktif", "permissions": {"view_fee": True}, "token_version": 0,
           "created_at": now_utc(), "last_login": None}
    await db.users.insert_one(doc)
    await audit(admin, "create_user", "user", doc["_id"], new={"email": email, "role": body.role})
    return _public_user(doc)


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Keluar berhasil"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "Tidak ada refresh token")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Tipe token tidak valid")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Refresh token tidak valid")
    user = await db.users.find_one({"_id": payload["sub"]})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(401, "Sesi kedaluwarsa")
    access = create_access_token(user["_id"], user["email"], user.get("token_version", 0))
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=1800, path="/")
    return {"message": "ok"}


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email belum dikonfigurasi; tautan reset: %s", link)
        else:
            logger.error("Email reset kata sandi belum dikonfigurasi (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>Kami menerima permintaan reset kata sandi akun {brand} Anda.</p>'
        f'<p><a href="{escape(link)}">Reset kata sandi</a></p>'
        f'<p>Tautan berlaku 1 jam dan hanya dapat digunakan sekali. Jika Anda tidak meminta, abaikan email ini.</p>'
        f'<p style="font-size:12px;color:#888">Dikirim oleh {brand}. Kami tidak pernah meminta kata sandi melalui email.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Reset kata sandi {EMAIL_FROM_NAME}",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Gagal mengirim email reset: {e}")
        return False


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody, background_tasks: BackgroundTasks):
    email = body.email.lower().strip()
    generic = {"message": "Jika email terdaftar, tautan reset telah dikirim."}
    since = now_utc() - timedelta(minutes=15)
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_utc()})
    if await db.password_reset_requests.count_documents({"email": email, "created_at": {"$gte": since}}) > 5:
        return generic
    user = await db.users.find_one({"email": email})
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["_id"], "email": email,
        "expires_at": now_utc() + timedelta(hours=1), "used": False})
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return generic


@router.post("/reset-password")
async def reset_password(body: ResetBody):
    if len(body.password) < 8:
        raise HTTPException(422, "Kata sandi minimal 8 karakter")
    h = hashlib.sha256(body.token.encode()).hexdigest()
    tok = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": now_utc()}},
        {"$set": {"used": True}})
    if not tok:
        raise HTTPException(400, "Tautan reset tidak valid atau sudah kedaluwarsa")
    await db.users.update_one({"_id": tok["user_id"]},
                              {"$set": {"password_hash": hash_password(body.password)},
                               "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": tok["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": tok["email"]})
    await db.audit_logs.insert_one({"_id": new_id(), "user_email": tok["email"], "user_name": tok["email"],
                                    "action": "reset_password", "entity_type": "user",
                                    "entity_id": tok["user_id"], "previous_value": None,
                                    "new_value": None, "timestamp": now_utc()})
    return {"message": "Kata sandi berhasil diubah. Silakan masuk."}


async def seed_users():
    """Seed akun awal (idempotent)."""
    seeds = [
        (os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD"), "Administrator", "admin"),
        ("analyst@mti.internal", "AnalystMTI2026!", "Analis Bisnis", "analyst"),
        ("management@mti.internal", "ManagementMTI2026!", "Manajemen", "management"),
    ]
    for email, password, name, role in seeds:
        if not email or not password:
            continue
        email = email.lower()
        existing = await db.users.find_one({"email": email})
        if existing is None:
            await db.users.insert_one({"_id": new_id(), "name": name, "email": email,
                                       "password_hash": hash_password(password), "role": role,
                                       "status": "Aktif", "permissions": {"view_fee": True},
                                       "token_version": 0, "created_at": now_utc(), "last_login": None})
        elif not verify_password(password, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
