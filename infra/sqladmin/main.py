import os
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Form, Depends, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy import create_engine, text, inspect, MetaData
from sqlalchemy.ext.automap import automap_base
from sqladmin import Admin, ModelView
from sqladmin.models import ModelViewMeta
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request as StarletteRequest
import json

# ── Configuração ─────────────────────────────────────────────
DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@db:5432/postgres"
)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://kong:8000")
SERVICE_ROLE_KEY = os.environ.get("SERVICE_ROLE_KEY", "")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin")
SECRET_KEY = os.environ.get("SECRET_KEY", "routedelivery-secret-key-change-me")

engine = create_engine(DB_URL, pool_pre_ping=True, pool_recycle=300)

# ── Auth do painel ───────────────────────────────────────────
class AdminAuth(AuthenticationBackend):
    async def login(self, request: StarletteRequest) -> bool:
        form = await request.form()
        if form.get("username") == ADMIN_USER and form.get("password") == ADMIN_PASS:
            request.session.update({"authenticated": True})
            return True
        return False

    async def logout(self, request: StarletteRequest) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: StarletteRequest) -> bool:
        return request.session.get("authenticated", False)

# ── Auto-descoberta de tabelas ───────────────────────────────
def get_table_views():
    """Gera ModelViews para todas as tabelas do schema public via automap."""
    try:
        Base = automap_base()
        Base.prepare(engine, reflect=True, schema="public")
    except Exception as e:
        print(f"Erro ao preparar automap: {e}")
        return []

    views = []
    for cls in Base.classes:
        try:
            table_name = cls.__table__.name
            display_name = table_name.replace("_", " ").title()

            # Determina colunas para exibir na listagem (primeiras 8)
            mapper = cls.__mapper__
            col_names = [c.key for c in mapper.columns]
            list_cols = col_names[:8]

            view_cls = ModelViewMeta(
                f"{table_name}_AdminView",
                (ModelView,),
                {
                    "name": display_name,
                    "category": "Dados",
                    "column_list": list_cols,
                    "column_searchable_list": [
                        c for c in col_names
                        if any(t in c for t in ["nome", "name", "email", "status", "descricao", "texto"])
                    ],
                    "page_size": 50,
                    "can_create": True,
                    "can_edit": True,
                    "can_delete": True,
                    "can_export": True,
                },
                model=cls,
            )
            views.append(view_cls)
        except Exception as e:
            print(f"Erro ao gerar view para {cls}: {e}")
            continue
    return views

# ── App ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="RouteDelivery Admin", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

templates = Jinja2Templates(directory="/app/templates")

auth_backend = AdminAuth(secret_key=SECRET_KEY)
admin = Admin(
    app,
    engine,
    title="RouteDelivery Admin",
    authentication_backend=auth_backend,
    base_url="/admin",
)

# Registrar views de todas as tabelas
for view in get_table_views():
    try:
        admin.add_view(view)
    except Exception as e:
        print(f"Erro ao registrar view {view}: {e}")

# ── Helpers HTTP ─────────────────────────────────────────────
def supabase_headers():
    return {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "apikey": SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }

# ── Rotas customizadas: Auth Users ───────────────────────────
@app.get("/admin-panel/auth-users", response_class=HTMLResponse)
async def list_auth_users(request: Request, page: int = 1):
    if not request.session.get("authenticated"):
        return RedirectResponse("/admin/login")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/admin/users?page={page}&per_page=50",
            headers=supabase_headers(),
        )
    users = resp.json().get("users", resp.json() if isinstance(resp.json(), list) else [])
    return templates.TemplateResponse("auth_users.html", {
        "request": request,
        "users": users,
        "page": page,
    })

@app.post("/admin-panel/auth-users/create")
async def create_auth_user(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    role: str = Form("cliente"),
):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=supabase_headers(),
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"role": role},
            },
        )
    if resp.status_code in (200, 201):
        return RedirectResponse("/admin-panel/auth-users", status_code=303)
    return JSONResponse({"error": resp.text}, status_code=resp.status_code)

@app.post("/admin-panel/auth-users/{user_id}/delete")
async def delete_auth_user(request: Request, user_id: str):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    async with httpx.AsyncClient(timeout=15) as client:
        await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=supabase_headers(),
        )
    return RedirectResponse("/admin-panel/auth-users", status_code=303)

@app.post("/admin-panel/auth-users/{user_id}/reset-password")
async def reset_password(request: Request, user_id: str, new_password: str = Form(...)):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.put(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=supabase_headers(),
            json={"password": new_password},
        )
    return RedirectResponse("/admin-panel/auth-users", status_code=303)

