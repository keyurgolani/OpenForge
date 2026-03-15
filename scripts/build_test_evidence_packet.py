#!/usr/bin/env python3
"""Build a small test evidence packet payload from a retrieval query id."""

from __future__ import annotations

import argparse
import json
from uuid import UUID


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace_id", type=UUID)
    parser.add_argument("query_id", type=UUID)
    parser.add_argument("source_id")
    parser.add_argument("title")
    parser.add_argument("excerpt")
    args = parser.parse_args()

    payload = {
        "workspace_id": str(args.workspace_id),
        "query_id": str(args.query_id),
        "summary": f"Test evidence for {args.title}",
        "items": [
            {
                "source_type": "knowledge",
                "source_id": args.source_id,
                "title": args.title,
                "excerpt": args.excerpt,
                "selection_reason_codes": ["user_selected"],
                "metadata": {
                    "generated_by": "scripts/build_test_evidence_packet.py",
                },
            }
        ],
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
