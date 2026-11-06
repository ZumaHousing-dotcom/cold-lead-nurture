import sys
import types

from app import nudge
from app.nudge import FALLBACK_LINE, clean_line, generate_nudge

LEAD = {"first_name": "Sam", "room_interest": "Private Room", "step": "1"}


def fake_anthropic(monkeypatch, text=None, raises=False):
    class Messages:
        def create(self, **kw):
            if raises:
                raise RuntimeError("boom")
            return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=text)])

    class Client:
        def __init__(self, **kw):
            self.messages = Messages()

    monkeypatch.setitem(sys.modules, "anthropic", types.SimpleNamespace(Anthropic=Client))


def test_good_line_used(monkeypatch):
    fake_anthropic(monkeypatch, "Finding your perfect room in LA is almost done, so come finish up.")
    assert generate_nudge(LEAD, api_key="k", model="m").startswith("Finding your perfect")


def test_api_failure_falls_back(monkeypatch):
    fake_anthropic(monkeypatch, raises=True)
    assert generate_nudge(LEAD, api_key="k", model="m") == FALLBACK_LINE


def test_no_key_falls_back():
    assert generate_nudge(LEAD, api_key="", model="m") == FALLBACK_LINE


def test_rules_enforced():
    assert clean_line("Rooms from $900 are waiting for you.") is None
    assert clean_line("Come back and finish up \U0001F60A") is None
    assert clean_line("Move in on 15 March " + "word " * 3) is None
    assert clean_line("word " * 30) is None
    assert clean_line('"Your room is waiting for you."') == "Your room is waiting for you."


def test_fallback_obeys_own_rules():
    assert clean_line(FALLBACK_LINE) == FALLBACK_LINE
