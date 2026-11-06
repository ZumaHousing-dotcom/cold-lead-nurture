"""Settings read from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


@dataclass
class Settings:
    mailchimp_api_key: str = ""
    mailchimp_list_id: str = ""
    mailchimp_status_if_new: str = "subscribed"
    webhook_secret: str = ""
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5-5"
    abandon_after_min: int = 60
    scheduler_interval_min: int = 15
    rate_limit_per_min: int = 60
    db_path: str = "./data/leads.db"

    @classmethod
    def from_env(cls) -> "Settings":
        try:
            from dotenv import load_dotenv
            load_dotenv()  # local dev convenience; real env vars win
        except ImportError:
            pass
        status = (os.getenv("MAILCHIMP_STATUS_IF_NEW") or "subscribed").strip().lower()
        if status not in ("subscribed", "pending"):
            status = "subscribed"
        return cls(
            mailchimp_api_key=os.getenv("MAILCHIMP_API_KEY", ""),
            mailchimp_list_id=os.getenv("MAILCHIMP_LIST_ID", ""),
            mailchimp_status_if_new=status,
            webhook_secret=os.getenv("WEBHOOK_SECRET", ""),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            claude_model=os.getenv("CLAUDE_MODEL") or "claude-sonnet-5-5",
            abandon_after_min=_int("ABANDON_AFTER_MIN", 60),
            scheduler_interval_min=_int("SCHEDULER_INTERVAL_MIN", 15),
            rate_limit_per_min=_int("RATE_LIMIT_PER_MIN", 60),
            db_path=os.getenv("DB_PATH") or "./data/leads.db",
        )
