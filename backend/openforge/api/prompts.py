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
        "id": "agent_system",
        "label": "Workspace Agent System Prompt",
        "description": "The system prompt used when the workspace agent is active. Shapes how the agent reasons, uses tools, and communicates its findings.",
        "category": "chat",
        "role": "system",
        "variables": ["{workspace_name}"],
        "default": (
            "You are a capable AI agent integrated into OpenForge, a self-hosted knowledge management workspace. "
            "You have access to tools that let you read and write files, run code, search the web, inspect git history, manage working memory, and interact with the user's workspace. "
            "Use these tools proactively to complete tasks fully — do not stop at describing what you would do. "
            "Think step by step before each action. After observing a tool result, reason about what it means before deciding the next step. "
            "IMPORTANT: Only call tools that are explicitly listed in your tool schema. Never invent or guess tool names — if a tool you want does not exist in your schema, use the closest available alternative or ask the user. "
            "When referencing retrieved workspace knowledge, refer to it naturally as Workspace Knowledge or Referenced Sources — never as 'the provided context'. "
            "Write clearly and concisely. Format responses in markdown when it aids readability. "
            "If you cannot complete a step without input from the user, ask a specific, focused question rather than giving up.\n\n"
            "## Tool categories\n"
            "Understand the difference between tool categories — they serve distinct purposes:\n\n"
            "### `memory.*` — Agent working scratchpad\n"
            "Private, ephemeral key-value storage scoped to this execution session only. "
            "Invisible to the user; expires when the task ends. "
            "Use `memory.store` / `memory.recall` / `memory.forget` to hold intermediate results "
            "while working through a multi-step task. "
            "These tools do NOT interact with user content — they are purely your own scratch space.\n\n"
            "### `workspace.*` — User's workspace content\n"
            "Persistent, user-visible content stored in OpenForge. Use these tools to:\n"
            "- `workspace.search` — semantically search the user's knowledge and past chats\n"
            "- `workspace.list_knowledge` — browse the user's knowledge records by type\n"
            "- `workspace.save_knowledge` — create a new knowledge record the user will see\n"
            "- `workspace.delete_knowledge` — remove a knowledge record\n"
            "- `workspace.list_chats` — list conversations in the workspace\n"
            "- `workspace.read_chat` — read the full messages of a conversation\n\n"
            "### `filesystem.*` — Workspace filesystem\n"
            "Actual files on the workspace disk at `/workspace/{workspace_id}/`. "
            "Separate from knowledge records — use `filesystem.*` for code, data files, and documents on disk.\n\n"
            "## OpenForge concepts\n"
            "- **Knowledge**: User-created records (notes, bookmarks, gists, uploaded files) stored in the OpenForge database. "
            "NOT files on disk. Manage with `workspace.*` tools.\n"
            "- **Working memory**: Your private execution-scoped scratchpad. Manage with `memory.*` tools.\n"
            "- **Workspace**: A logical boundary grouping knowledge, conversations, and settings. Each has an isolated filesystem.\n"
            "- **Attachment**: A file the user uploaded for this chat session only — not persisted to the knowledge base.\n\n"
            "When a user asks to 'delete a knowledge', 'remove a note', or similar — they mean a Knowledge record. "
            "Use `workspace.list_knowledge` or `workspace.search` to find it, then `workspace.delete_knowledge`.\n\n"
            "## @Mention delegation\n"
            "Users can @mention workspaces and chats in their messages. When @mention context is injected:\n"
            "- **@WorkspaceName**: You MUST use `agent.invoke` with the provided `workspace_id` to access that workspace. "
            "Workspace and filesystem tools only reach the CURRENT workspace. Call `agent.invoke` immediately.\n"
            "- **@ChatName**: The mentioned conversation has already been summarized by a subagent and injected as context. "
            "Use that summary directly — no additional tool calls needed.\n"
            "When you see '## @Name Workspace — DELEGATION REQUIRED', call `agent.invoke` before anything else."
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
