from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME")

print("MONGO_URL :", MONGO_URL)
print("DB_NAME   :", DB_NAME)

client = MongoClient(MONGO_URL)

print("\nDatabase yang tersedia:")
for name in client.list_database_names():
    print("-", name)

db = client[DB_NAME]

print("\nCollection dalam database:")
for name in db.list_collection_names():
    print("-", name)

print("\nJumlah user:", db.users.count_documents({}))

print("\nDaftar user:")
for user in db.users.find({}, {"_id": 0, "password_hash": 0}):
    print(user)

client.close()