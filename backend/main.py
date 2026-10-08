from contextlib import asynccontextmanager
import hashlib
import hmac
import os
import re
from pathlib import Path
from secrets import token_urlsafe
from sqlite3 import Connection, Row, connect
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv
import pymysql

ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = ROOT / "greenlife.db"
load_dotenv(ROOT / ".env")
USE_MYSQL = os.getenv("GREENLIFE_DB", "sqlite").lower() == "mysql"

SEED_PRODUCTS = [
    ("Cold-pressed golden oil", "Pantry", 420, "500 ml", "Bestseller", "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=85"),
    ("Wildflower honey", "Pantry", 560, "350 g", "Raw & unfiltered", "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=700&q=85"),
    ("Hand-thrown stoneware mug", "Home", 780, "1 piece", "Made by hand", "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=700&q=85"),
    ("Botanical face oil", "Body", 890, "30 ml", "New", "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85"),
    ("Organic rolled oats", "Pantry", 295, "500 g", "Everyday essential", "https://images.unsplash.com/photo-1614961233913-a5113a4a34ed?auto=format&fit=crop&w=700&q=85"),
    ("Linen kitchen towels", "Home", 650, "Set of 2", "Low-impact", "https://images.unsplash.com/photo-1583845112203-454c39c2a7e1?auto=format&fit=crop&w=700&q=85"),
    ("Neem & tulsi bar soap", "Body", 180, "100 g", "Plastic-free", "https://images.unsplash.com/photo-1607006344380-b6775a0824a7?auto=format&fit=crop&w=700&q=85"),
    ("Calm herbal tea blend", "Wellness", 460, "40 g", "Small batch", "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=700&q=85"),
]

