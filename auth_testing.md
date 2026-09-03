# Auth Testing Playbook — Member & Transaction Intelligence

Auth: email+password JWT (httpOnly cookie, fallback Bearer). Peran: admin, analyst, management.
Pembuatan akun bersifat internal: `POST /api/auth/register` dan `POST /api/users` HANYA bisa dipanggil oleh admin yang sudah login (bukan registrasi publik).

## Kredensial
Lihat /app/memory/test_credentials.md.

## Step 1: MongoDB
```
mongosh
use test_database
db.users.find({role: "admin"}).pretty()
```
Verifikasi: password_hash dimulai `$2b$`; index users.email (unique), login_attempts.identifier, login_attempts.email, password_reset_tokens.token_hash (unique), password_reset_tokens.expires_at (TTL), password_reset_requests.email, password_reset_requests.created_at (TTL).

## Step 2: API
```
curl -c /tmp/c.txt -X POST http://localhost:8001/api/auth/login -H "Content-Type: application/json" -d '{"email":"ignatiusirvantadung@gmail.com","password":"AdminMTI2026!"}'
curl -b /tmp/c.txt http://localhost:8001/api/auth/me
```
Login mengembalikan objek user + cookie access_token & refresh_token. /me mengembalikan user yang sama.

## Step 3: Password Reset
**Lakukan dulu sebelum request di bawah:** set `FRONTEND_URL="http://localhost:3000"` di /app/backend/.env lalu `sudo supervisorctl restart backend` agar tautan reset tertulis di log backend. **Kembalikan ke https origin setelah selesai.**

1. Buat akun uji via admin (register butuh cookie admin):
```
curl -b /tmp/c.txt -X POST http://localhost:8001/api/auth/register -H "Content-Type: application/json" -d '{"email":"resettest@mti.internal","password":"Reset12345!","name":"Reset Test","role":"analyst"}'
```
2. Paritas enumerasi — response untuk email terdaftar vs tidak terdaftar harus identik (status + body):
```
curl -i -X POST http://localhost:8001/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"resettest@mti.internal"}'
curl -i -X POST http://localhost:8001/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"nobody@nowhere.test"}'
```
Di mongosh: hanya email terdaftar yang punya dokumen di password_reset_tokens, berisi token_hash 64 karakter (bukan token mentah).
3. Ambil tautan reset dari log backend (`tail -n 50 /var/log/supervisor/backend.err.log`), selesaikan reset via POST /api/auth/reset-password. Verifikasi: password baru bisa login, password lama tidak bisa, tautan yang sama tidak bisa dipakai ulang.
4. Throttle: buat akun baru (mis. throttle@mti.internal), kirim 6x forgot-password; hanya 5 token yang dibuat, semua respons tetap 200 generik.
5. Lockout clearance: gagalkan login 5x, lakukan reset, login dengan password baru harus berhasil (bukan lockout).

## Step 4: Role enforcement
- analyst/management mengakses `GET /api/users` → harus 403.
- analyst mengakses `PUT /api/config/thresholds` → harus 403.
- Tanpa login, semua endpoint selain /api/auth/login & forgot/reset → 401.
