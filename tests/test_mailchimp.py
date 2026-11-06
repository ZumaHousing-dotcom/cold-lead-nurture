import hashlib
import json

import httpx

from app.mailchimp import MailchimpClient, subscriber_hash


def make(calls):
    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path, json.loads(req.content)))
        return httpx.Response(200, json={})
    return MailchimpClient("key-us21", "LIST", "pending", http=httpx.Client(transport=httpx.MockTransport(handler)))


def lead(status="started"):
    return {"email": "Sam@X.co", "first_name": "Sam", "room_interest": "", "step": "1",
            "source": "netlify_form", "status": status}


def test_started_sync():
    calls = []
    make(calls).sync_lead(lead())
    h = hashlib.md5(b"sam@x.co").hexdigest()
    assert subscriber_hash("SAM@x.co") == h
    m, path, body = calls[0]
    assert (m, path) == ("PUT", f"/3.0/lists/LIST/members/{h}")
    assert body["status_if_new"] == "pending"
    assert body["merge_fields"] == {"FNAME": "Sam", "STEP": "1", "SOURCE": "netlify_form"}  # empty ROOM omitted
    assert calls[1][2] == {"tags": [{"name": "form-started", "status": "active"}]}


def test_completed_sync_swaps_tags():
    calls = []
    make(calls).sync_lead(lead("completed"))
    assert calls[1][2]["tags"] == [{"name": "form-completed", "status": "active"},
                                   {"name": "form-started", "status": "inactive"},
                                   {"name": "form-abandoned", "status": "inactive"}]


def test_abandoned_caps_nudge_and_tags():
    calls = []
    make(calls).tag_abandoned("a@b.co", "x" * 500)
    assert len(calls[0][2]["merge_fields"]["NUDGELINE"]) == 240
    assert calls[1][2] == {"tags": [{"name": "form-abandoned", "status": "active"}]}