DEMO_SESSIONS: dict[str, dict[str, str]] = {}
ORDER_STATUSES = ("Placed", "Packed", "Shipped", "Delivered")
ADMIN_EMAIL = os.getenv("GREENLIFE_ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.getenv("GREENLIFE_ADMIN_PASSWORD", "")


def normalize_customer_name(email: str) -> str:
    local_part = email.split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ").strip()
    if not local_part:
        return "Customer"
    return " ".join(part.capitalize() for part in local_part.split() if part)


class CompatibleRow(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class CompatibleResult:
    def __init__(self, cursor, mysql: bool):
        self.cursor = cursor
        self.mysql = mysql
        self.rowcount = cursor.rowcount
        self.lastrowid = cursor.lastrowid

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return CompatibleRow(row) if self.mysql else row

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [CompatibleRow(row) for row in rows] if self.mysql else rows


class DatabaseConnection:
    def __init__(self):
        self.mysql = USE_MYSQL
        if self.mysql:
            mysql_options = {
                "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
                "port": int(os.getenv("MYSQL_PORT", "3306")),
                "user": os.getenv("MYSQL_USER", "root"),
                "password": os.getenv("MYSQL_PASSWORD", ""),
                "cursorclass": pymysql.cursors.DictCursor,
                "autocommit": False,
            }
            database = os.getenv("MYSQL_DATABASE", "greenlife")
            try:
                self.connection = pymysql.connect(database=database, **mysql_options)
            except pymysql.err.OperationalError as error:
                if error.args and error.args[0] == 1049:
                    bootstrap = pymysql.connect(**mysql_options)
                    with bootstrap.cursor() as cursor:
                        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database}`")
                    bootstrap.commit()
                    bootstrap.close()
                    self.connection = pymysql.connect(database=database, **mysql_options)
                else:
                    raise
        else:
            self.connection = connect(DATABASE_PATH)
            self.connection.row_factory = Row

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.connection.close()

    def execute(self, query, parameters=()):
        if self.mysql:
            cursor = self.connection.cursor()
            cursor.execute(query.replace("?", "%s"), tuple(parameters))
            return CompatibleResult(cursor, True)
        return self.connection.execute(query, parameters)

    def executemany(self, query, parameters):
        if self.mysql:
            cursor = self.connection.cursor()
            cursor.executemany(query.replace("?", "%s"), parameters)
            return CompatibleResult(cursor, True)
        return self.connection.executemany(query, parameters)

    def commit(self):
        self.connection.commit()


def get_connection() -> DatabaseConnection:
    return DatabaseConnection()


def initialize_database() -> None:
    with get_connection() as connection:
        if connection.mysql:
            connection.execute("""CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(120) NOT NULL,
                category VARCHAR(40) NOT NULL,
                price INT NOT NULL,
                unit VARCHAR(30) NOT NULL,
                tag VARCHAR(40) NOT NULL,
                image VARCHAR(500) NOT NULL,
                brand VARCHAR(80) NOT NULL DEFAULT 'GreenLife Makers',
                rating DECIMAL(2,1) NOT NULL DEFAULT 4.8,
                stock INT NOT NULL DEFAULT 12,
                description VARCHAR(500) NOT NULL
            )""")
            connection.execute("""CREATE TABLE IF NOT EXISTS orders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_name VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL,
                address VARCHAR(300) NOT NULL,
                total INT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'Placed',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            connection.execute("""CREATE TABLE IF NOT EXISTS order_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL,
                unit_price INT NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )""")
            connection.execute("""CREATE TABLE IF NOT EXISTS reviews (
                id INT PRIMARY KEY AUTO_INCREMENT,
                product_id INT NOT NULL,
                customer_name VARCHAR(80) NOT NULL,
                rating INT NOT NULL,
                comment VARCHAR(500) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id)
            )""")
            connection.execute("""CREATE TABLE IF NOT EXISTS wishlist (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_key VARCHAR(100) NOT NULL,
                product_id INT NOT NULL,
                UNIQUE KEY unique_wishlist (customer_key, product_id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )""")
            connection.execute("""CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(300) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            product_count = connection.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"]
            if product_count == 0:
                connection.executemany("INSERT INTO products (name, category, price, unit, tag, image) VALUES (?, ?, ?, ?, ?, ?)", SEED_PRODUCTS)
            connection.commit()
            return
        connection.execute(
            """CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price INTEGER NOT NULL CHECK(price >= 0),
                unit TEXT NOT NULL,
                tag TEXT NOT NULL,
                image TEXT NOT NULL,
                brand TEXT NOT NULL DEFAULT 'GreenLife Makers',
                rating REAL NOT NULL DEFAULT 4.8,
                stock INTEGER NOT NULL DEFAULT 12 CHECK(stock >= 0),
                description TEXT NOT NULL DEFAULT 'Thoughtfully sourced organic essential for everyday living.'
            )"""
        )
        product_columns = {row["name"] for row in connection.execute("PRAGMA table_info(products)").fetchall()}
        migrations = {
            "brand": "ALTER TABLE products ADD COLUMN brand TEXT NOT NULL DEFAULT 'GreenLife Makers'",
            "rating": "ALTER TABLE products ADD COLUMN rating REAL NOT NULL DEFAULT 4.8",
            "stock": "ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 12",
            "description": "ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT 'Thoughtfully sourced organic essential for everyday living.'",
        }
        for column, statement in migrations.items():
            if column not in product_columns:
                connection.execute(statement)
        connection.execute(
            """CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name TEXT NOT NULL,
                email TEXT NOT NULL,
                address TEXT NOT NULL,
                total INTEGER NOT NULL CHECK(total >= 0),
                status TEXT NOT NULL DEFAULT 'Confirmed',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id),
                customer_name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                comment TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS wishlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_key TEXT NOT NULL,
                product_id INTEGER NOT NULL REFERENCES products(id),
                UNIQUE(customer_key, product_id)
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                phone TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                quantity INTEGER NOT NULL CHECK(quantity > 0),
                unit_price INTEGER NOT NULL CHECK(unit_price >= 0)
            )"""
        )
        product_count = connection.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if product_count == 0:
            connection.executemany(
                "INSERT INTO products (name, category, price, unit, tag, image) VALUES (?, ?, ?, ?, ?, ?)",
                SEED_PRODUCTS,
            )
        connection.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="GreenLife Store API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/css", StaticFiles(directory=ROOT / "css"), name="css")
app.mount("/js", StaticFiles(directory=ROOT / "js"), name="js")
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")


class OrderItem(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=99)


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    address: str = Field(min_length=8, max_length=300)
    items: list[OrderItem] = Field(min_length=1, max_length=50)
    payment_method: str = Field(default="COD", pattern="^(COD|UPI|Card)$")


class ReviewCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=80)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=5, max_length=500)


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=40)
    price: int = Field(ge=0)
    unit: str = Field(min_length=1, max_length=30)
    tag: str = Field(min_length=1, max_length=40)
    image: str = Field(min_length=10, max_length=500)
    brand: str = Field(default="GreenLife Makers", max_length=80)
    stock: int = Field(ge=0)
    description: str = Field(min_length=10, max_length=500)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    role: Literal["customer", "admin"] = "customer"


class ProfileCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    phone: str = Field(pattern=r"^\d{10}$")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 120_000)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


@app.get("/", include_in_schema=False)
def serve_homepage() -> FileResponse:
    return FileResponse(ROOT / "pages" / "login.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    return Response(status_code=204)


@app.get("/{page_name}.html", include_in_schema=False)
def serve_page(page_name: str) -> FileResponse:
    allowed_pages = {"shop", "product", "checkout", "account", "admin", "login", "index", "order-details", "delivery"}
    if page_name not in allowed_pages:
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(ROOT / "pages" / f"{page_name}.html")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "greenlife-store"}


@app.get("/api/products")
def list_products(
    category: Annotated[str | None, Query(max_length=30)] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[str, Query(pattern="^(featured|price-low|price-high)$")] = "featured",
    min_price: Annotated[int | None, Query(ge=0)] = None,
    max_price: Annotated[int | None, Query(ge=0)] = None,
    brand: Annotated[str | None, Query(max_length=80)] = None,
    min_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
    in_stock: bool = False,
) -> list[dict]:
    query = "SELECT id, name, category, price, unit, tag, image, brand, rating, stock, description FROM products"
    clauses: list[str] = []
    parameters: list[str] = []
    if category and category != "All":
        clauses.append("category = ?")
        parameters.append(category)
    if search:
        clauses.append("(name LIKE ? OR category LIKE ?)")
        search_value = f"%{search}%"
        parameters.extend([search_value, search_value])
    if min_price is not None:
        clauses.append("price >= ?")
        parameters.append(str(min_price))
    if max_price is not None:
        clauses.append("price <= ?")
        parameters.append(str(max_price))
    if brand:
        clauses.append("brand = ?")
        parameters.append(brand)
    if min_rating is not None:
        clauses.append("rating >= ?")
        parameters.append(str(min_rating))
    if in_stock:
        clauses.append("stock > 0")
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += {"price-low": " ORDER BY price ASC", "price-high": " ORDER BY price DESC"}.get(sort, " ORDER BY id ASC")
    with get_connection() as connection:
        return [dict(row) for row in connection.execute(query, parameters).fetchall()]


@app.get("/api/products/{product_id}")
def get_product(product_id: int) -> dict:
    with get_connection() as connection:
        product = connection.execute(
            "SELECT id, name, category, price, unit, tag, image, brand, rating, stock, description FROM products WHERE id = ?",
            (product_id,),
        ).fetchone()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return dict(product)


@app.get("/api/products/{product_id}/reviews")
def list_reviews(product_id: int) -> list[dict]:
    with get_connection() as connection:
        return [dict(row) for row in connection.execute("SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC", (product_id,)).fetchall()]


@app.post("/api/products/{product_id}/reviews", status_code=201)
def create_review(product_id: int, review: ReviewCreate) -> dict:
    with get_connection() as connection:
        if connection.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Product not found")
        cursor = connection.execute(
            "INSERT INTO reviews (product_id, customer_name, rating, comment) VALUES (?, ?, ?, ?)",
            (product_id, review.customer_name.strip(), review.rating, review.comment.strip()),
        )
        connection.execute("UPDATE products SET rating = (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = ?) WHERE id = ?", (product_id, product_id))
        connection.commit()
    return {"id": cursor.lastrowid, "message": "Review submitted"}


@app.post("/api/auth/register", status_code=201)
def register_profile(profile: ProfileCreate) -> dict[str, str]:
    if ADMIN_EMAIL and profile.email.lower() == ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin profile cannot be created here")
    normalized_phone = re.sub(r"\D", "", profile.phone)
    if len(normalized_phone) != 10:
        raise HTTPException(status_code=400, detail="Phone number must be exactly 10 digits")
    with get_connection() as connection:
        if connection.execute("SELECT id FROM users WHERE email = ?", (str(profile.email).lower(),)).fetchone():
            raise HTTPException(status_code=409, detail="A profile with this email already exists")
        connection.execute(
            "INSERT INTO users (full_name, email, password_hash, phone) VALUES (?, ?, ?, ?)",
            (profile.full_name.strip(), str(profile.email).lower(), hash_password(profile.password), normalized_phone),
        )
        connection.commit()
    return {"message": "Profile created. You can now sign in."}


@app.post("/api/auth/login")
def login(request: LoginRequest) -> dict[str, str]:
    email = str(request.email).lower()
    if request.role == "admin":
        if not ADMIN_EMAIL or not ADMIN_PASSWORD:
            raise HTTPException(
                status_code=503,
                detail="Admin sign-in is disabled. Set GREENLIFE_ADMIN_EMAIL and GREENLIFE_ADMIN_PASSWORD in .env, then restart the server.",
            )
        if email != ADMIN_EMAIL:
            raise HTTPException(status_code=403, detail="Only the configured admin account can use Admin sign in")
        if not hmac.compare_digest(request.password, ADMIN_PASSWORD):
            raise HTTPException(status_code=401, detail="Invalid admin credentials")
        role = "admin"
        session_data = {"email": email, "role": role, "full_name": "GreenLife Admin"}
    else:
        if ADMIN_EMAIL and email == ADMIN_EMAIL:
            raise HTTPException(status_code=403, detail="Select Admin to continue with the admin account")
        with get_connection() as connection:
            user = connection.execute("SELECT id, full_name, email, password_hash, phone FROM users WHERE email = ?", (email,)).fetchone()
            if user is not None:
                if not verify_password(request.password, user["password_hash"]):
                    raise HTTPException(status_code=401, detail="Profile not found or password is incorrect")
                role = "customer"
                session_data = {"user_id": str(user["id"]), "email": user["email"], "role": role, "full_name": user["full_name"], "phone": user["phone"]}
            else:
                if len(request.password) < 6:
                    raise HTTPException(status_code=401, detail="Password must be at least 6 characters")
                full_name = normalize_customer_name(email)
                phone = "Not provided"
                connection.execute(
                    "INSERT INTO users (full_name, email, password_hash, phone) VALUES (?, ?, ?, ?)",
                    (full_name, email, hash_password(request.password), phone),
                )
                connection.commit()
                created_user = connection.execute(
                    "SELECT id, full_name, email, password_hash, phone FROM users WHERE email = ?",
                    (email,),
                ).fetchone()
                role = "customer"
                session_data = {
                    "user_id": str(created_user["id"]),
                    "email": created_user["email"],
                    "role": role,
                    "full_name": created_user["full_name"],
                    "phone": created_user["phone"],
                }
    token = token_urlsafe(24)
    DEMO_SESSIONS[token] = session_data
    return {"token": token, "role": role, "email": email, "full_name": session_data["full_name"], "message": "Login successful"}


def require_session(x_auth_token: Annotated[str | None, Header()] = None) -> dict[str, str]:
    session = DEMO_SESSIONS.get(x_auth_token or "")
    if not session:
        raise HTTPException(status_code=401, detail="Sign in required")
    return session


@app.get("/api/profile")
def get_profile(session: dict[str, str] = Depends(require_session)) -> dict[str, str]:
    if session.get("role") == "customer":
        with get_connection() as connection:
            user = connection.execute(
                "SELECT id, full_name, email, phone FROM users WHERE email = ?",
                (str(session.get("email", "")).lower(),),
            ).fetchone()
        if user is not None:
            session["user_id"] = str(user["id"])
            session["full_name"] = user["full_name"]
            session["email"] = user["email"]
            session["phone"] = user["phone"]
    return session


def require_admin(x_auth_token: Annotated[str | None, Header()] = None) -> dict[str, str]:
    session = DEMO_SESSIONS.get(x_auth_token or "")
    if not session or session.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Admin sign in required")
    return session


@app.get("/api/wishlist")
def get_wishlist(customer_key: Annotated[str, Query(min_length=3, max_length=100)]) -> list[dict]:
    with get_connection() as connection:
        return [dict(row) for row in connection.execute("SELECT products.* FROM wishlist JOIN products ON products.id = wishlist.product_id WHERE customer_key = ?", (customer_key,)).fetchall()]


@app.post("/api/wishlist/{product_id}")
def add_wishlist(product_id: int, customer_key: Annotated[str, Query(min_length=3, max_length=100)]) -> dict[str, str]:
    with get_connection() as connection:
        if connection.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Product not found")
        connection.execute("INSERT OR IGNORE INTO wishlist (customer_key, product_id) VALUES (?, ?)", (customer_key, product_id))
        connection.commit()
    return {"message": "Saved to wishlist"}


@app.delete("/api/wishlist/{product_id}")
def remove_wishlist(product_id: int, customer_key: Annotated[str, Query(min_length=3, max_length=100)]) -> dict[str, str]:
    with get_connection() as connection:
        connection.execute("DELETE FROM wishlist WHERE customer_key = ? AND product_id = ?", (customer_key, product_id))
        connection.commit()
    return {"message": "Removed from wishlist"}


@app.post("/api/orders", status_code=201)
def create_order(order: OrderCreate) -> dict:
    product_ids = [item.product_id for item in order.items]
    placeholders = ",".join("?" for _ in product_ids)
    with get_connection() as connection:
        product_rows = connection.execute(
            f"SELECT id, price, stock FROM products WHERE id IN ({placeholders})", product_ids
        ).fetchall()
        products = {row["id"]: row for row in product_rows}
        missing_ids = [product_id for product_id in product_ids if product_id not in products]
        if missing_ids:
            raise HTTPException(status_code=404, detail=f"Product not found: {missing_ids[0]}")
        for item in order.items:
            if products[item.product_id]["stock"] < item.quantity:
                raise HTTPException(status_code=409, detail=f"Only {products[item.product_id]['stock']} left in stock")
        total = sum(products[item.product_id]["price"] * item.quantity for item in order.items)
        cursor = connection.execute(
            "INSERT INTO orders (customer_name, email, address, total, status) VALUES (?, ?, ?, ?, ?)",
            (order.customer_name.strip(), order.email, order.address.strip(), total, "Placed"),
        )
        order_id = cursor.lastrowid
        connection.executemany(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
            [(order_id, item.product_id, item.quantity, products[item.product_id]["price"]) for item in order.items],
        )
        connection.executemany("UPDATE products SET stock = stock - ? WHERE id = ?", [(item.quantity, item.product_id) for item in order.items])
        connection.commit()
    return {"id": order_id, "status": "Placed", "total": total, "payment_method": order.payment_method, "message": "Order placed successfully"}


@app.get("/api/orders/{order_id}")
def get_order(order_id: int) -> dict:
    with get_connection() as connection:
        order = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        items = connection.execute(
                """SELECT order_items.product_id, products.name, order_items.quantity, order_items.unit_price
                    FROM order_items LEFT JOIN products ON products.id = order_items.product_id
               WHERE order_items.order_id = ?""",
            (order_id,),
        ).fetchall()
    result = dict(order)
    result["items"] = [dict(item) for item in items]
    return result


@app.get("/api/admin/summary")
def admin_summary(_: dict[str, str] = Depends(require_admin)) -> dict:
    with get_connection() as connection:
        revenue = connection.execute("SELECT COALESCE(SUM(total), 0) FROM orders").fetchone()[0]
        orders = connection.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        products = connection.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        low_stock = connection.execute("SELECT COUNT(*) FROM products WHERE stock < 5").fetchone()[0]
        sales = [dict(row) for row in connection.execute("SELECT DATE(created_at) AS day, SUM(total) AS revenue FROM orders GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 7").fetchall()]
    return {"revenue": revenue, "orders": orders, "products": products, "low_stock": low_stock, "sales": sales}


@app.get("/api/admin/orders")
def admin_orders(_: dict[str, str] = Depends(require_admin)) -> list[dict]:
    with get_connection() as connection:
        orders = [dict(row) for row in connection.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()]
        for order in orders:
            order["items"] = [
                dict(item)
                for item in connection.execute(
                          """SELECT order_items.product_id, products.name, order_items.quantity, order_items.unit_price
                              FROM order_items LEFT JOIN products ON products.id = order_items.product_id
                       WHERE order_items.order_id = ?""",
                    (order["id"],),
                ).fetchall()
            ]
        return orders


@app.patch("/api/admin/orders/{order_id}/status")
def update_order_status(order_id: int, status: Annotated[str, Query(pattern="^(Placed|Packed|Shipped|Delivered)$")], _: dict[str, str] = Depends(require_admin)) -> dict[str, str]:
    with get_connection() as connection:
        cursor = connection.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Order not found")
        connection.commit()
    return {"status": status, "message": "Order status updated"}


@app.post("/api/admin/products", status_code=201)
def create_product(product: ProductCreate, _: dict[str, str] = Depends(require_admin)) -> dict:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO products (name, category, price, unit, tag, image, brand, stock, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (product.name.strip(), product.category.strip(), product.price, product.unit.strip(), product.tag.strip(), product.image, product.brand.strip(), product.stock, product.description.strip()),
        )
        connection.commit()
        created = connection.execute("SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(created)


@app.delete("/api/admin/products/{product_id}")
def delete_product(product_id: int, _: dict[str, str] = Depends(require_admin)) -> dict[str, str]:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM products WHERE id = ?", (product_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Product not found")
        connection.commit()
    return {"message": "Product deleted"}
