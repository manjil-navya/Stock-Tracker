import os
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Query, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client
from pydantic import BaseModel
import csv
import io

from database import get_db, sync_csv_to_db, sync_db_to_csv

app = FastAPI(title="Stock Tracker API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the actual frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event to load CSV data into the database
@app.on_event("startup")
def startup_event():
    db = next(get_db())
    sync_csv_to_db(db)

# Pydantic Schemas
class StockBase(BaseModel):
    symbol: str
    is_active: Optional[bool] = True

class StockCreate(StockBase):
    pass

class StockResponse(StockBase):
    created_at: datetime

    class Config:
        from_attributes = True

class ApprovalToggle(BaseModel):
    symbol: str
    quarter: str
    year: str
    approved: bool

class BulkApprovalToggle(BaseModel):
    symbols: List[str]
    quarter: str
    year: str
    approved: bool

class ApprovalResponse(BaseModel):
    symbol: str
    is_active: bool
    approved: bool
    approved_at: Optional[datetime] = None

class ApprovalRecord(BaseModel):
    stock_symbol: str
    quarter: str
    year: str
    approved: bool
    approved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class QuarterlySummary(BaseModel):
    quarter: str
    year: str
    total_active: int
    total_approved: int
    total_pending: int
    new_stocks_count: int
    approved_stocks: List[StockResponse]
    pending_stocks: List[StockResponse]
    new_stocks: List[StockResponse]

# API Endpoints

# 1. Stocks CRUD

@app.get("/api/stocks", response_model=List[StockResponse])
def get_stocks(db: Client = Depends(get_db)):
    """Fetch all stocks sorted by symbol."""
    res = db.table("stocks").select("*").order("symbol").execute()
    return res.data or []

@app.post("/api/stocks", response_model=StockResponse)
def create_stock(stock_data: StockCreate, db: Client = Depends(get_db)):
    """Create a new stock in the database and synchronize to the CSV file."""
    symbol_upper = stock_data.symbol.strip().upper()
    if not symbol_upper:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty.")

    # Check if stock already exists
    try:
        existing_res = db.table("stocks").select("*").eq("symbol", symbol_upper).execute()
        existing = existing_res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

    if existing:
        stock = existing[0]
        # If it exists and is inactive, reactivate it
        if not stock["is_active"]:
            try:
                res = db.table("stocks").update({"is_active": True}).eq("symbol", symbol_upper).execute()
                sync_db_to_csv(db)
                return res.data[0]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to reactivate stock: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail=f"Stock with symbol {symbol_upper} already exists.")

    new_stock = {
        "symbol": symbol_upper,
        "is_active": stock_data.is_active,
        "created_at": datetime.utcnow().isoformat()
    }
    try:
        res = db.table("stocks").insert(new_stock).execute()
        sync_db_to_csv(db)
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add stock: {str(e)}")

@app.put("/api/stocks/{symbol}", response_model=StockResponse)
def update_stock(symbol: str, stock_data: StockCreate, db: Client = Depends(get_db)):
    """Update stock details and synchronize to the CSV file."""
    symbol_upper = symbol.strip().upper()
    try:
        res = db.table("stocks").update({"is_active": stock_data.is_active}).eq("symbol", symbol_upper).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Stock not found")
        sync_db_to_csv(db)
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update stock: {str(e)}")

@app.delete("/api/stocks/{symbol}")
def delete_stock(symbol: str, db: Client = Depends(get_db)):
    """Delete a stock and synchronize to the CSV file."""
    symbol_upper = symbol.strip().upper()
    try:
        res = db.table("stocks").delete().eq("symbol", symbol_upper).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Stock not found")
        sync_db_to_csv(db)
        return {"message": f"Stock {symbol_upper} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete stock: {str(e)}")


