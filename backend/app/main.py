from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from .logging_config import configure_logging
from .middleware.request_id import RequestIdMiddleware
from .routes import health, imports, jobs, places, provider_ops, webhooks
from .services.places import close_client as close_places_client

configure_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: nothing to do yet.
    yield
    # Shutdown: close shared httpx client from places service.
    await close_places_client()


app = FastAPI(
    title="Provider Harmony Hub Backend",
    version="0.1.0",
    description=(
        "Thin FastAPI layer for Google Places proxy, CSV imports, "
        "webhook receivers, and cross-subsystem orchestration. "
        "CRUD and auth are handled directly by Supabase."
    ),
    lifespan=lifespan,
)

# Middleware (registration order = execution order, outer-to-inner).
# Request ID must be outer so it's bound before any error handlers log.
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

# Exception handlers
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Routes
app.include_router(health.router)
app.include_router(places.router)
app.include_router(imports.router)
app.include_router(jobs.router)
app.include_router(provider_ops.router)
app.include_router(webhooks.router)


@app.get("/")
async def root() -> dict:
    return {
        "service": "Provider Harmony Hub Backend",
        "docs": "/docs",
        "health": "/health",
    }
