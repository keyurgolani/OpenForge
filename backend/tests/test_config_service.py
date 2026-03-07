from __future__ import annotations

from datetime import datetime, timezone, timedelta

from openforge.db.models import Config
from openforge.services.config_service import ConfigService
import openforge.services.config_service as config_service_module


class _FakeScalars:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeResult:
    def __init__(self, *, one=None, rows=None):
        self._one = one
        self._rows = [] if rows is None else list(rows)

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeConfigDB:
    def __init__(self, rows: list[Config] | None = None):
        self.rows = {row.key: row for row in (rows or [])}
        self.commits = 0
        self.refreshed = []

    async def execute(self, query):
        sql = str(query)
        params = query.compile().params

        if "from config" not in sql.lower():
            raise AssertionError(f"Unexpected query: {sql}")

        key = params.get("key_1")
        if key is not None:
            return _FakeResult(one=self.rows.get(key))

        category = params.get("category_1")
        updated_after = params.get("updated_at_1")
        if category is not None and updated_after is not None:
            selected = [
                row for row in self.rows.values()
                if row.category == category and row.updated_at > updated_after
            ]
            return _FakeResult(rows=selected)

        return _FakeResult(rows=list(self.rows.values()))

    def add(self, row: Config):
        self.rows[row.key] = row

    async def commit(self):
        self.commits += 1

    async def refresh(self, row: Config):
        self.refreshed.append(row)


def _config_row(key: str, value: dict, category: str = "general", sensitive: bool = False, updated_at: datetime | None = None) -> Config:
    return Config(
        key=key,
        value=value,
        category=category,
        sensitive=sensitive,
        updated_at=updated_at or datetime.now(timezone.utc),
    )


async def test_get_all_and_get_config_masks_sensitive_values():
    db = _FakeConfigDB([
        _config_row("plain.key", {"value": "shown"}, sensitive=False),
        _config_row("secret.key", {"token": "abc"}, sensitive=True),
    ])
    svc = ConfigService()

    items = await svc.get_all_config(db)
    by_key = {item.key: item for item in items}

    assert by_key["plain.key"].value == {"value": "shown"}
    assert by_key["secret.key"].value == "***masked***"

    single = await svc.get_config(db, "secret.key")
    assert single is not None
    assert single.value == "***masked***"


async def test_set_config_creates_and_updates_sensitive_values():
    db = _FakeConfigDB()
    svc = ConfigService()

    created = await svc.set_config(db, "api.key", "super-secret", category="security", sensitive=True)
    assert created.key == "api.key"
    assert created.value == "***masked***"
    assert db.commits == 1

    stored = db.rows["api.key"]
    assert stored.sensitive is True
    assert isinstance(stored.value, str)
    assert stored.value != "super-secret"

    updated = await svc.set_config(db, "api.key", "plain-value", category="general", sensitive=False)
    assert updated.value == "plain-value"
    assert db.rows["api.key"].value == "plain-value"
    assert db.rows["api.key"].sensitive is False
    assert db.commits == 2


async def test_get_config_raw_decrypts_and_restart_detection(monkeypatch):
    now = datetime.now(timezone.utc)
    older = now - timedelta(days=1)

    encrypted_row = _config_row("enc.key", {"dummy": "value"}, sensitive=True)
    restart_old = _config_row("restart.old", {"x": 1}, category="restart_required", updated_at=older)
    restart_new = _config_row("restart.new", {"x": 2}, category="restart_required", updated_at=now)

    db = _FakeConfigDB([encrypted_row, restart_old, restart_new])
    svc = ConfigService()

    # Simulate encrypted plaintext storage (as expected by service internals).
    encrypted_row.value = "ciphertext"
    monkeypatch.setattr(config_service_module, "decrypt_value", lambda payload: "decrypted")

    raw = await svc.get_config_raw(db, "enc.key")
    assert raw == "decrypted"

    monkeypatch.setattr(config_service_module, "_startup_time", now - timedelta(hours=1))
    needs_restart = await svc.check_needs_restart(db)
    assert needs_restart is True
