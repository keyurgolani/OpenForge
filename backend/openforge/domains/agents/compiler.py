"""Agent blueprint compiler.

Resolves an AgentBlueprint into a CompiledAgentSpec and persists it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    AgentModel,
    AgentProfileModel,
    CompiledAgentSpecModel,
    Workspace,
)

from .blueprint import AgentBlueprint
from .compiled_spec import CompiledAgentSpec

logger = logging.getLogger("openforge.agents.compiler")

COMPILER_VERSION = "1.0.0"


class AgentBlueprintCompiler:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def compile(
        self,
        agent: AgentModel,
        blueprint: AgentBlueprint,
        md_hash: str,
    ) -> CompiledAgentSpec:
        """Compile a blueprint into an immutable spec.

        1. Check idempotency via source_md_hash
        2. Upsert system profile
        3. Build workspace directory for system prompt
        4. Build CompiledAgentSpec
        5. Persist CompiledAgentSpecModel row
        6. Update agent with active_spec_id
        """
        try:
            # Idempotency: if latest spec has same hash, skip
            existing = await self._find_existing_spec(agent.id, md_hash)
            if existing is not None:
                logger.info("Agent %s already compiled with hash %s, skipping", agent.slug, md_hash[:8])
                return existing

            # Upsert system profile
            profile = await self._upsert_profile(agent, blueprint)

            # Build workspace directory section for system prompt
            workspace_section = await self._build_workspace_directory()

            # Build system prompt with workspace directory
            full_system_prompt = blueprint.system_prompt
            if workspace_section:
                full_system_prompt = f"{blueprint.system_prompt}\n\n{workspace_section}"

            # Build confirm_before list from tools + top-level
            confirm_tools = list(blueprint.confirm_before)
            for tool in blueprint.tools:
                if tool.confirm_before and tool.name not in confirm_tools:
                    confirm_tools.append(tool.name)

            spec = CompiledAgentSpec(
                agent_id=agent.id,
                agent_slug=agent.slug,
                name=blueprint.name,
                version=blueprint.version,
                profile_id=profile.id,
                provider_name=blueprint.model.provider,
                model_name=blueprint.model.default,
                allow_model_override=blueprint.model.allow_override,
                temperature=blueprint.model.temperature,
                max_tokens=blueprint.model.max_tokens,
                tools_enabled=bool(blueprint.tools),
                confirm_before_tools=confirm_tools,
                history_limit=blueprint.memory.history_limit,
                history_strategy=blueprint.memory.strategy,
                attachment_support=blueprint.memory.attachment_support,
                retrieval_enabled=blueprint.retrieval.enabled,
                retrieval_limit=blueprint.retrieval.limit,
                retrieval_score_threshold=blueprint.retrieval.score_threshold,
                execution_mode=blueprint.output.execution_mode,
                require_structured_output=blueprint.output.require_structured,
                system_prompt=full_system_prompt,
                constraints=blueprint.constraints,
                strategy=blueprint.strategy,
                mode=blueprint.mode,
                source_md_hash=md_hash,
                compiler_version=COMPILER_VERSION,
            )

            # Determine next version
            next_version = await self._next_version(agent.id)

            # Persist spec
            spec_row = CompiledAgentSpecModel(
                agent_id=agent.id,
                version=next_version,
                blueprint_snapshot=blueprint.model_dump(),
                resolved_config=spec.model_dump(mode="json"),
                profile_id=profile.id,
                source_md_hash=md_hash,
                compiler_version=COMPILER_VERSION,
                is_valid=True,
                validation_errors=[],
            )
            self.db.add(spec_row)
            await self.db.flush()

            # Update agent
            agent.active_spec_id = spec_row.id
            agent.profile_id = profile.id
            agent.compilation_status = "success"
            agent.compilation_error = None
            agent.last_compiled_at = datetime.now(timezone.utc)

            await self.db.commit()
            await self.db.refresh(spec_row)

            logger.info("Compiled agent %s v%d (spec %s)", agent.slug, next_version, spec_row.id)
            return spec

        except Exception as e:
            await self.db.rollback()
            agent.compilation_status = "failed"
            agent.compilation_error = str(e)
            self.db.add(agent)
            await self.db.commit()
            logger.error("Failed to compile agent %s: %s", agent.slug, e)
            raise

    async def _find_existing_spec(self, agent_id, md_hash: str) -> CompiledAgentSpec | None:
        """Check if a spec with the same hash already exists."""
        row = await self.db.scalar(
            select(CompiledAgentSpecModel)
            .where(
                CompiledAgentSpecModel.agent_id == agent_id,
                CompiledAgentSpecModel.source_md_hash == md_hash,
                CompiledAgentSpecModel.is_valid == True,  # noqa: E712
            )
            .order_by(CompiledAgentSpecModel.version.desc())
            .limit(1)
        )
        if row is None:
            return None
        return CompiledAgentSpec(**row.resolved_config)

    async def _upsert_profile(self, agent: AgentModel, blueprint: AgentBlueprint) -> AgentProfileModel:
        """Create or update a system profile for this agent."""
        profile_slug = f"{agent.slug}__compiled"
        profile = await self.db.scalar(
            select(AgentProfileModel).where(AgentProfileModel.slug == profile_slug)
        )
        if profile is None:
            profile = AgentProfileModel(
                name=f"{blueprint.name} (compiled)",
                slug=profile_slug,
                description=f"Auto-generated profile for agent {agent.slug}",
                role="assistant",
                is_system=True,
                status="active",
            )
            self.db.add(profile)
            await self.db.flush()
        else:
            profile.name = f"{blueprint.name} (compiled)"
            profile.description = f"Auto-generated profile for agent {agent.slug}"
        return profile

    async def _build_workspace_directory(self) -> str:
        """Build a workspace directory section for the system prompt."""
        rows = (await self.db.execute(
            select(Workspace.id, Workspace.name, Workspace.description)
            .order_by(Workspace.sort_order)
        )).all()
        if not rows:
            return ""
        lines = ["## Available Workspaces"]
        for row in rows:
            desc = f": {row.description}" if row.description else ""
            lines.append(f"- **{row.name}** (id: {row.id}){desc}")
        lines.append("")
        lines.append("You can search any of these workspaces for relevant knowledge.")
        return "\n".join(lines)

    async def _next_version(self, agent_id) -> int:
        """Get the next version number for an agent's specs."""
        max_version = await self.db.scalar(
            select(func.max(CompiledAgentSpecModel.version))
            .where(CompiledAgentSpecModel.agent_id == agent_id)
        )
        return (max_version or 0) + 1
