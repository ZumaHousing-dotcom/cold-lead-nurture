from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_valid_lead_is_stored_and_synced(post, app, mc):
    r = post({"email": "Sam@Example.com", "first_name": "Sam", "room_interest": "Private", "step": 1})
    assert r.status_code == 200 and r.json() == {"ok": True, "status": "started"}
    lead = app.state.db.get("sam@example.com")
    assert lead["first_name"] == "Sam" and lead["status"] == "started"
    assert mc.synced == [("sam@example.com", "started", "netlify_form")]


def test_bad_or_missing_secret_rejected(post, app, mc):
    assert post({"email": "a@b.co"}, secret="nope").status_code == 401
    assert post({"email": "a@b.co"}, secret=None).status_code == 401
    assert app.state.db.get("a@b.co") is None and mc.synced == []


def test_completed_lead_not_downgraded(post, app, mc):
    post({"email": "a@b.co", "completed": True})
    r = post({"email": "a@b.co", "completed": False, "step": 1})  # late "started" ping
    assert r.json()["status"] == "completed"
    assert app.state.db.get("a@b.co")["status"] == "completed"
    assert [s[1] for s in mc.synced] == ["completed"]  # no form-started sync afterwards


def test_default_and_explicit_source(post, app):
    post({"email": "a@b.co"})
    post({"email": "c@d.co", "source": "appfolio"})
    assert app.state.db.get("a@b.co")["source"] == "netlify_form"
    assert app.state.db.get("c@d.co")["source"] == "appfolio"


def test_blank_fields_do_not_erase_existing_data(post, app):
    post({"email": "a@b.co", "first_name": "Sam", "room_interest": "Private"})
    post({"email": "a@b.co", "step": 2})
    lead = app.state.db.get("a@b.co")
    assert lead["first_name"] == "Sam" and lead["room_interest"] == "Private" and lead["step"] == "2"


def test_invalid_email_and_source(post):
    assert post({"email": "not-an-email"}).status_code == 422
    assert post({"email": "a@b.co", "source": "Bad Source!"}).status_code == 422


def test_mailchimp_failure_keeps_lead_and_is_retried(post, app, mc):
    mc.fail = True
    assert post({"email": "a@b.co"}).status_code == 200
    assert len(app.state.db.unsynced()) == 1
    mc.fail = False
    from app.jobs import sync_pending
    assert sync_pending(app.state.db, mc) == 1 and app.state.db.unsynced() == []


def test_rate_limit(tmp_path, mc):
    s = Settings(webhook_secret="s", db_path=str(tmp_path / "r.db"), rate_limit_per_min=2)
    c = TestClient(create_app(s, mailchimp=mc, start_scheduler=False))
    codes = [c.post("/webhook/lead", json={"email": "a@b.co"}, headers={"X-Webhook-Secret": "s"}).status_code
             for _ in range(3)]
    assert codes == [200, 200, 429]


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
