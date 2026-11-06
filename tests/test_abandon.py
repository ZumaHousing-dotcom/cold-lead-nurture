from datetime import datetime, timedelta, timezone

from app.jobs import run_abandon_job

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def seed(db, email, minutes_ago, completed=False):
    db.upsert_lead(email=email, first_name="X", room_interest="", step="1", completed=completed,
                   source="netlify_form", now=NOW - timedelta(minutes=minutes_ago))


def test_abandonment_query(app):
    db = app.state.db
    seed(db, "old@x.co", 90)
    seed(db, "recent@x.co", 10)
    seed(db, "done@x.co", 90, completed=True)
    seed(db, "tagged@x.co", 120)
    db.mark_abandoned("tagged@x.co", now=NOW)
    assert [r["email"] for r in db.abandoned_candidates(60, now=NOW)] == ["old@x.co"]


def test_job_tags_and_saves_line(app, mc, nudges):
    db = app.state.db
    seed(db, "old@x.co", 90)
    assert run_abandon_job(db, mc, nudges, 60, now=NOW) == 1
    assert mc.abandoned == [("old@x.co", "Fake warm line.")]
    assert db.get("old@x.co")["abandoned_at"] is not None
    assert run_abandon_job(db, mc, nudges, 60, now=NOW) == 0  # never tagged twice


def test_job_retries_after_mailchimp_failure(app, mc, nudges):
    db = app.state.db
    seed(db, "old@x.co", 90)
    mc.fail = True
    assert run_abandon_job(db, mc, nudges, 60, now=NOW) == 0
    assert db.get("old@x.co")["abandoned_at"] is None
    mc.fail = False
    assert run_abandon_job(db, mc, nudges, 60, now=NOW) == 1
    assert len(nudges.calls) == 1  # saved line reused on retry, Claude not called again
