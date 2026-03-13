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
from openforge.core.prompt_catalogue import PROMPT_CATALOGUE, get_prompt_entry

router = APIRouter()


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
    entry = get_prompt_entry(prompt_id)
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
