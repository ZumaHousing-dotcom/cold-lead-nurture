"""Zuma Cold Lead Nurture - FastAPI app.

Run:  uvicorn app.main:create_app --factory
"""
from __future__ import annotations

import hmac
import logging
import re
from contextlib import asynccontextmanager
from typing import Callable, Optional, Union

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .config import Settings
from .db import Database
from .jobs import run_abandon_job
from .mailchimp import MailchimpClient
from .nudge import generate_nudge
from .ratelimit import RateLimiter

log = logging.getLogger("zuma")

DEFAULT_SOURCE = "netlify_form"


class LeadIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    first_name: str = Field(default="", max_length=100)
    room_interest: str = Field(default="", max_length=200)
    step: Union[str, int, None] = None
    completed: bool = False
    source: str = DEFAULT_SOURCE  # future: "appfolio"

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("first_name", "room_interest", mode="before")
    @classmethod
    def _strip(cls, v):
        return (v or "").strip() if isinstance(v, str) or v is None else str(v)

    @field_validator("source", mode="before")
    @classmethod
    def _source(cls, v):
        v = (v or DEFAULT_SOURCE)
        v = str(v).strip().lower() or DEFAULT_SOURCE
        if not re.fullmatch(r"[a-z0-9_]{1,40}", v):
            raise ValueError("source must be 1-40 chars of a-z, 0-9, _")
        return v


def create_app(settings: Optional[Settings] = None, mailchimp=None,
               nudge_fn: Optional[Callable] = None, start_scheduler: bool = True) -> FastAPI:
    settings = settings or Settings.from_env()
    if not settings.webhook_secret:
        raise RuntimeError("WEBHOOK_SECRET must be set")
    db = Database(settings.db_path)
    if mailchimp is None:
        mailchimp = MailchimpClient(settings.mailchimp_api_key, settings.mailchimp_list_id,
                                    settings.mailchimp_status_if_new)
    nudge_fn = nudge_fn or (lambda lead: generate_nudge(
        lead, api_key=settings.anthropic_api_key, model=settings.claude_model))
    limiter = RateLimiter(settings.rate_limit_per_min)

    def job():
        run_abandon_job(db, mailchimp, nudge_fn, settings.abandon_after_min)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        scheduler = None
        if start_scheduler:
            from apscheduler.schedulers.background import BackgroundScheduler
            scheduler = BackgroundScheduler(timezone="UTC")
            scheduler.add_job(job, "interval", minutes=settings.scheduler_interval_min,
                              max_instances=1, coalesce=True, id="abandon")
            scheduler.start()
        yield
        if scheduler:
            scheduler.shutdown(wait=False)

    app = FastAPI(title="Zuma Cold Lead Nurture", lifespan=lifespan)
    app.state.db, app.state.job = db, job

    def push_to_mailchimp(email: str):
        lead = db.get(email)
        try:
            mailchimp.sync_lead(lead)
            db.mark_synced(email, lead["version"])
        except Exception:  # noqa: BLE001 - lead is saved; scheduler retries unsynced leads
            log.exception("Mailchimp sync failed; will retry")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/webhook/lead")
    def webhook_lead(lead: LeadIn, request: Request, tasks: BackgroundTasks,
                     x_webhook_secret: str = Header(default="")):
        client = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or \
            (request.client.host if request.client else "unknown")
        if not limiter.allow(client):
            raise HTTPException(429, "rate limited")
        if not hmac.compare_digest(x_webhook_secret.encode(), settings.webhook_secret.encode()):
            raise HTTPException(401, "invalid secret")
        row = db.upsert_lead(email=lead.email, first_name=lead.first_name,
                             room_interest=lead.room_interest,
                             step="" if lead.step is None else str(lead.step)[:20],
                             completed=lead.completed, source=lead.source)
        if row["synced_version"] < row["version"]:
            tasks.add_task(push_to_mailchimp, lead.email)
        log.info("lead received source=%s status=%s", row["source"], row["status"])
        return {"ok": True, "status": row["status"]}

    return app
