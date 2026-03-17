"""Deterministic seed data for curated agent profiles."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/profiles")

# Architecture component namespaces (must match their respective seed modules)
_CB_NS = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/capability-bundles")
_SP_NS = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/safety-policies")
_MEM_NS = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/memory-policies")
_MOD_NS = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/model-policies")
_OC_NS = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/output-contracts")


class ProfileSeeder(Protocol):
    """Protocol for profile seed helpers."""

    async def create_profile(self, profile_data: dict[str, Any]) -> dict[str, Any]:
        ...


def _seed_uuid(slug: str) -> UUID:
    return uuid5(SEED_NAMESPACE, slug)


def _cb(slug: str) -> str:
    """Capability bundle UUID as string (for JSONB array storage)."""
    return str(uuid5(_CB_NS, slug))


def _sp(scope_id: str) -> UUID:
    """Safety policy UUID."""
    return uuid5(_SP_NS, scope_id)


def _mem(slug: str) -> UUID:
    """Memory policy UUID."""
    return uuid5(_MEM_NS, slug)


def _mod(slug: str) -> UUID:
    """Model policy UUID."""
    return uuid5(_MOD_NS, slug)


def _oc(slug: str) -> UUID:
    """Output contract UUID."""
    return uuid5(_OC_NS, slug)


def get_seed_profile_blueprints() -> list[dict[str, Any]]:
    """Return deterministic profile blueprints for the product catalog.

    These 11 curated profiles serve as the showcase entries that users
    clone and customize for their own workspaces.
    """

    return [
        # ------------------------------------------------------------------ 1
        {
            "id": _seed_uuid("profile.planning"),

            "name": "Planning Profile",
            "slug": "planning",
            "description": (
                "A strategic coordinator that excels at breaking complex objectives "
                "into structured, actionable plans. It analyses requirements, identifies "
                "dependencies, estimates effort, and produces step-by-step roadmaps that "
                "other agents can execute. Use this profile when you need a clear plan of "
                "attack before committing resources to execution."
            ),
            "version": "1.0.0",
            "role": "coordinator",
            "system_prompt_ref": "profile.planning",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.planner")],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.standard-chat"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.streaming-text"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "clipboard-list",
            "tags": ["planning", "coordination", "task-decomposition", "strategy"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Breaking a large project into milestones and tasks",
                    "Creating sprint or iteration plans from a backlog",
                    "Producing dependency graphs for multi-step objectives",
                    "Generating phased rollout strategies",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Structured task breakdown with priorities and dependencies",
                    "Milestone timelines with estimated effort",
                    "Risk assessment notes per phase",
                ],
                "example_inputs": [
                    "Plan the migration of our monolith to microservices",
                    "Break down the launch checklist for our new SaaS product",
                    "Create a phased rollout plan for the Q3 feature set",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Direct task execution without planning context",
                    "Creative writing or open-ended brainstorming",
                    "Real-time conversational assistance",
                ],
            },
        },
        # ------------------------------------------------------------------ 2
        {
            "id": _seed_uuid("profile.research"),

            "name": "Research Profile",
            "slug": "research",
            "description": (
                "A focused research specialist that gathers, organises, and synthesises "
                "information on a given topic. It methodically collects facts from available "
                "sources, cross-references claims, and delivers well-structured research "
                "briefs. Ideal for answering factual questions, compiling background "
                "material, or preparing reference documents before deeper analysis."
            ),
            "version": "1.0.0",
            "role": "specialist",
            "system_prompt_ref": "profile.research",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.research-assistant")],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.research-mode"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.citation-required"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "search",
            "tags": ["research", "fact-gathering", "analysis", "information-retrieval"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Compiling background research on a new market or technology",
                    "Answering multi-faceted factual questions with cited sources",
                    "Preparing reference briefs ahead of a decision meeting",
                    "Gathering competitive intelligence summaries",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Structured research brief with key findings",
                    "Fact sheets with source attributions",
                    "Comparison tables summarising alternatives",
                ],
                "example_inputs": [
                    "Research the current state of WebAssembly adoption in production",
                    "Summarise the key differences between gRPC and REST for internal APIs",
                    "Compile a brief on recent EU AI regulation developments",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Live web browsing or real-time data fetching",
                    "Executing code or running experiments",
                    "Opinion generation without factual grounding",
                ],
            },
        },
        # ------------------------------------------------------------------ 3
        {
            "id": _seed_uuid("profile.deep-research"),

            "name": "Deep Research Profile",
            "slug": "deep-research",
            "description": (
                "An advanced research specialist designed for deep, multi-source "
                "investigations that require synthesis across disparate domains. Unlike "
                "the standard Research Profile, this agent pursues follow-up questions, "
                "identifies conflicting evidence, weighs source credibility, and produces "
                "comprehensive analytical reports with nuanced conclusions. Deploy it for "
                "complex research questions where surface-level answers are insufficient."
            ),
            "version": "1.0.0",
            "role": "specialist",
            "system_prompt_ref": "profile.deep-research",

            # Architecture references
            "capability_bundle_ids": [
                _cb("bundle.research-assistant"),
                _cb("bundle.deep-retrieval"),
            ],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.full-context"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.citation-required"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "microscope",
            "tags": ["deep-research", "synthesis", "multi-source", "analytical", "advanced"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "In-depth literature reviews spanning multiple disciplines",
                    "Investigating contradictory claims across sources",
                    "Producing white-paper-grade analytical reports",
                    "Due-diligence research for strategic decisions",
                ],
                "difficulty_level": "advanced",
                "setup_complexity": "moderate",
                "expected_outputs": [
                    "Comprehensive analytical report with executive summary",
                    "Evidence matrix mapping claims to sources with credibility scores",
                    "Identified knowledge gaps and recommended follow-up investigations",
                ],
                "example_inputs": [
                    "Conduct a deep analysis of LLM scaling laws and their economic implications",
                    "Investigate conflicting studies on remote-work productivity and synthesise findings",
                    "Produce a due-diligence report on the technical moat of Company X",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Quick factual lookups better served by the Research Profile",
                    "Tasks requiring real-time data streams",
                    "Creative content generation",
                ],
            },
        },
        # ------------------------------------------------------------------ 4
        {
            "id": _seed_uuid("profile.exploratory"),

            "name": "Exploratory Profile",
            "slug": "exploratory",
            "description": (
                "An open-ended exploration specialist that thrives in ambiguous problem "
                "spaces. Rather than converging on a single answer, it generates multiple "
                "hypotheses, maps possibility spaces, surfaces unexpected connections, and "
                "identifies promising avenues for further investigation. Best used at the "
                "start of a project when the problem itself is not yet well-defined."
            ),
            "version": "1.0.0",
            "role": "specialist",
            "system_prompt_ref": "profile.exploratory",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.knowledge-worker")],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.research-mode"),
            "safety_policy_id": _sp("safety-policy.permissive-safety"),
            "output_contract_id": _oc("output-contract.streaming-text"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "compass",
            "tags": ["exploration", "ideation", "divergent-thinking", "discovery", "brainstorming"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Exploring a new problem domain before committing to a direction",
                    "Generating diverse solution hypotheses for an open-ended challenge",
                    "Mapping the landscape of approaches for a technical decision",
                    "Discovering non-obvious connections between separate topics",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Hypothesis map with multiple candidate directions",
                    "Opportunity landscape with pros, cons, and unknowns per path",
                    "List of promising avenues ranked by potential and feasibility",
                ],
                "example_inputs": [
                    "Explore possible architectures for a real-time collaborative editor",
                    "What are all the ways we could reduce onboarding time for new hires?",
                    "Map the design space for a plugin system in our platform",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Tasks that require a single definitive answer",
                    "Execution of well-defined instructions",
                    "Fact-checking or verification workflows",
                ],
            },
        },
        # ------------------------------------------------------------------ 5
        {
            "id": _seed_uuid("profile.summarization"),

            "name": "Summarization Profile",
            "slug": "summarization",
            "description": (
                "A precision worker that condenses long-form content into clear, accurate "
                "summaries at the requested level of detail. It preserves key facts, "
                "maintains the original tone and intent, and produces outputs in formats "
                "ranging from one-line TLDRs to structured executive summaries. Use it "
                "whenever you need to distil large volumes of text into digestible form."
            ),
            "version": "1.0.0",
            "role": "worker",
            "system_prompt_ref": "profile.summarization",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.retrieval-only")],
            "model_policy_id": _mod("model-policy.cost-optimized"),
            "memory_policy_id": _mem("memory-policy.short-context"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.streaming-text"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "file-text",
            "tags": ["summarization", "condensation", "distillation", "writing", "brevity"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Summarising meeting transcripts into action-item lists",
                    "Creating executive summaries from lengthy reports",
                    "Distilling research papers into key-takeaway briefs",
                    "Generating changelog summaries from verbose commit histories",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Concise summary preserving all critical information",
                    "Bullet-point key takeaways with optional detail tiers",
                    "Structured executive summary with sections and highlights",
                ],
                "example_inputs": [
                    "Summarise this 40-page quarterly report into a one-page executive brief",
                    "Produce bullet-point takeaways from the attached meeting transcript",
                    "Condense these 12 research papers into a comparative summary table",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Generating new content or creative writing",
                    "Answering questions that require external research",
                    "Tasks requiring opinion or subjective judgment",
                ],
            },
        },
        # ------------------------------------------------------------------ 6
        {
            "id": _seed_uuid("profile.verification"),

            "name": "Verification Profile",
            "slug": "verification",
            "description": (
                "A meticulous reviewer that validates claims, checks factual accuracy, "
                "and audits content for consistency and correctness. It cross-references "
                "assertions against known sources, flags unsupported claims, identifies "
                "logical fallacies, and produces structured verification reports with "
                "confidence ratings. Essential as a quality gate before publishing or "
                "acting on research outputs."
            ),
            "version": "1.0.0",
            "role": "reviewer",
            "system_prompt_ref": "profile.verification",

            # Architecture references
            "capability_bundle_ids": [
                _cb("bundle.read-only-tools"),
                _cb("bundle.semantic-search"),
            ],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.research-mode"),
            "safety_policy_id": _sp("safety-policy.strict-safety"),
            "output_contract_id": _oc("output-contract.citation-required"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "shield-check",
            "tags": ["verification", "fact-checking", "quality-assurance", "validation", "audit"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Fact-checking a research brief before it reaches stakeholders",
                    "Validating technical claims in a proposal or whitepaper",
                    "Auditing generated content for hallucinations or inaccuracies",
                    "Running a consistency check across multiple related documents",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Verification report with per-claim confidence ratings",
                    "List of unsupported or questionable assertions with explanations",
                    "Consistency audit highlighting contradictions across sources",
                ],
                "example_inputs": [
                    "Verify the factual claims in this market analysis report",
                    "Check whether the statistics cited in this blog post are accurate",
                    "Audit this generated research brief for hallucinated references",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Generating original research or content",
                    "Open-ended exploration without specific claims to verify",
                    "Tasks that require creative judgment rather than factual accuracy",
                ],
            },
        },
        # ------------------------------------------------------------------ 7
        {
            "id": _seed_uuid("profile.general-task"),

            "name": "General Task Profile",
            "slug": "general-task",
            "description": (
                "A versatile general-purpose assistant capable of handling a wide variety "
                "of everyday tasks. From drafting emails and answering questions to light "
                "data formatting and brainstorming, this profile provides a balanced "
                "combination of helpfulness and adaptability. It is the recommended "
                "starting point when no specialised profile fits the task at hand."
            ),
            "version": "1.0.0",
            "role": "assistant",
            "system_prompt_ref": "profile.general-task",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.full-assistant")],
            "model_policy_id": _mod("model-policy.permissive"),
            "memory_policy_id": _mem("memory-policy.standard-chat"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.streaming-text"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "bot",
            "tags": ["general-purpose", "assistant", "versatile", "everyday", "default"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Drafting and editing emails, messages, or short documents",
                    "Answering general knowledge questions",
                    "Light data formatting, conversion, or transformation",
                    "Brainstorming ideas when a specialised profile is not needed",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Clear, well-structured responses tailored to the request",
                    "Drafted content ready for review or direct use",
                    "Formatted data in the requested structure",
                ],
                "example_inputs": [
                    "Draft a professional reply to this client email",
                    "Convert this CSV data into a Markdown table",
                    "Help me brainstorm five tagline options for our new product",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Deep multi-source research requiring advanced synthesis",
                    "Mission-critical fact-checking or verification",
                    "Complex multi-step workflow orchestration",
                ],
            },
        },
        # ------------------------------------------------------------------ 8
        {
            "id": _seed_uuid("profile.internet-research"),

            "name": "Internet Research Profile",
            "slug": "internet-research",
            "description": (
                "A web-savvy research specialist that leverages search tools and online "
                "sources to gather up-to-date information from the internet. It formulates "
                "effective search queries, evaluates source credibility, extracts relevant "
                "data from web pages, and synthesises findings into structured reports. "
                "Use this profile when your research questions require current data that "
                "may not exist in static knowledge bases."
            ),
            "version": "1.0.0",
            "role": "specialist",
            "system_prompt_ref": "profile.internet-research",

            # Architecture references
            "capability_bundle_ids": [
                _cb("bundle.web-research-tools"),
                _cb("bundle.semantic-search"),
            ],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.research-mode"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.citation-required"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "globe",
            "tags": ["internet", "web-search", "online-research", "current-data", "sourcing"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Finding the latest news or announcements on a topic",
                    "Gathering current pricing, availability, or feature comparisons",
                    "Sourcing recent statistics or data points for a report",
                    "Monitoring competitor activity through public web sources",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "moderate",
                "expected_outputs": [
                    "Research summary with URLs and access timestamps",
                    "Curated list of sources ranked by relevance and credibility",
                    "Extracted data tables or fact sheets from web content",
                ],
                "example_inputs": [
                    "Find the latest benchmark comparisons for GPT-4o vs Claude 3.5 Sonnet",
                    "What are the current pricing tiers for the top 5 vector databases?",
                    "Gather recent news articles about AI regulation in the EU from the past month",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Offline analysis of already-collected documents",
                    "Tasks that do not benefit from live web data",
                    "Creative writing or content generation",
                ],
            },
        },
        # ------------------------------------------------------------------ 9
        {
            "id": _seed_uuid("profile.critic-reviewer"),

            "name": "Critic / Reviewer Profile",
            "slug": "critic-reviewer",
            "description": (
                "A sharp-eyed critical analyst that provides constructive, detailed "
                "feedback on content, code, designs, or strategies. It evaluates work "
                "against stated goals, industry best practices, and internal standards, "
                "then delivers structured critiques with specific, actionable improvement "
                "suggestions. Deploy this profile as a review gate to elevate quality "
                "before finalisation."
            ),
            "version": "1.0.0",
            "role": "reviewer",
            "system_prompt_ref": "profile.critic-reviewer",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.read-only-tools")],
            "model_policy_id": _mod("model-policy.high-quality"),
            "memory_policy_id": _mem("memory-policy.standard-chat"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.streaming-text"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "message-square-warning",
            "tags": ["critique", "review", "feedback", "quality", "improvement"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Reviewing draft documents for clarity, tone, and completeness",
                    "Providing code review feedback on architecture and style",
                    "Evaluating a strategy proposal for gaps and risks",
                    "Critiquing design mockups against UX best practices",
                ],
                "difficulty_level": "intermediate",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Structured critique with severity-rated findings",
                    "Actionable improvement suggestions per finding",
                    "Overall quality assessment with a confidence score",
                ],
                "example_inputs": [
                    "Review this API design document and highlight any gaps",
                    "Critique the attached blog post for clarity and persuasiveness",
                    "Evaluate our proposed pricing strategy and identify risks",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Generating original content from scratch",
                    "Executing tasks or making changes directly",
                    "Exploratory brainstorming without material to review",
                ],
            },
        },
        # ------------------------------------------------------------------ 10
        {
            "id": _seed_uuid("profile.router-dispatcher"),

            "name": "Router / Dispatcher Profile",
            "slug": "router-dispatcher",
            "description": (
                "An intelligent coordinator that analyses incoming requests and routes "
                "them to the most appropriate specialist profile or workflow. It classifies "
                "intent, assesses complexity, selects the best-fit agent, and hands off "
                "the task with properly formatted context. Use this profile as the front "
                "door to a multi-agent system where requests vary widely in type and "
                "required expertise."
            ),
            "version": "1.0.0",
            "role": "coordinator",
            "system_prompt_ref": "profile.router-dispatcher",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.coordinator")],
            "model_policy_id": _mod("model-policy.cost-optimized"),
            "memory_policy_id": _mem("memory-policy.coordination-memory"),
            "safety_policy_id": _sp("safety-policy.trust-boundary-enforced"),
            "output_contract_id": _oc("output-contract.structured-json"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "git-branch",
            "tags": ["routing", "dispatch", "classification", "orchestration", "triage"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Building a front-door agent that triages mixed-type requests",
                    "Routing customer support tickets to specialised handlers",
                    "Dispatching sub-tasks to appropriate specialist agents in a workflow",
                    "Classifying and prioritising incoming work items",
                ],
                "difficulty_level": "advanced",
                "setup_complexity": "complex",
                "expected_outputs": [
                    "Routing decision with selected target profile and confidence score",
                    "Reformatted request context tailored to the target specialist",
                    "Classification labels and priority assessment",
                ],
                "example_inputs": [
                    "Route this user message to the right specialist agent",
                    "Classify these 20 support tickets by category and urgency",
                    "Determine which workflow should handle this multi-part request",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Directly answering end-user questions",
                    "Performing the actual work after routing",
                    "Scenarios with only one possible handler",
                ],
            },
        },
        # ------------------------------------------------------------------ 11
        {
            "id": _seed_uuid("profile.executor"),

            "name": "Executor Profile",
            "slug": "executor",
            "description": (
                "A disciplined task executor that carries out well-defined instructions "
                "with precision and reliability. Given clear specifications, it performs "
                "the work step by step, reports progress, handles edge cases gracefully, "
                "and delivers outputs in the exact format requested. This profile is the "
                "workhorse of any multi-agent pipeline, turning plans into completed "
                "deliverables."
            ),
            "version": "1.0.0",
            "role": "worker",
            "system_prompt_ref": "profile.executor",

            # Architecture references
            "capability_bundle_ids": [_cb("bundle.tool-executor")],
            "model_policy_id": _mod("model-policy.cost-optimized"),
            "memory_policy_id": _mem("memory-policy.short-context"),
            "safety_policy_id": _sp("safety-policy.standard-safety"),
            "output_contract_id": _oc("output-contract.batch-processing"),

            "is_system": True,
            "is_template": True,
            "status": "active",
            "icon": "play-circle",
            "tags": ["execution", "task-runner", "worker", "implementation", "delivery"],
            "catalog_metadata": {
                "recommended_use_cases": [
                    "Executing clearly specified data transformation tasks",
                    "Carrying out step-by-step instructions from a planning agent",
                    "Generating outputs in a strict schema or template",
                    "Running repetitive tasks with consistent quality",
                ],
                "difficulty_level": "beginner",
                "setup_complexity": "minimal",
                "expected_outputs": [
                    "Completed deliverable matching the input specification",
                    "Step-by-step execution log with status per step",
                    "Structured output in the requested format",
                ],
                "example_inputs": [
                    "Using the attached plan, generate the SQL migration scripts for each step",
                    "Format these 50 records according to the provided JSON schema",
                    "Execute each task in this checklist and report completion status",
                ],
                "clone_behavior": "clone_only",
                "not_intended_for": [
                    "Ambiguous requests that require planning or scoping first",
                    "Strategic decision-making or open-ended exploration",
                    "Quality review of its own outputs",
                ],
            },
        },
    ]


async def seed_example_profiles(service: ProfileSeeder, workspace_id: UUID | None = None) -> list[dict[str, Any]]:
    """Seed deterministic profile definitions through the profile service."""

    created_profiles: list[dict[str, Any]] = []
    for blueprint in get_seed_profile_blueprints():
        created_profiles.append(await service.create_profile(blueprint))
    return created_profiles
