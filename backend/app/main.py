"""AAROGYA ALERT FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import alerts, detection, health, investigations, observations, regions, reviewers
from app.config import get_settings
from app.database import init_db
from app.seed_data import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed_if_empty()
    yield


settings = get_settings()
app = FastAPI(
    title="AAROGYA ALERT API",
    version=settings.api_version,
    description=(
        "Synthetic, aggregate-only early-warning demonstration API. Signals indicate review priority, "
        "not confirmed disease or outbreak probability."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": "Request validation failed.", "details": jsonable_encoder(exc.errors())}},
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "request_error", "message": str(exc.detail)}},
    )


@app.exception_handler(Exception)
async def generic_error_handler(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "An unexpected server error occurred."}})


app.include_router(health.router)
app.include_router(regions.router)
app.include_router(observations.router)
app.include_router(detection.router)
app.include_router(alerts.router)
app.include_router(investigations.router)
app.include_router(reviewers.router)
