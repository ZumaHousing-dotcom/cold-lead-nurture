"""Scheduled work: retry unsynced leads, then nudge + tag abandoned leads."""
from __future__ import annotations

import logging
from typing import Callable

log = logging.getLogger("zuma.jobs")


def sync_pending(db, mc) -> int:
    """Push leads whose Mailchimp sync failed earlier (webhook sync is best-effort)."""
    done = 0
    for lead in db.unsynced():
        try:
            mc.sync_lead(lead)
            db.mark_synced(lead["email"], lead["version"])
            done += 1
        except Exception:  # noqa: BLE001
            log.exception("retry sync failed for lead id=%s", lead["email"][:3] + "***")
    return done


def run_abandon_job(db, mc, make_nudge: Callable, abandon_after_min: int, now=None) -> int:
    """Returns the number of leads tagged form-abandoned. Failures stay eligible next run."""
    sync_pending(db, mc)
    tagged = 0
    for lead in db.abandoned_candidates(abandon_after_min, now=now):
        email = lead["email"]
        try:
            # Make sure the contact exists / is current before we tag it.
            line = lead["nudge_line"] or make_nudge(lead)
            if not lead["nudge_line"]:
                db.save_nudge_line(email, line)
            mc.tag_abandoned(email, line)
            db.mark_abandoned(email, now=now)
            tagged += 1
        except Exception:  # noqa: BLE001
            log.exception("abandon tagging failed; will retry next run")
    log.info("abandon job finished: %d tagged", tagged)
    return tagged
