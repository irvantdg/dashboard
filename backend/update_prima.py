import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

product = db.products.update_one(
    {"product_code": "DEBIT"},
    {
        "$set": {
            "product_name": "PRIMA DEBIT",
            "category": "DEBIT",
            "is_cross_border": False,
            "status": "Aktif",
        },
        "$setOnInsert": {
            "product_code": "DEBIT",
            "description": "",
        },
    },
    upsert=True,
)



print("Master product diperbarui/dibuat:", product.matched_count or product.upserted_id)