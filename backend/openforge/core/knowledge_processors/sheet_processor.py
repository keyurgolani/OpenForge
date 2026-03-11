"""Sheet Processing Pipeline.

1. Read all sheets via openpyxl, convert each to markdown table
2. Extract metadata (sheet names, row/column counts per sheet)
3. Chunk text → embed → store in Qdrant
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

logger = logging.getLogger("openforge.processors.sheet")


class SheetProcessor:
    """Complete sheet knowledge processing pipeline."""

    async def process(
        self,
        knowledge_id: UUID,
        file_path: str,
        workspace_id: UUID,
        db_session=None,
    ) -> dict:
        """Run the full sheet processing pipeline. Returns metadata dict."""
        result = {
            "metadata": {},
            "text": "",
            "sheet_info": [],
        }

        # ── Step 1: Extract text as markdown tables ──
        try:
            text, sheet_info = self._extract_text(file_path)
            result["text"] = text
            result["sheet_info"] = sheet_info
        except Exception as e:
            logger.warning("Sheet extraction failed for %s: %s", knowledge_id, e)

        # ── Step 2: Extract metadata ──
        try:
            result["metadata"] = self._extract_metadata(file_path, result["sheet_info"])
        except Exception as e:
            logger.warning("Sheet metadata extraction failed for %s: %s", knowledge_id, e)

        # ── Step 3: Embed text ──
        if result["text"] and len(result["text"].strip()) >= 20:
            try:
                await self._embed_text(knowledge_id, workspace_id, result["text"])
            except Exception as e:
                logger.warning("Sheet text embedding failed for %s: %s", knowledge_id, e)

        metadata = result["metadata"]
        return {
            "file_metadata": {
                "sheet_names": metadata.get("sheet_names", []),
                "sheet_details": metadata.get("sheet_details", []),
                "total_rows": metadata.get("total_rows"),
                "total_sheets": metadata.get("total_sheets"),
            },
            "content": result["text"],
            "ai_title": Path(file_path).stem.replace("_", " ").replace("-", " ").title(),
        }

    def _extract_text(self, file_path: str) -> tuple[str, list[dict]]:
        """Extract all sheets as markdown tables."""
        from openpyxl import load_workbook

        wb = load_workbook(file_path, read_only=True, data_only=True)
        parts = []
        sheet_info = []

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))

            if not rows:
                sheet_info.append({"name": sheet_name, "rows": 0, "cols": 0})
                continue

            # Filter out completely empty rows
            non_empty_rows = []
            max_cols = 0
            for row in rows:
                cells = [str(cell) if cell is not None else "" for cell in row]
                if any(c.strip() for c in cells):
                    non_empty_rows.append(cells)
                    max_cols = max(max_cols, len(cells))

            if not non_empty_rows:
                sheet_info.append({"name": sheet_name, "rows": 0, "cols": 0})
                continue

            sheet_info.append({
                "name": sheet_name,
                "rows": len(non_empty_rows),
                "cols": max_cols,
            })

            # Build markdown table
            parts.append(f"## {sheet_name}\n")

            # Limit to first 200 rows to avoid massive output
            display_rows = non_empty_rows[:200]

            # Pad cells to uniform column count
            for row in display_rows:
                while len(row) < max_cols:
                    row.append("")

            # Header row
            header = display_rows[0]
            parts.append("| " + " | ".join(header) + " |")
            parts.append("| " + " | ".join(["---"] * max_cols) + " |")

            # Data rows
            for row in display_rows[1:]:
                parts.append("| " + " | ".join(row) + " |")

            if len(non_empty_rows) > 200:
                parts.append(f"\n*... {len(non_empty_rows) - 200} more rows truncated*\n")

            parts.append("")  # Blank line between sheets

        wb.close()

        full_text = "\n".join(parts)
        return full_text[:100000], sheet_info

    def _extract_metadata(self, file_path: str, sheet_info: list[dict]) -> dict:
        """Extract sheet metadata."""
        total_rows = sum(s.get("rows", 0) for s in sheet_info)

        return {
            "sheet_names": [s["name"] for s in sheet_info],
            "sheet_details": sheet_info,
            "total_rows": total_rows,
            "total_sheets": len(sheet_info),
        }

    async def _embed_text(
        self, knowledge_id: UUID, workspace_id: UUID, text: str
    ) -> None:
        """Embed extracted text into openforge_knowledge collection."""
        from openforge.core.knowledge_processor import knowledge_processor

        await knowledge_processor.process_knowledge(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            content=text,
            knowledge_type="sheet",
            title=None,
            tags=[],
        )


sheet_processor = SheetProcessor()
