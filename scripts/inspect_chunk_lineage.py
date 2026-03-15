#!/usr/bin/env python3
"""Inspect contextual chunk lineage for a markdown-like file."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from openforge.domains.retrieval.chunking import build_contextual_chunks  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="Path to a local markdown/text file")
    parser.add_argument("--title", default="")
    parser.add_argument("--max-chunk-tokens", type=int, default=500)
    parser.add_argument("--min-chunk-tokens", type=int, default=50)
    args = parser.parse_args()

    source = Path(args.path)
    content = source.read_text(encoding="utf-8")
    chunks = build_contextual_chunks(
        content,
        title=args.title or source.stem,
        max_chunk_tokens=args.max_chunk_tokens,
        min_chunk_tokens=args.min_chunk_tokens,
    )
    print(json.dumps([chunk.__dict__ for chunk in chunks], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
