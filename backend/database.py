import os
import csv
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in the .env file.")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# DB helper (yields the Supabase client for FastAPI dependency injection)
def get_db():
    yield supabase

# CSV Synchronization helper
CSV_FILE_PATH = os.path.join(os.path.dirname(__file__), "active_stocks.csv")

def sync_csv_to_db(db: Client):
    """
    Reads active_stocks.csv and loads it into Supabase if it is empty.
    Useful for initializing data.
    """
    if not os.path.exists(CSV_FILE_PATH):
        return

    # Check if we already have stocks in Supabase
    try:
        res = db.table("stocks").select("symbol", count="exact").limit(1).execute()
        if res.count and res.count > 0:
            return
    except Exception as e:
        print(f"Supabase check failed: {e}")
        return

    print("Initializing database from active_stocks.csv...")
    try:
        with open(CSV_FILE_PATH, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            stocks_to_insert = []
            for row in reader:
                created_at_val = datetime.utcnow().isoformat()
                if row.get("CreatedAt"):
                    created_at_val = row["CreatedAt"]
                
                stocks_to_insert.append({
                    "symbol": row["Symbol"].strip().upper(),
                    "is_active": row.get("IsActive", "True").strip().lower() in ("true", "1", "yes"),
                    "created_at": created_at_val
                })
            
            if stocks_to_insert:
                db.table("stocks").upsert(stocks_to_insert).execute()
            print("Database initialized successfully.")
    except Exception as e:
        print(f"Error during CSV import: {e}")

def sync_db_to_csv(db: Client):
    """
    Dumps the current active stocks from Supabase to active_stocks.csv.
    Call this whenever a stock is created, updated, or deleted.
    """
    print("Syncing database changes back to active_stocks.csv...")
    try:
        res = db.table("stocks").select("*").execute()
        stocks = res.data or []
        with open(CSV_FILE_PATH, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Symbol", "IsActive", "CreatedAt"])
            for stock in stocks:
                writer.writerow([
                    stock["symbol"],
                    str(stock["is_active"]),
                    stock["created_at"]
                ])
        print("CSV synchronized successfully.")
    except Exception as e:
        print(f"Error during CSV sync: {e}")
