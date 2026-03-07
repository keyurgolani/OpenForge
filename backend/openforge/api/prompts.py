"""
Prompts API — provides read/write access to AI task prompts.
Each prompt is stored in the Config table under the key "prompt.{prompt_id}".
If no override exists, the default system prompt is returned.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openforge.db.postgres import get_db
from openforge.db.models import Config
from datetime import datetime, timezone

router = APIRouter()

# ── Default prompts catalogue ──────────────────────────────────────────────
# Variables available:
#   {knowledge_title}  - Knowledge title (or AI-generated title)
#   {knowledge_content} - Full knowledge content (up to 8000 chars)
#   {knowledge_type}   - Knowledge type (standard, fleeting, bookmark, gist)
#   {url}             - Bookmark URL
#   {tags}            - Comma-separated knowledge tags
#   {language}        - Gist programming language
#   {conversation_history} - Previous messages in the chat (chat prompts only)
#   {query}           - User's search query or chat message
#   {workspace_name}  - Name of the current workspace

PROMPT_CATALOGUE = [
    {
        "id": "generate_title",
        "label": "Generate Knowledge Title",
        "description": "Used to auto-generate a concise title for a knowledge item when it has no user-set title.",
        "category": "knowledge",
        "role": "system",
        "variables": ["{knowledge_content}"],
        "default": (
            "Generate a concise, descriptive title (max 60 chars) for the following knowledge content. "
            "Return ONLY the title — no quotes, markdown, or extra explanation.\n\n"
            "Knowledge Content:\n{knowledge_content}"
        ),
    },
    {
        "id": "summarize_knowledge",
        "label": "Summarize Knowledge",
        "description": "Used when the user clicks 'Summarize' on a knowledge item. Produces a structured summary.",
        "category": "knowledge",
        "role": "system",
        "variables": ["{knowledge_title}", "{knowledge_content}", "{knowledge_type}", "{tags}"],
        "default": (
            "Summarize the following knowledge item concisely and clearly. "
            "Preserve the key ideas, facts, and any action items. "
            "Use structured markdown with short paragraphs or bullet points.\n\n"
            "Title: {knowledge_title}\n"
            "Tags: {tags}\n\n"
            "Knowledge Content:\n{knowledge_content}"
        ),
    },
    {
        "id": "extract_insights",
        "label": "Extract Insights",
        "description": "Extracts structured insights (tasks, timeline dates, facts, crucial points, tags) from a knowledge item.",
        "category": "knowledge",
        "role": "system",
        "variables": ["{knowledge_title}", "{knowledge_content}", "{tags}"],
        "default": (
            "Extract structured insights from this knowledge item. Return ONLY valid JSON with this exact structure:\n"
            "{\n"
            '  "timelines": [{"date": "YYYY-MM-DD", "event": "description"}],\n'
            '  "facts": ["key fact 1"],\n'
            '  "crucial_things": ["critical point 1"],\n'
            '  "tasks": ["action item 1"],\n'
            '  "tags": ["tag1", "tag2"]\n'
            "}\n"
            "Timeline rules:\n"
            "- Include every explicit date or deadline that should be tracked.\n"
            "- Use YYYY-MM-DD when date is clear.\n"
            "- If year is missing, infer from context if possible.\n"
            "- Do not invent dates.\n"
            "Return empty arrays if none found. Tags should be lowercase single words or hyphenated phrases.\n\n"
            "Title: {knowledge_title}\n\n"
            "Knowledge Content:\n{knowledge_content}"
        ),
    },
    {
        "id": "chat_system",
        "label": "Chat System Prompt",
        "description": "The system prompt injected at the start of every AI chat conversation.",
        "category": "chat",
        "role": "system",
        "variables": ["{workspace_name}", "{query}"],
        "default": (
            "You are a helpful AI assistant integrated into OpenForge, a self-hosted knowledge management workspace. "
            "Answer the user's questions clearly and concisely. "
            "When you use retrieved information, refer to it naturally as Workspace Knowledge and/or Referenced Sources. "
            "Do not start responses with robotic preambles like 'Based on the provided context' or 'According to the context'. "
            "Never call retrieved material simply 'provided context'. "
            "Format responses in clear markdown when helpful."
        ),
    },
    {
        "id": "chat_rag_context",
        "label": "Chat RAG Context Prefix",
        "description": "Injected before retrieved knowledge context chunks in each chat message.",
        "category": "chat",
        "role": "user",
        "variables": ["{query}"],
        "default": (
            "Use the following Workspace Knowledge / Referenced Sources to answer the question. "
            "Only use this material when it is relevant.\n\n"
            "Workspace Knowledge / Referenced Sources:\n"
        ),
    },
    {
        "id": "bookmark_title",
        "label": "Bookmark Title Generation",
        "description": "Generates a clean title for a bookmark when the HTML <title> tag is missing or poor quality.",
        "category": "knowledge",
        "role": "system",
        "variables": ["{url}", "{knowledge_content}"],
        "default": (
            "Given the following web page content from {url}, generate a concise, descriptive title (max 80 chars). "
            "Return ONLY the title.\n\nContent:\n{knowledge_content}"
        ),
    },
]


class PromptOut(BaseModel):
    id: str
    label: str
    description: str
    category: str
    role: str
    variables: list[str]
    default: str
    override: str | None = None
    updated_at: datetime | None = None


class PromptUpdate(BaseModel):
    override: str | None  # null = reset to default


@router.get("", response_model=list[PromptOut])
async def list_prompts(db: AsyncSession = Depends(get_db)):
    """Return all prompts with their defaults and any current overrides."""
    # Fetch all prompt overrides in one query
    result = await db.execute(
        select(Config).where(Config.category == "prompt")
    )
    overrides: dict[str, Config] = {r.key: r for r in result.scalars().all()}

    out = []
    for p in PROMPT_CATALOGUE:
        row = overrides.get(f"prompt.{p['id']}")
        out.append(PromptOut(
            **p,
            override=row.value.get("text") if row else None,
            updated_at=row.updated_at if row else None,
        ))
    return out


@router.put("/{prompt_id}", response_model=PromptOut)
async def update_prompt(
    prompt_id: str,
    body: PromptUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Set or clear (reset to default) a prompt override."""
    entry = next((p for p in PROMPT_CATALOGUE if p["id"] == prompt_id), None)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_id}' not found")

    key = f"prompt.{prompt_id}"

    if body.override is None:
        # Delete override → reset to default
        result = await db.execute(select(Config).where(Config.key == key))
        row = result.scalar_one_or_none()
        if row:
            await db.delete(row)
            await db.commit()
        return PromptOut(**entry, override=None, updated_at=None)
    else:
        result = await db.execute(select(Config).where(Config.key == key))
        row = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if row:
            row.value = {"text": body.override}
            row.updated_at = now
        else:
            row = Config(key=key, value={"text": body.override}, category="prompt", sensitive=False, updated_at=now)
            db.add(row)
        await db.commit()
        await db.refresh(row)
        return PromptOut(**entry, override=body.override, updated_at=row.updated_at)
