"""Mailchimp Marketing API client (contacts, merge fields, tags)."""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

import httpx

log = logging.getLogger("zuma.mailchimp")

TAG_STARTED = "form-started"
TAG_COMPLETED = "form-completed"
TAG_ABANDONED = "form-abandoned"


def subscriber_hash(email: str) -> str:
    return hashlib.md5(email.strip().lower().encode()).hexdigest()


class MailchimpClient:
    def __init__(self, api_key: str, list_id: str, status_if_new: str = "subscribed",
                 http: Optional[httpx.Client] = None):
        if "-" not in api_key:
            raise ValueError("MAILCHIMP_API_KEY must end with its datacenter suffix, e.g. -us21")
        dc = api_key.rsplit("-", 1)[1]
        self.list_id = list_id
        self.status_if_new = status_if_new
        self.http = http or httpx.Client(timeout=15)
        self.base = f"https://{dc}.api.mailchimp.com/3.0"
        self.auth = ("zuma", api_key)

    def _member_url(self, email: str) -> str:
        return f"{self.base}/lists/{self.list_id}/members/{subscriber_hash(email)}"

    def upsert_member(self, email: str, merge_fields: dict[str, str]) -> None:
        """PUT = create-or-update. Empty merge fields are omitted so we never blank existing data."""
        fields = {k: v for k, v in merge_fields.items() if v}
        body = {"email_address": email.lower(), "status_if_new": self.status_if_new}
        if fields:
            body["merge_fields"] = fields
        r = self.http.put(self._member_url(email), json=body, auth=self.auth)
        r.raise_for_status()

    def set_tags(self, email: str, active: list[str] = (), inactive: list[str] = ()) -> None:
        tags = [{"name": t, "status": "active"} for t in active] + \
               [{"name": t, "status": "inactive"} for t in inactive]
        if not tags:
            return
        r = self.http.post(self._member_url(email) + "/tags", json={"tags": tags}, auth=self.auth)
        r.raise_for_status()

    # --- high level operations used by the app ---

    def sync_lead(self, lead) -> None:
        self.upsert_member(lead["email"], {
            "FNAME": lead["first_name"] or "",
            "ROOM": lead["room_interest"] or "",
            "STEP": lead["step"] or "",
            "SOURCE": lead["source"] or "",
        })
        if lead["status"] == "completed":
            self.set_tags(lead["email"], active=[TAG_COMPLETED],
                          inactive=[TAG_STARTED, TAG_ABANDONED])
        else:
            self.set_tags(lead["email"], active=[TAG_STARTED])

    def tag_abandoned(self, email: str, nudge_line: str) -> None:
        self.upsert_member(email, {"NUDGELINE": nudge_line[:240]})
        self.set_tags(email, active=[TAG_ABANDONED])
