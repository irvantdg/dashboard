import os
import getpass
import bcrypt

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

email = "admin@localhost.com"
password = "admin123"

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

password_hash = bcrypt.hashpw(
    password.encode("utf-8"),
    bcrypt.gensalt()
).decode("utf-8")

result = db.users.update_one(
    {"email": email},
    {
        "$set": {"password_hash": password_hash},
        "$inc": {"token_version": 1},
    },
)

if result.matched_count == 0:
    raise SystemExit(f"Akun {email} tidak ditemukan.")

db.login_attempts.delete_many({"email": email})

print(f"Password {email} berhasil di-reset.")
client.close()