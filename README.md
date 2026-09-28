# GreenLife Store

A full-stack organic products store built from the GreenLife synopsis.

## Stack

- Frontend: HTML, CSS, JavaScript, Lucide icons
- Backend: Python, FastAPI, Uvicorn
- Database: MySQL (with SQLite fallback when `GREENLIFE_DB` is not set to `mysql`)

## Run locally

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

For development reload without watching the virtual environment:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 --reload-dir backend --reload-dir css --reload-dir js --reload-dir pages
```

## MySQL setup

Install MySQL Server, make sure it is running, copy `.env.example` to `.env`, and set:

```env
GREENLIFE_DB=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=greenlife
```

The application creates the `greenlife` database and tables automatically when the MySQL user has permission to create databases. Leave `GREENLIFE_DB=sqlite` for a zero-setup local demo.

## Admin sign-in

Set private `GREENLIFE_ADMIN_EMAIL` and `GREENLIFE_ADMIN_PASSWORD` values in `.env` to enable admin sign-in. These values have no defaults; admin sign-in stays disabled until both are configured. Do not commit `.env` or share the credentials.

For example, add these keys to `.env` and replace the values with your own private credentials:

```env
GREENLIFE_ADMIN_EMAIL=your-admin-email@example.com
GREENLIFE_ADMIN_PASSWORD=your-strong-private-password
```

Restart Uvicorn after changing `.env`.

Open `http://127.0.0.1:8000` in a browser.

FastAPI documentation is available at `http://127.0.0.1:8000/docs`.

## Login access

- Customer: use any valid email and a password with at least 6 characters on `account.html`.
- Admin: use the private credentials configured in `.env`.
- Admin APIs require the admin session token and return `401` to unauthenticated users.

## API routes

- `GET /api/health`
- `GET /api/products?category=Pantry&sort=price-low`
- `POST /api/orders`
- `GET /api/orders/{order_id}`
- `GET /api/admin/summary`
- `GET /api/admin/orders`
- `POST /api/admin/products`

The SQLite database is created and seeded automatically on first startup.