# ── Rotas customizadas: Storage ──────────────────────────────
@app.get("/admin-panel/storage", response_class=HTMLResponse)
async def storage_buckets(request: Request):
    if not request.session.get("authenticated"):
        return RedirectResponse("/admin/login")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/storage/v1/bucket",
            headers=supabase_headers(),
        )
    buckets = resp.json() if resp.status_code == 200 else []
    return templates.TemplateResponse("storage_buckets.html", {
        "request": request,
        "buckets": buckets,
    })

@app.get("/admin-panel/storage/{bucket}", response_class=HTMLResponse)
async def storage_files(request: Request, bucket: str, prefix: str = ""):
    if not request.session.get("authenticated"):
        return RedirectResponse("/admin/login")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/list/{bucket}",
            headers=supabase_headers(),
            json={"prefix": prefix, "limit": 200, "offset": 0},
        )
    files = resp.json() if resp.status_code == 200 else []
    return templates.TemplateResponse("storage_files.html", {
        "request": request,
        "bucket": bucket,
        "files": files,
        "prefix": prefix,
    })

@app.post("/admin-panel/storage/{bucket}/upload")
async def upload_file(request: Request, bucket: str, file: UploadFile = File(...), path: str = Form("")):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    content = await file.read()
    obj_path = f"{path}/{file.filename}".lstrip("/") if path else file.filename
    headers = {**supabase_headers(), "Content-Type": file.content_type or "application/octet-stream"}
    del headers["Content-Type"]

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/{bucket}/{obj_path}",
            headers={**supabase_headers(), "Content-Type": file.content_type or "application/octet-stream"},
            content=content,
        )
    return RedirectResponse(f"/admin-panel/storage/{bucket}?prefix={path}", status_code=303)

@app.post("/admin-panel/storage/{bucket}/delete")
async def delete_file(request: Request, bucket: str, path: str = Form(...)):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    async with httpx.AsyncClient(timeout=15) as client:
        await client.delete(
            f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
            headers=supabase_headers(),
        )
    prefix = "/".join(path.split("/")[:-1])
    return RedirectResponse(f"/admin-panel/storage/{bucket}?prefix={prefix}", status_code=303)

@app.post("/admin-panel/storage/bucket/create")
async def create_bucket(request: Request, bucket_name: str = Form(...), public: bool = Form(False)):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(
            f"{SUPABASE_URL}/storage/v1/bucket",
            headers=supabase_headers(),
            json={"id": bucket_name, "name": bucket_name, "public": public},
        )
    return RedirectResponse("/admin-panel/storage", status_code=303)

# ── SQL Editor ───────────────────────────────────────────────
@app.get("/admin-panel/sql", response_class=HTMLResponse)
async def sql_editor(request: Request):
    if not request.session.get("authenticated"):
        return RedirectResponse("/admin/login")
    return templates.TemplateResponse("sql_editor.html", {"request": request, "result": None, "query": ""})

@app.post("/admin-panel/sql", response_class=HTMLResponse)
async def run_sql(request: Request, query: str = Form(...)):
    if not request.session.get("authenticated"):
        return RedirectResponse("/admin/login")

    result = None
    error = None
    columns = []
    rows = []

    try:
        with engine.connect() as conn:
            res = conn.execute(text(query))
            if res.returns_rows:
                columns = list(res.keys())
                rows = [list(r) for r in res.fetchmany(500)]
                result = {"columns": columns, "rows": rows, "count": len(rows)}
            else:
                conn.commit()
                result = {"message": f"OK — {res.rowcount} linhas afetadas"}
    except Exception as e:
        error = str(e)

    return templates.TemplateResponse("sql_editor.html", {
        "request": request,
        "result": result,
        "error": error,
        "query": query,
    })

# ── Dashboard ─────────────────────────────────────────────────
@app.get("/admin-panel", response_class=HTMLResponse)
async def dashboard(request: Request):
    if not request.session.get("authenticated"):
        return RedirectResponse("/admin/login")

    stats = {}
    try:
        with engine.connect() as conn:
            # Contagem das principais tabelas
            for table in ["clientes", "nova_entrega", "pedidos", "entregadores", "users"]:
                try:
                    # nosemgrep: python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text -- table vem da lista literal hardcoded acima, nunca de input do usuário
                    r = conn.execute(text(f"SELECT COUNT(*) FROM public.{table}"))
                    stats[table] = r.scalar()
                except Exception:
                    stats[table] = "—"
    except Exception as e:
        stats["error"] = str(e)

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "stats": stats,
    })
