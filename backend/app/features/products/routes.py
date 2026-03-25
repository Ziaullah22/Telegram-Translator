from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
import os
import uuid
import shutil
import json
from datetime import datetime
from database import db
from models import ProductCreate, ProductUpdate, ProductResponse, TokenData
from auth import get_current_user

router = APIRouter(prefix="/api/products", tags=["Products"])

# Directory for storing product photos
UPLOAD_DIR = "backend/media/products"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def map_product_row(row):
    if not row:
        return None
    d = dict(row)
    
    # Handle photo_urls (JSONB or TEXT)
    photo_urls = d.get("photo_urls")
    if isinstance(photo_urls, str):
        try:
            d["photo_urls"] = json.loads(photo_urls)
        except:
            d["photo_urls"] = []
    elif photo_urls is None:
        d["photo_urls"] = []
    # if it's already a list, keep it
    
    # Handle keywords (ARRAY or JSONB or TEXT)
    keywords = d.get("keywords")
    if isinstance(keywords, str):
        try:
            d["keywords"] = json.loads(keywords)
        except:
            # Maybe it's a PG array string? "{val1,val2}"
            if keywords.startswith("{") and keywords.endswith("}"):
                d["keywords"] = keywords[1:-1].split(",") if keywords[1:-1] else []
            else:
                d["keywords"] = []
    elif keywords is None:
        d["keywords"] = []
    # if it's already a list (from asyncpg ARRAY), keep it
    
    return d

@router.get("/", response_model=List[ProductResponse])
async def get_products(current_user: TokenData = Depends(get_current_user)):
    query = "SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC"
    rows = await db.fetch(query, current_user.user_id)
    return [map_product_row(row) for row in rows]

@router.post("/", response_model=ProductResponse)
async def create_product(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    price: float = Form(...),
    stock_quantity: int = Form(...),
    keywords: str = Form("[]"), # JSON string of list
    delivery_mode: str = Form("both"),
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    current_user: TokenData = Depends(get_current_user)
):
    try:
        keywords_list = json.loads(keywords)
    except:
        keywords_list = []

    photo_urls = []
    
    if files:
        for f in files:
            if f.filename:
                file_extension = os.path.splitext(f.filename)[1]
                file_name = f"{uuid.uuid4()}{file_extension}"
                file_path = os.path.join(UPLOAD_DIR, file_name)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(f.file, buffer)
                photo_urls.append(f"/media/products/{file_name}")
                
    if file and file.filename:
        file_extension = os.path.splitext(file.filename)[1]
        file_name = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        photo_urls.insert(0, f"/media/products/{file_name}")

    photo_url = photo_urls[0] if photo_urls else None

    query = """
        INSERT INTO products (user_id, name, description, price, stock_quantity, keywords, photo_url, photo_urls, delivery_mode)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
    """
    row = await db.fetchrow(
        query, 
        current_user.user_id, 
        name, 
        description, 
        price, 
        stock_quantity, 
        keywords_list, 
        photo_url,
        photo_urls,
        delivery_mode
    )
    return map_product_row(row)

@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    stock_quantity: Optional[int] = Form(None),
    keywords: Optional[str] = Form(None),
    delivery_mode: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    retained_photo_urls: str = Form("[]"),
    current_user: TokenData = Depends(get_current_user)
):
    # Check if product exists and belongs to user
    existing = await db.fetchrow("SELECT * FROM products WHERE id = $1 AND user_id = $2", product_id, current_user.user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    try:
        retained_urls = json.loads(retained_photo_urls)
    except:
        retained_urls = []

    photo_urls = retained_urls

    if files:
        for f in files:
            if f.filename:
                file_extension = os.path.splitext(f.filename)[1]
                file_name = f"{uuid.uuid4()}{file_extension}"
                file_path = os.path.join(UPLOAD_DIR, file_name)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(f.file, buffer)
                photo_urls.append(f"/media/products/{file_name}")

    if file and file.filename:
        file_extension = os.path.splitext(file.filename)[1]
        file_name = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        photo_urls.insert(0, f"/media/products/{file_name}")
        
    photo_url = photo_urls[0] if photo_urls else None

    keywords_list = existing["keywords"]
    if keywords:
        try:
            keywords_list = json.loads(keywords)
        except:
            pass

    query = """
        UPDATE products 
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            price = COALESCE($3, price),
            stock_quantity = COALESCE($4, stock_quantity),
            keywords = COALESCE($5, keywords),
            photo_url = $6,
            photo_urls = $7,
            delivery_mode = COALESCE($8, delivery_mode),
            updated_at = NOW()
        WHERE id = $9 AND user_id = $10
        RETURNING *
    """
    row = await db.fetchrow(
        query, 
        name, 
        description, 
        price, 
        stock_quantity, 
        keywords_list, 
        photo_url,
        photo_urls,
        delivery_mode,
        product_id,
        current_user.user_id
    )
    return map_product_row(row)

@router.delete("/{product_id}")
async def delete_product(product_id: int, current_user: TokenData = Depends(get_current_user)):
    existing = await db.fetchrow("SELECT * FROM products WHERE id = $1 AND user_id = $2", product_id, current_user.user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if existing["photo_url"]:
        old_path = os.path.join("backend", existing["photo_url"].lstrip("/"))
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except:
                pass

    await db.execute("DELETE FROM products WHERE id = $1 AND user_id = $2", product_id, current_user.user_id)
    return {"message": "Product deleted successfully"}