# 2. Bulk Upload CSV
@app.post("/api/stocks/upload", response_model=List[StockResponse])
async def upload_stocks_csv(file: UploadFile = File(...), db: Client = Depends(get_db)):
    """
    Upload a CSV file containing a 'symbol' column to bulk add/reactivate stocks.
    Expected CSV header: symbol (case-insensitive) and optionally other columns.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Read file content
    contents = await file.read()
    # Try to decode as UTF-8
    try:
        csv_text = contents.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")
    
    # Parse CSV
    try:
        # Use io.StringIO to treat string as file-like object
        f = io.StringIO(csv_text)
        reader = csv.DictReader(f)
        # Normalize fieldnames: strip spaces, lower case for comparison
        if reader.fieldnames is None:
            raise HTTPException(status_code=400, detail="CSV file appears empty or missing header")
        # Find symbol column (case-insensitive)
        symbol_col = None
        for fname in reader.fieldnames:
            if fname.strip().lower() == 'symbol':
                symbol_col = fname
                break
        if symbol_col is None:
            raise HTTPException(status_code=400, detail="CSV must contain a column named 'symbol'")
        
        # Process rows
        added_stocks = []
        errors = []
        # We'll collect updates to perform in batch
        symbols_to_process = []
        for row in reader:
            symbol_val = row.get(symbol_col)
            if symbol_val is None:
                continue
            symbol_clean = str(symbol_val).strip().upper()
            if not symbol_clean:
                continue
            symbols_to_process.append(symbol_clean)
        
        if not symbols_to_process:
            return []  # nothing to process
        
        # Fetch existing stocks for these symbols in one query (if many, we could batch)
        # We'll query all stocks with symbol IN list
        # Supabase does not support IN directly? We can use .in_ filter.
        try:
            existing_res = db.table("stocks").select("symbol, is_active, created_at").in_("symbol", symbols_to_process).execute()
            existing_rows = existing_res.data or []
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch existing stocks: {str(e)}")
        
        # Map existing by symbol
        existing_map = {row["symbol"]: row for row in existing_rows}
        
        # Prepare inserts and updates
        to_insert = []
        to_reactivate = []
        results = []  # to collect StockResponse objects
        
        for sym in symbols_to_process:
            if sym in existing_map:
                existing = existing_map[sym]
                if not existing["is_active"]:
                    # mark for reactivation
                    to_reactivate.append(sym)
                    # We'll later update and fetch the updated record
                else:
                    # already active, skip but we could still include in response?
                    # We'll skip adding to results (maybe we should include as unchanged?)
                    # For simplicity, we skip.
                    pass
            else:
                # new stock
                to_insert.append(sym)
        
        # Perform batch insert
        if to_insert:
            insert_records = [{"symbol": sym, "is_active": True, "created_at": datetime.utcnow().isoformat()} for sym in to_insert]
            try:
                insert_res = db.table("stocks").insert(insert_records).execute()
                inserted_data = insert_res.data or []
                for stock in inserted_data:
                    # Convert to StockResponse
                    results.append(StockResponse(
                        symbol=stock["symbol"],
                        is_active=stock["is_active"],
                        created_at=datetime.fromisoformat(stock["created_at"].replace("Z", "+00:00"))
                    ))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to insert new stocks: {str(e)}")
        
        # Perform batch reactivation
        if to_reactivate:
            try:
                update_res = db.table("stocks").update({"is_active": True}).in_("symbol", to_reactivate).execute()
                updated_data = update_res.data or []
                for stock in updated_data:
                    # Get original created_at from existing_map
                    created_at_str = existing_map[stock["symbol"]]["created_at"]
                    results.append(StockResponse(
                        symbol=stock["symbol"],
                        is_active=stock["is_active"],
                        created_at=datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                    ))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to reactivate stocks: {str(e)}")
        
        # After all modifications, sync CSV once
        try:
            sync_db_to_csv(db)
        except Exception as e:
            # Log but not fail the request? We'll still raise.
            raise HTTPException(status_code=500, detail=f"Failed to sync CSV: {str(e)}")
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error processing CSV: {str(e)}")


# 3. Quarterly Update & Approval Endpoints

@app.get("/api/approvals", response_model=List[ApprovalResponse])
def get_approvals(
    quarter: str = Query(..., description="Quarter: Q1, Q2, Q3, or Q4"),
    year: str = Query(..., description="Financial Year, e.g. 2025/26"),
    db: Client = Depends(get_db)
):
    """
    Get the approval status for all active stocks for a specific quarter and year.
    """
    try:
        # Fetch active stocks
        stocks_res = db.table("stocks").select("*").eq("is_active", True).order("symbol").execute()
        active_stocks = stocks_res.data or []

        # Fetch approvals for this quarter/year
        approvals_res = db.table("quarterly_approvals").select("*").eq("quarter", quarter).eq("year", year).execute()
        approvals = approvals_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

    approval_map = {appr["stock_symbol"]: appr for appr in approvals}

    response = []
    for stock in active_stocks:
        appr_record = approval_map.get(stock["symbol"])
        is_approved = appr_record["approved"] if appr_record else False
        approved_at = appr_record["approved_at"] if appr_record else None

        response.append(ApprovalResponse(
            symbol=stock["symbol"],
            is_active=stock["is_active"],
            approved=is_approved,
            approved_at=approved_at
        ))

    return response

@app.get("/api/approvals/all", response_model=List[ApprovalRecord])
def get_all_approvals(db: Client = Depends(get_db)):
    """Fetch all approvals in the database."""
    try:
        res = db.table("quarterly_approvals").select("*").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

@app.post("/api/approvals/toggle", response_model=ApprovalResponse)
def toggle_approval(approval_data: ApprovalToggle, db: Client = Depends(get_db)):
    """
    Approve or remove approval for a stock's quarterly update.
    """
    symbol_upper = approval_data.symbol.strip().upper()
    
    try:
        # Verify stock exists and is active
        stock_res = db.table("stocks").select("*").eq("symbol", symbol_upper).eq("is_active", True).execute()
        if not stock_res.data:
            raise HTTPException(status_code=404, detail="Active stock not found")
        stock = stock_res.data[0]

        # Find existing approval record
        appr_res = db.table("quarterly_approvals").select("*").eq("stock_symbol", symbol_upper).eq("quarter", approval_data.quarter).eq("year", approval_data.year).execute()
        appr_record = appr_res.data[0] if appr_res.data else None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

    is_approved = False
    approved_at = None

    if approval_data.approved:
        now_str = datetime.utcnow().isoformat()
        if appr_record:
            try:
                res = db.table("quarterly_approvals").update({"approved": True, "approved_at": now_str}).eq("id", appr_record["id"]).execute()
                is_approved = True
                approved_at = now_str
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to update approval: {str(e)}")
        else:
            try:
                new_appr = {
                    "stock_symbol": symbol_upper,
                    "quarter": approval_data.quarter,
                    "year": approval_data.year,
                    "approved": True,
                    "approved_at": now_str
                }
                res = db.table("quarterly_approvals").insert(new_appr).execute()
                is_approved = True
                approved_at = now_str
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to create approval: {str(e)}")
    else:
        # Remove approval
        if appr_record:
            try:
                db.table("quarterly_approvals").delete().eq("id", appr_record["id"]).execute()
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to remove approval: {str(e)}")

    return ApprovalResponse(
        symbol=stock["symbol"],
        is_active=stock["is_active"],
        approved=is_approved,
        approved_at=approved_at
    )

@app.post("/api/approvals/bulk-toggle")
def bulk_toggle_approval(approval_data: BulkApprovalToggle, db: Client = Depends(get_db)):
    """
    Approve or remove approval for multiple stocks in bulk.
    """
    symbols_upper = [s.strip().upper() for s in approval_data.symbols if s.strip()]
    if not symbols_upper:
        raise HTTPException(status_code=400, detail="No symbols provided")

    try:
        # Verify active stocks exist for these symbols
        stock_res = db.table("stocks").select("symbol").in_("symbol", symbols_upper).eq("is_active", True).execute()
        valid_symbols = [s["symbol"] for s in (stock_res.data or [])]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

    if not valid_symbols:
        raise HTTPException(status_code=400, detail="No active matching stocks found")

    now_str = datetime.utcnow().isoformat()

    try:
        if approval_data.approved:
            upsert_records = []
            for sym in valid_symbols:
                upsert_records.append({
                    "stock_symbol": sym,
                    "quarter": approval_data.quarter,
                    "year": approval_data.year,
                    "approved": True,
                    "approved_at": now_str
                })
            # Upsert multiple approval records
            db.table("quarterly_approvals").upsert(upsert_records).execute()
        else:
            # Delete multiple approval records
            db.table("quarterly_approvals").delete().in_("stock_symbol", valid_symbols).eq("quarter", approval_data.quarter).eq("year", approval_data.year).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process bulk approvals: {str(e)}")

    return {"message": f"Successfully updated {len(valid_symbols)} approvals", "updated_count": len(valid_symbols)}

@app.get("/api/summary", response_model=QuarterlySummary)
def get_quarterly_summary(
    quarter: str = Query(..., description="Quarter: Q1, Q2, Q3, or Q4"),
    year: str = Query(..., description="Financial Year, e.g. 2025/26"),
    db: Client = Depends(get_db)
):
    """
    Get summary stats including pending stocks, approved stocks, and new active stocks.
    """
    try:
        # Active stocks
        stocks_res = db.table("stocks").select("*").eq("is_active", True).order("symbol").execute()
        active_stocks = stocks_res.data or []
        
        # Approvals for this quarter/year
        approvals_res = db.table("quarterly_approvals").select("*").eq("quarter", quarter).eq("year", year).eq("approved", True).execute()
        approvals = approvals_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    
    approved_symbols = {appr["stock_symbol"] for appr in approvals}

    approved_stocks = []
    pending_stocks = []
    
    for s in active_stocks:
        # Clean datetime string format for pydantic
        dt_str = s["created_at"].replace("Z", "+00:00")
        stock_obj = StockResponse(
            symbol=s["symbol"],
            is_active=s["is_active"],
            created_at=datetime.fromisoformat(dt_str)
        )
        if s["symbol"] in approved_symbols:
            approved_stocks.append(stock_obj)
        else:
            pending_stocks.append(stock_obj)

    now = datetime.utcnow()
    new_stocks = []
    for s in active_stocks:
        try:
            dt_str = s["created_at"].replace("Z", "+00:00")
            created_at_dt = datetime.fromisoformat(dt_str).replace(tzinfo=None)
            delta = now - created_at_dt
            if delta.days <= 90:
                new_stocks.append(StockResponse(
                    symbol=s["symbol"],
                    is_active=s["is_active"],
                    created_at=created_at_dt
                ))
        except Exception:
            pass

    return QuarterlySummary(
        quarter=quarter,
        year=year,
        total_active=len(active_stocks),
        total_approved=len(approved_stocks),
        total_pending=len(pending_stocks),
        new_stocks_count=len(new_stocks),
        approved_stocks=approved_stocks,
        pending_stocks=pending_stocks,
        new_stocks=new_stocks
    )