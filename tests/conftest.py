import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

SECRET = "test-secret"


class FakeMailchimp:
    """Records calls; set fail=True to simulate Mailchimp being down."""

    def __init__(self):
        self.synced, self.abandoned, self.fail = [], [], False

    def sync_lead(self, lead):
        if self.fail:
            raise RuntimeError("mailchimp down")
        self.synced.append((lead["email"], lead["status"], lead["source"]))

    def tag_abandoned(self, email, line):
        if self.fail:
            raise RuntimeError("mailchimp down")
        self.abandoned.append((email, line))


@pytest.fixture
def mc():
    return FakeMailchimp()


@pytest.fixture
def nudges():
    calls = []

    def fn(lead):
        calls.append(lead["email"])
        return "Fake warm line."

    fn.calls = calls
    return fn


@pytest.fixture
def app(tmp_path, mc, nudges):
    settings = Settings(webhook_secret=SECRET, db_path=str(tmp_path / "t.db"), rate_limit_per_min=1000)
    return create_app(settings, mailchimp=mc, nudge_fn=nudges, start_scheduler=False)


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def post(client):
    def _post(body, secret=SECRET):
        headers = {"X-Webhook-Secret": secret} if secret is not None else {}
        return client.post("/webhook/lead", json=body, headers=headers)
    return _post
