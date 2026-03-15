#!/usr/bin/env python3
"""Replay a retrieval query and optionally open the top result."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import UUID


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from openforge.db.postgres import AsyncSessionLocal  # noqa: E402
from openforge.domains.retrieval.schemas import EvidencePacketBuildRequest, RetrievalReadRequest, RetrievalSearchRequest  # noqa: E402
from openforge.domains.retrieval.service import RetrievalService  # noqa: E402
from openforge.domains.retrieval.types import SelectionReasonCode  # noqa: E402


async def _run(args: argparse.Namespace) -> int:
    async with AsyncSessionLocal() as db:
        service = RetrievalService(db)
        search = await service.search(
            RetrievalSearchRequest(
                workspace_id=UUID(args.workspace_id),
                query_text=args.query,
                knowledge_type=args.knowledge_type,
                limit=args.limit,
                include_parent_context=True,
                deduplicate_sources=args.deduplicate,
            )
        )
        print(json.dumps(search.model_dump(mode="json"), indent=2))

        if not args.open_first or not search.results:
            return 0

        read = await service.read(
            RetrievalReadRequest(
                query_id=search.query.id,
                result_ids=[search.results[0].id],
                include_parent_context=True,
                selection_reason_codes=[SelectionReasonCode.USER_SELECTED],
            )
        )
        print("\n--- READ ---")
        print(json.dumps(read.model_dump(mode="json"), indent=2))

        if args.build_evidence and read.results:
            packet = await service.build_evidence_packet(
                EvidencePacketBuildRequest(
                    workspace_id=UUID(args.workspace_id),
                    query_id=search.query.id,
                    items=[{
                        "source_type": read.results[0].source_type,
                        "source_id": read.results[0].source_id,
                        "title": read.results[0].title,
                        "excerpt": read.results[0].excerpt,
                        "parent_excerpt": read.results[0].parent_excerpt,
                        "selection_reason_codes": read.results[0].selection_reason_codes,
                        "citation": read.results[0].citation,
                        "metadata": read.results[0].metadata,
                    }],
                    summary=f"Evidence for {read.results[0].title}",
                )
            )
            print("\n--- EVIDENCE ---")
            print(json.dumps(packet.model_dump(mode="json"), indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace_id", help="Workspace UUID")
    parser.add_argument("query", help="Retrieval query text")
    parser.add_argument("--knowledge-type", dest="knowledge_type")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--deduplicate", action="store_true")
    parser.add_argument("--open-first", action="store_true")
    parser.add_argument("--build-evidence", action="store_true")
    args = parser.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
