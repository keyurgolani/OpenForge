"""Deterministic mission blueprints for curated mission templates."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

# ---------------------------------------------------------------------------
# Deterministic namespaces
# ---------------------------------------------------------------------------
SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/missions")

# Related domain namespaces -- keeps cross-domain references deterministic
WORKFLOW_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase10/workflows")
PROFILE_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/profiles")


class MissionSeeder(Protocol):
    """Protocol for mission seed helpers."""

    async def create_mission(self, mission_data: dict[str, Any]) -> dict[str, Any]:
        ...


# ---------------------------------------------------------------------------
# UUID helpers
# ---------------------------------------------------------------------------

def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def _workflow_uuid(slug: str) -> UUID:
    return uuid5(WORKFLOW_NAMESPACE, f"{slug}/workflow")


def _profile_uuid(slug: str) -> UUID:
    return uuid5(PROFILE_NAMESPACE, slug)


# ---------------------------------------------------------------------------
# Blueprint factory
# ---------------------------------------------------------------------------

def get_seed_mission_blueprints(
    workspace_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """Return deterministic mission blueprints for dev and test environments.

    Each blueprint is a dict with two top-level keys:
      - ``mission``: the fields that map directly to MissionDefinitionModel
      - ``tags``, ``catalog_metadata``: supplementary catalog data for the
        mission catalog / template store (stored separately or as JSONB
        extension columns once migrated).
    """

    ws = workspace_id or None

    def _decorate_blueprints(blueprints: list[dict[str, Any]]) -> list[dict[str, Any]]:
        decorated: list[dict[str, Any]] = []
        for blueprint in blueprints:
            mission = blueprint.get("mission", {})
            decorated.append(
                {
                    **blueprint,
                    "name": mission.get("name"),
                    "description": mission.get("description"),
                }
            )
        return decorated

    return _decorate_blueprints([
        # ------------------------------------------------------------------ 1
        {
            "slug": "daily-research-digest",
            "mission": {
                "id": _seed_uuid("daily-research-digest"),
                "workspace_id": ws,
                "name": "Daily Research Digest",
                "slug": "daily-research-digest",
                "description": (
                    "Runs every morning on a cron schedule to sweep configured "
                    "research sources, extract key findings, and compile them into "
                    "a concise digest artifact. The digest covers new papers, "
                    "articles, and data releases relevant to the workspace's focus "
                    "areas, complete with source links and one-paragraph summaries."
                ),
                "workflow_id": _workflow_uuid("internet-research"),
                "default_profile_ids": [
                    _profile_uuid("research-analyst"),
                    _profile_uuid("digest-writer"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["report", "summary"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you want a hands-free daily briefing that scans "
                    "research sources and delivers a polished digest every morning."
                ),
                "status": "active",
            },
            "tags": ["research", "digest", "scheduled", "daily", "autonomous"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Morning research briefings for team leads",
                    "Staying current with academic or industry publications",
                    "Automated literature monitoring across multiple feeds",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Daily digest report with source links and summaries",
                    "Compact summary suitable for email or Slack delivery",
                ],
                "example_inputs": [
                    "Monitor arXiv cs.AI and cs.CL for transformer architecture papers",
                    "Track FDA drug approval announcements and summarise weekly trends",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "cron",
                "suggested_schedule": "0 8 * * *",
                "manual_first_recommended": False,
                "requires_approval_review": False,
            },
        },
        # ------------------------------------------------------------------ 2
        {
            "slug": "target-watch",
            "mission": {
                "id": _seed_uuid("target-watch"),
                "workspace_id": ws,
                "name": "Target Watch",
                "slug": "target-watch",
                "description": (
                    "Continuously monitors a set of configured target entities "
                    "(companies, people, products, or domains) for meaningful "
                    "changes. Uses a heartbeat trigger to periodically check web "
                    "sources, news feeds, and registry databases, then emits alert "
                    "artifacts whenever a significant change is detected. Ideal for "
                    "due-diligence monitoring, competitive surveillance, or "
                    "compliance tracking."
                ),
                "workflow_id": _workflow_uuid("verify-and-refine"),
                "default_profile_ids": [
                    _profile_uuid("osint-monitor"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["alert", "report"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you need ongoing surveillance of specific entities "
                    "and want to be alerted immediately when something changes."
                ),
                "status": "active",
            },
            "tags": ["monitoring", "targets", "alerts", "heartbeat", "autonomous"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Due-diligence monitoring of acquisition targets",
                    "Tracking regulatory filings for named entities",
                    "Brand-mention and reputation monitoring",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "moderate",
                "expected_outputs": [
                    "Alert artifacts when a target entity changes materially",
                    "Periodic status reports summarising monitored targets",
                ],
                "example_inputs": [
                    "Watch Acme Corp SEC filings and leadership changes",
                    "Monitor competitor product pages for pricing updates",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "heartbeat",
                "suggested_schedule": "900",
                "manual_first_recommended": True,
                "requires_approval_review": False,
            },
        },
        # ------------------------------------------------------------------ 3
        {
            "slug": "autonomous-research",
            "mission": {
                "id": _seed_uuid("autonomous-research"),
                "workspace_id": ws,
                "name": "Autonomous Research",
                "slug": "autonomous-research",
                "description": (
                    "Performs deep autonomous research on a user-specified topic. "
                    "The mission plans a research strategy, executes multi-step web "
                    "and knowledge-base searches, synthesises findings, and produces "
                    "a structured research brief artifact. Runs in supervised mode "
                    "so the operator can approve the research plan before execution "
                    "begins. Triggered manually when a research question arises."
                ),
                "workflow_id": _workflow_uuid("internet-deep-research"),
                "default_profile_ids": [
                    _profile_uuid("research-analyst"),
                    _profile_uuid("research-strategist"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "supervised",
                "output_artifact_types": ["research_brief", "report"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you have a specific research question that needs "
                    "thorough, multi-source investigation with human approval at "
                    "key decision points."
                ),
                "status": "active",
            },
            "tags": ["research", "deep-dive", "manual", "supervised"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Investigating a new market or technology domain",
                    "Building a comprehensive background brief on a topic",
                    "Pre-meeting research preparation with source citations",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Structured research brief with executive summary",
                    "Source-annotated findings organised by sub-topic",
                ],
                "example_inputs": [
                    "Research the current state of solid-state battery technology",
                    "Compile a background brief on EU AI Act compliance requirements",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "manual",
                "suggested_schedule": "",
                "manual_first_recommended": True,
                "requires_approval_review": True,
            },
        },
        # ------------------------------------------------------------------ 4
        {
            "slug": "competitor-intel",
            "mission": {
                "id": _seed_uuid("competitor-intel"),
                "workspace_id": ws,
                "name": "Competitor Intel",
                "slug": "competitor-intel",
                "description": (
                    "Runs on a weekly cron schedule to gather competitive "
                    "intelligence across configured competitor entities. Scrapes "
                    "public sources including news outlets, job boards, patent "
                    "filings, and product changelogs, then distills the information "
                    "into a structured intel report artifact. Each report highlights "
                    "strategic moves, hiring signals, product launches, and market "
                    "positioning changes."
                ),
                "workflow_id": _workflow_uuid("multi-source-synthesis"),
                "default_profile_ids": [
                    _profile_uuid("competitive-analyst"),
                    _profile_uuid("report-writer"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["report", "summary"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you want automated weekly intelligence reports on "
                    "competitors to inform strategic planning and product decisions."
                ),
                "status": "active",
            },
            "tags": ["competitive-intelligence", "weekly", "scheduled", "reports", "autonomous"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Weekly competitive landscape updates for leadership",
                    "Tracking competitor product releases and pricing changes",
                    "Monitoring competitor hiring patterns as strategic signals",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "moderate",
                "expected_outputs": [
                    "Weekly intel report covering all configured competitors",
                    "Executive summary highlighting the most significant moves",
                ],
                "example_inputs": [
                    "Track Stripe, Adyen, and Square for payments industry intel",
                    "Monitor OpenAI, Google DeepMind, and Anthropic product launches",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "cron",
                "suggested_schedule": "0 7 * * 1",
                "manual_first_recommended": False,
                "requires_approval_review": False,
            },
        },
        # ------------------------------------------------------------------ 5
        {
            "slug": "workspace-monitoring",
            "mission": {
                "id": _seed_uuid("workspace-monitoring"),
                "workspace_id": ws,
                "name": "Workspace Monitoring",
                "slug": "workspace-monitoring",
                "description": (
                    "Monitors workspace health, knowledge quality, and operational "
                    "metrics on a heartbeat schedule. Checks for stale knowledge "
                    "entries, orphaned artifacts, failed recent runs, and storage "
                    "utilisation. Produces a workspace health report artifact and "
                    "emits alert artifacts when quality thresholds are breached. "
                    "Acts as the workspace's built-in self-diagnostic system."
                ),
                "workflow_id": _workflow_uuid("workspace-discovery"),
                "default_profile_ids": [
                    _profile_uuid("workspace-ops"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["report", "alert"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use as a background health-check that continuously watches "
                    "your workspace for quality degradation, stale data, and "
                    "operational issues."
                ),
                "status": "active",
            },
            "tags": ["monitoring", "health", "workspace", "heartbeat", "ops"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Continuous workspace quality and freshness monitoring",
                    "Alerting on stale knowledge entries or broken references",
                    "Operational health dashboards for workspace administrators",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Workspace health report with quality scores",
                    "Alert artifacts when thresholds are breached",
                ],
                "example_inputs": [
                    "Monitor default workspace for stale entries older than 30 days",
                    "Track failed run rate and alert if it exceeds 20 percent",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "heartbeat",
                "suggested_schedule": "3600",
                "manual_first_recommended": False,
                "requires_approval_review": False,
            },
        },
        # ------------------------------------------------------------------ 6
        {
            "slug": "knowledge-refinement",
            "mission": {
                "id": _seed_uuid("knowledge-refinement"),
                "workspace_id": ws,
                "name": "Knowledge Refinement",
                "slug": "knowledge-refinement",
                "description": (
                    "Periodically reviews and improves knowledge base entries for "
                    "accuracy, completeness, and clarity. Identifies entries with "
                    "low confidence scores, outdated references, or sparse content, "
                    "then rewrites or enriches them with fresh data. Produces a "
                    "refinement summary artifact listing every entry that was "
                    "updated, along with before-and-after quality scores. Scheduled "
                    "to run on a configurable cron cadence."
                ),
                "workflow_id": _workflow_uuid("verify-and-refine"),
                "default_profile_ids": [
                    _profile_uuid("knowledge-curator"),
                    _profile_uuid("editor"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["summary", "report"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when your knowledge base needs ongoing curation to keep "
                    "entries accurate, well-written, and up to date without "
                    "manual intervention."
                ),
                "status": "active",
            },
            "tags": ["knowledge", "curation", "quality", "scheduled", "autonomous"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Automated knowledge base hygiene and quality improvement",
                    "Enriching sparse entries with additional context and sources",
                    "Flagging and rewriting outdated or low-confidence entries",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "moderate",
                "expected_outputs": [
                    "Refinement summary listing updated entries with quality deltas",
                    "Per-entry before/after comparison reports",
                ],
                "example_inputs": [
                    "Refine all entries with confidence below 0.6 in the tech workspace",
                    "Enrich product knowledge entries with latest release notes",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "cron",
                "suggested_schedule": "0 3 * * *",
                "manual_first_recommended": False,
                "requires_approval_review": False,
            },
        },
        # ------------------------------------------------------------------ 7
        {
            "slug": "exploratory-discovery",
            "mission": {
                "id": _seed_uuid("exploratory-discovery"),
                "workspace_id": ws,
                "name": "Exploratory Discovery",
                "slug": "exploratory-discovery",
                "description": (
                    "Explores adjacent and tangential topics related to the "
                    "workspace's existing knowledge graph, surfacing unexpected "
                    "connections, emerging trends, and novel research directions. "
                    "Triggered manually when the user wants to broaden the "
                    "workspace's horizon. Produces an insight artifact containing "
                    "discovered topics ranked by novelty and relevance, with "
                    "suggested follow-up research threads."
                ),
                "workflow_id": _workflow_uuid("exploratory-swarm"),
                "default_profile_ids": [
                    _profile_uuid("discovery-explorer"),
                    _profile_uuid("research-analyst"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "interactive",
                "output_artifact_types": ["insight", "summary"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you want the system to proactively surface new "
                    "topics, unexpected connections, or emerging trends that your "
                    "current research has not covered."
                ),
                "status": "active",
            },
            "tags": ["discovery", "exploration", "manual", "interactive", "insights"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Brainstorming sessions that need external signal injection",
                    "Identifying white-space opportunities in a research domain",
                    "Expanding a knowledge graph with serendipitous connections",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Insight artifact with ranked novel topics and relevance scores",
                    "Suggested follow-up research threads with rationale",
                ],
                "example_inputs": [
                    "Explore adjacent topics to our quantum computing knowledge base",
                    "Discover emerging intersections between biotech and AI safety",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "manual",
                "suggested_schedule": "",
                "manual_first_recommended": True,
                "requires_approval_review": False,
            },
        },
        # ------------------------------------------------------------------ 8
        {
            "slug": "deep-research-campaign",
            "mission": {
                "id": _seed_uuid("deep-research-campaign"),
                "workspace_id": ws,
                "name": "Deep Research Campaign",
                "slug": "deep-research-campaign",
                "description": (
                    "Executes an extended, multi-day research campaign on a complex "
                    "topic. Breaks the research objective into phases (scoping, "
                    "primary collection, cross-referencing, synthesis, and "
                    "peer-review), advancing through each phase with human "
                    "checkpoints. Produces intermediate progress artifacts and a "
                    "final comprehensive research report. Designed for questions "
                    "that require days of sustained investigation and iterative "
                    "refinement under human supervision."
                ),
                "workflow_id": _workflow_uuid("internet-deep-research"),
                "default_profile_ids": [
                    _profile_uuid("research-strategist"),
                    _profile_uuid("research-analyst"),
                    _profile_uuid("peer-reviewer"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "supervised",
                "output_artifact_types": ["research_brief", "report", "summary"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use for complex, high-stakes research questions that require "
                    "multi-day investigation with structured phases and human "
                    "approval between each stage."
                ),
                "status": "active",
            },
            "tags": ["research", "campaign", "multi-day", "supervised", "manual", "advanced"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Due-diligence research before major strategic decisions",
                    "Comprehensive technology landscape analysis",
                    "Academic-grade literature reviews with iterative refinement",
                ],
                "difficulty_level": "advanced",
                "setup_complexity": "complex",
                "expected_outputs": [
                    "Multi-section research report with executive summary",
                    "Intermediate progress artifacts after each research phase",
                    "Source-annotated evidence packets and citation index",
                ],
                "example_inputs": [
                    "Run a 5-day deep dive into CRISPR therapeutic delivery mechanisms",
                    "Campaign: evaluate three cloud providers for enterprise migration",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "manual",
                "suggested_schedule": "",
                "manual_first_recommended": True,
                "requires_approval_review": True,
            },
        },
        # ------------------------------------------------------------------ 9
        {
            "slug": "daily-summary",
            "mission": {
                "id": _seed_uuid("daily-summary"),
                "workspace_id": ws,
                "name": "Daily Summary",
                "slug": "daily-summary",
                "description": (
                    "Produces an end-of-day summary of all workspace activity "
                    "including completed runs, new knowledge entries, artifacts "
                    "generated, and any errors or warnings that occurred. The "
                    "summary artifact provides a concise operational snapshot that "
                    "helps workspace owners understand what happened during the day "
                    "without reviewing individual logs. Fires automatically via a "
                    "daily cron trigger."
                ),
                "workflow_id": _workflow_uuid("review-and-publish"),
                "default_profile_ids": [
                    _profile_uuid("workspace-ops"),
                    _profile_uuid("digest-writer"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["summary"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you want a fully automated end-of-day snapshot of "
                    "everything that happened in your workspace, delivered as a "
                    "clean summary artifact."
                ),
                "status": "active",
            },
            "tags": ["summary", "daily", "scheduled", "activity", "autonomous"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Daily operational visibility for workspace administrators",
                    "Team stand-up preparation showing overnight activity",
                    "Audit trail summaries for compliance-conscious environments",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "End-of-day summary artifact covering runs, artifacts, and errors",
                    "Activity statistics with trend indicators",
                ],
                "example_inputs": [
                    "Summarise all activity in the default workspace since 00:00 UTC",
                    "Generate daily summary focusing on research mission outcomes",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "cron",
                "suggested_schedule": "0 18 * * *",
                "manual_first_recommended": False,
                "requires_approval_review": False,
            },
        },
        # ----------------------------------------------------------------- 10
        {
            "slug": "experiment-tracking",
            "mission": {
                "id": _seed_uuid("experiment-tracking"),
                "workspace_id": ws,
                "name": "Experiment Tracking",
                "slug": "experiment-tracking",
                "description": (
                    "Tracks and reports on ongoing experiments defined within the "
                    "workspace. On a configurable interval trigger, it checks each "
                    "active experiment's progress, collects intermediate results, "
                    "compares metrics against baseline targets, and produces an "
                    "experiment status report artifact. When an experiment reaches "
                    "a defined completion condition or deviates significantly from "
                    "expected metrics, it emits an alert artifact to notify the "
                    "operator."
                ),
                "workflow_id": _workflow_uuid("plan-execute-review"),
                "default_profile_ids": [
                    _profile_uuid("experiment-analyst"),
                ],
                "default_trigger_ids": [],
                "autonomy_mode": "autonomous",
                "output_artifact_types": ["experiment_result", "report", "alert"],
                "is_system": True,
                "is_template": True,
                "recommended_use_case": (
                    "Use when you are running long-lived experiments and need "
                    "automated progress tracking, metric comparison, and deviation "
                    "alerts without manual check-ins."
                ),
                "status": "active",
            },
            "tags": ["experiments", "tracking", "interval", "metrics", "autonomous"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Monitoring A/B tests and alerting on statistical significance",
                    "Tracking ML training runs against baseline performance",
                    "Long-running research experiments that need periodic check-ins",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "moderate",
                "expected_outputs": [
                    "Experiment status report with metric comparisons",
                    "Alert artifacts when experiments complete or deviate",
                    "Trend charts summarising metric trajectories over time",
                ],
                "example_inputs": [
                    "Track three active pricing experiments and report daily metrics",
                    "Monitor fine-tuning run and alert if validation loss plateaus",
                ],
                "clone_behavior": "clone_only",
                "suggested_trigger_type": "interval",
                "suggested_schedule": "7200",
                "manual_first_recommended": True,
                "requires_approval_review": False,
            },
        },
    ])


# ---------------------------------------------------------------------------
# Seeder entrypoint
# ---------------------------------------------------------------------------

async def seed_example_missions(
    service: MissionSeeder,
    workspace_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """Seed deterministic mission definitions through the mission service."""

    created_missions: list[dict[str, Any]] = []
    for blueprint in get_seed_mission_blueprints(workspace_id):
        created_missions.append(await service.create_mission(blueprint["mission"]))
    return created_missions
