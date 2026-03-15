from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class FakeExecuteResult:
    def __init__(self, values: list[Any]):
        self._values = list(values)

    def scalars(self) -> "FakeExecuteResult":
        return self

    def all(self) -> list[Any]:
        return list(self._values)

    def scalar(self) -> Any | None:
        return self._values[0] if self._values else None

    def scalar_one_or_none(self) -> Any | None:
        return self.scalar()


class FakeAsyncSession:
    def __init__(
        self,
        *,
        objects: dict[tuple[type[Any], Any], Any] | None = None,
        execute_results: list[FakeExecuteResult] | None = None,
    ) -> None:
        self.objects = dict(objects or {})
        self.execute_results = list(execute_results or [])
        self.added: list[Any] = []
        self.commit_count = 0
        self.refresh_count = 0
        self.flush_count = 0
        self.deleted: list[Any] = []

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, obj: Any) -> None:
        self.refresh_count += 1
        self._assign_defaults(obj)

    async def flush(self) -> None:
        self.flush_count += 1
        for obj in self.added:
            self._assign_defaults(obj)

    async def get(self, model: type[Any], object_id: Any) -> Any | None:
        return self.objects.get((model, object_id))

    async def execute(self, _query: Any) -> FakeExecuteResult:
        if not self.execute_results:
            return FakeExecuteResult([])
        return self.execute_results.pop(0)

    async def scalar(self, _query: Any) -> Any | None:
        result = await self.execute(_query)
        return result.scalar()

    async def delete(self, obj: Any) -> None:
        self.deleted.append(obj)

    def _assign_defaults(self, obj: Any) -> None:
        now = datetime.now(timezone.utc)
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        for attr in ("created_at", "updated_at", "last_seen_at"):
            if hasattr(obj, attr) and getattr(obj, attr, None) is None:
                setattr(obj, attr, now)
        if hasattr(obj, "source_count") and getattr(obj, "source_count", None) is None:
            obj.source_count = 1
        if hasattr(obj, "support_count") and getattr(obj, "support_count", None) is None:
            obj.support_count = 1
        self.objects[(type(obj), obj.id)] = obj
