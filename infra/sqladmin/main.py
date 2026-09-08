import os
import hmac
import time
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

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@db:5432/postgres"
)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://kong:8000")
SERVICE_ROLE_KEY = os.environ.get("SERVICE_ROLE_KEY", "")

ADMIN_USER = os.environ["ADMIN_USER"]
ADMIN_PASS = os.environ["ADMIN_PASS"]
SECRET_KEY = os.environ["SECRET_KEY"]
if len(SECRET_KEY) < 32 or len(ADMIN_PASS) < 12:
    raise RuntimeError("SECRET_KEY (>=32) e ADMIN_PASS (>=12) precisam ser fortes.")

engine = create_engine(DB_URL, pool_pre_ping=True, pool_recycle=300)

_LOGIN_FAILS: dict[str, list[float]] = {}
_LOCKOUT_WINDOW = 900
_LOCKOUT_MAX = 5

def _client_ip(request: StarletteRequest) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return (xff.split(",")[0].strip() if xff else "") or (request.client.host if request.client else "unknown")

def _is_locked(ip: str) -> bool:
    now = time.time()
    fails = [t for t in _LOGIN_FAILS.get(ip, []) if now - t < _LOCKOUT_WINDOW]
    _LOGIN_FAILS[ip] = fails
    return len(fails) >= _LOCKOUT_MAX

def _record_fail(ip: str) -> None:
    _LOGIN_FAILS.setdefault(ip, []).append(time.time())

class AdminAuth(AuthenticationBackend):
    async def login(self, request: StarletteRequest) -> bool:
        ip = _client_ip(request)
        if _is_locked(ip):
            return False
        form = await request.form()
        user_ok = hmac.compare_digest(str(form.get("username") or ""), ADMIN_USER)
        pass_ok = hmac.compare_digest(str(form.get("password") or ""), ADMIN_PASS)
        if user_ok and pass_ok:
            _LOGIN_FAILS.pop(ip, None)
            request.session.update({"authenticated": True, "ts": int(time.time())})
            return True
        _record_fail(ip)
        return False

    async def logout(self, request: StarletteRequest) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: StarletteRequest) -> bool:
        return request.session.get("authenticated", False)

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="RouteDelivery Admin", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    same_site="strict",
    https_only=os.environ.get("SQLADMIN_HTTPS_ONLY", "true").lower() == "true",
    max_age=60 * 60 * 8,
)

templates = Jinja2Templates(directory="/app/templates")

auth_backend = AdminAuth(secret_key=SECRET_KEY)
admin = Admin(
    app,
    engine,
    title="RouteDelivery Admin",
    authentication_backend=auth_backend,
    base_url="/admin",
)

for view in get_table_views():
    try:
        admin.add_view(view)
    except Exception as e:
        print(f"Erro ao registrar view {view}: {e}")

def supabase_headers():
    return {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "apikey": SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }

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

# SEGURANÇA C7: normaliza um caminho de storage rejeitando '..', barra inicial,
# byte nulo e segmentos vazios (path traversal).
def _safe_storage_path(*parts: str) -> str:
    segs: list[str] = []
    for part in parts:
        for seg in str(part or "").replace("\\", "/").split("/"):
            seg = seg.strip()
            if seg in ("", "."):
                continue
            if seg == ".." or "\x00" in seg:
                raise HTTPException(status_code=400, detail="caminho inválido")
            segs.append(seg)
    return "/".join(segs)

@app.post("/admin-panel/storage/{bucket}/upload")
async def upload_file(request: Request, bucket: str, file: UploadFile = File(...), path: str = Form("")):
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=401)

    content = await file.read()
    obj_path = _safe_storage_path(path, file.filename or "")
    if not obj_path:
        raise HTTPException(status_code=400, detail="nome de arquivo inválido")

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

    safe_path = _safe_storage_path(path)
    if not safe_path:
        raise HTTPException(status_code=400, detail="caminho inválido")

    async with httpx.AsyncClient(timeout=15) as client:
        await client.delete(
            f"{SUPABASE_URL}/storage/v1/object/{bucket}/{safe_path}",
            headers=supabase_headers(),
        )
    prefix = "/".join(safe_path.split("/")[:-1])
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
