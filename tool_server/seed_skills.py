"""Seed native and external skills on first boot.

Both functions are idempotent: they skip any skill whose directory already
exists, so they are safe to call on every startup.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

logger = logging.getLogger("tool_server.seed_skills")

# ---------------------------------------------------------------------------
# Native skills -- written directly to disk
# ---------------------------------------------------------------------------

NATIVE_SKILLS = [
    {
        "slug": "financial-analysis",
        "name": "Financial Analysis",
        "description": "Financial analysis methodology for market intelligence, trading signals, and investment research.",
        "content": """# Financial Analysis Skill

## Technical Analysis Framework

### Key Indicators (search for current values)
- **Trend**: EMA 20/50/200 relationship, MACD signal/histogram
- **Momentum**: RSI (overbought >70, oversold <30), Stochastic
- **Volume**: OBV trend, volume confirmation of price moves
- **Volatility**: Bollinger Band width, ATR
- **Support/Resistance**: Prior swing highs/lows, round numbers, VWAP

### Reading Technical Signals
- ALL indicators aligning = STRONG signal
- 3/5 indicators aligning = MODERATE signal
- Conflicting indicators = WEAK/NO signal
- Always check the TIMEFRAME — daily, weekly, and monthly can conflict

## Fundamental Analysis Framework

### Equity Metrics
- **Valuation**: P/E, P/S, EV/EBITDA (compare to sector median)
- **Growth**: Revenue growth rate, earnings growth, margins trend
- **Quality**: ROE, debt-to-equity, free cash flow yield
- **Catalysts**: Earnings dates, product launches, regulatory events

### Forex/Macro Metrics
- Interest rate differentials and central bank policy direction
- GDP growth comparisons between currency economies
- Trade balance and current account trends
- Inflation differentials (CPI, PCE)

## Sentiment Analysis Framework

### Data Sources (search for each)
- Recent news headlines: count positive vs negative
- Analyst ratings: consensus direction and recent changes
- Options flow: put/call ratios, unusual volume
- Social sentiment: Reddit, Twitter mentions trending direction

### Sentiment Score
- BULLISH: >70% positive signals across sources
- BEARISH: >70% negative signals
- NEUTRAL: Mixed or inconclusive signals

## Risk Assessment

Every signal MUST include:
1. What could go wrong (invalidation criteria)
2. Upcoming events that could override the signal
3. Correlation risks (correlated positions amplify exposure)
4. Liquidity assessment (can you exit if wrong?)

## DISCLAIMER TEMPLATE
"This is AI-generated informational analysis, NOT financial advice. Past performance does not predict future results. Always consult a qualified financial advisor before making trading decisions."
""",
    },
    {
        "slug": "geopolitical-assessment",
        "name": "Geopolitical Assessment",
        "description": "Structured geopolitical situation assessment methodology.",
        "content": """# Geopolitical Assessment Skill

## Source Credibility Hierarchy

1. **Official**: Government statements, press releases, UN resolutions
2. **Wire**: Reuters, AP, AFP (fast, generally reliable)
3. **Quality broadsheet**: BBC, FT, NYT, Economist, Al Jazeera
4. **Regional specialist**: Local outlets in the affected region
5. **Think tanks**: CSIS, Brookings, Chatham House, IISS, Carnegie
6. **OSINT**: Satellite imagery, flight tracking, shipping data
7. **Social media**: ONLY for real-time event tracking, NEVER as sole source

## SITREP Structure

1. **BLUF** (Bottom Line Up Front): 1-2 sentence summary
2. **Current situation**: What is happening RIGHT NOW (facts only)
3. **Recent developments**: Timeline of key events (last 7-30 days)
4. **Key actors**: Who are the principals and what are their positions
5. **Escalation indicators**: What signals worsening
6. **De-escalation indicators**: What signals improvement
7. **Scenario analysis**: Base/upside/downside cases with probabilities
8. **Impact assessment**: Through the specified lens
9. **Watch points**: Upcoming dates, events, thresholds

## Risk Level Assessment

- **LOW**: Stable situation, no escalation signals
- **ELEVATED**: Early warning signals present, monitoring warranted
- **HIGH**: Active escalation, potential for significant disruption
- **CRITICAL**: Imminent threat of major disruption or conflict

## Bias Avoidance

- Present facts, not opinions about which side is "right"
- Note when a source is state-controlled media
- Distinguish between confirmed facts and "reportedly" / "allegedly"
- When Western and non-Western media disagree, present both
- Always date-stamp information — geopolitics moves fast
""",
    },
    {
        "slug": "research-methodology",
        "name": "Research Methodology",
        "description": "Standardized research methodology for OpenForge agents.",
        "content": """# Research Methodology Skill

## Query Decomposition

Before searching, decompose the question:
1. What are the CORE facts needed?
2. What are SUPPORTING details?
3. What is TIME-SENSITIVE vs STABLE information?
4. What requires PRIMARY vs SECONDARY sources?

Generate 3-5 search queries:
- Query 1: Broad (the main topic)
- Query 2: Specific angle #1
- Query 3: Specific angle #2
- Query 4: Recency-focused (add year or "latest")
- Query 5: Counter-perspective (opposing viewpoint)

## Search Strategy

### Breadth-First Phase
- Run all queries, collect top results from each
- Scan snippets for relevance and recency
- Identify which results warrant full-page reading

### Depth Phase
- Fetch full pages for the 3-5 most promising results
- Extract specific facts, data points, quotes
- Note the publication date and author credentials

### Cross-Reference Phase
- For each KEY claim, check if 2+ independent sources agree
- Flag any claim supported by only 1 source
- Note conflicts between sources

## Confidence Rating

- **HIGH**: 3+ independent, reputable sources agree
- **MEDIUM**: 2 sources agree, OR strong single primary source
- **LOW**: Single source, unverified, or sources conflict
- **UNVERIFIABLE**: Cannot be checked with available tools

## Anti-Hallucination Rules

- If you can't find it, say "I could not find information on this"
- NEVER fabricate a citation or source URL
- NEVER present a single source's claim as established fact
- NEVER add information "from memory" that wasn't in search results
- When paraphrasing, stay faithful to the source's meaning
""",
    },
    {
        "slug": "data-analysis-patterns",
        "name": "Data Analysis Patterns",
        "description": "Reference patterns for data analysis in Python.",
        "content": """# Data Analysis Patterns

## Quick Reference: When to Use What

| Question Type | Statistical Method | Python |
|---------------|-------------------|--------|
| Is there a difference between groups? | t-test / Mann-Whitney | `scipy.stats.ttest_ind` |
| Is there an association? | Chi-square | `scipy.stats.chi2_contingency` |
| Does X predict Y? | Linear regression | `scipy.stats.linregress` or `sklearn` |
| What's the trend over time? | Moving average + decomposition | `pandas.rolling`, `statsmodels` |
| Are there clusters? | K-means / DBSCAN | `sklearn.cluster` |
| What's the distribution? | Histogram + Shapiro-Wilk test | `scipy.stats.shapiro` |

## Data Cleaning Checklist

```python
# Standard cleaning pipeline
df.info()                          # Types and nulls
df.describe()                      # Stats
df.duplicated().sum()              # Duplicates
df.isnull().sum() / len(df) * 100  # Null percentages

# Fix common issues
df = df.drop_duplicates()
df['date'] = pd.to_datetime(df['date'], errors='coerce')
df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
df = df.dropna(subset=['required_column'])
df['optional'] = df['optional'].fillna(df['optional'].median())
```

## Visualization Defaults

```python
import matplotlib.pyplot as plt
import seaborn as sns
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette('viridis')
plt.rcParams['figure.figsize'] = (10, 6)
plt.rcParams['font.size'] = 12
```

## Chart Selection

- Comparison across categories: **Bar chart**
- Change over time: **Line chart**
- Correlation between variables: **Scatter plot**
- Distribution shape: **Histogram** or **Box plot**
- Composition / parts of whole: **Stacked bar** (not pie)
- Correlation matrix: **Heatmap**
""",
    },
    {
        "slug": "automation-design",
        "name": "Automation Design",
        "description": "Design patterns for OpenForge automations.",
        "content": """# Automation Design Skill for OpenForge

## Core Concepts

An **automation** is a DAG (directed acyclic graph) of agent nodes and sink nodes.
- **Agent nodes**: Execute an agent with inputs, produce structured outputs
- **Sink nodes**: Accept agent outputs and perform an action
- **Wiring**: Connects agent outputs to other agent inputs or to sink inputs
- **Static inputs**: Values set at design time (baked into the automation)
- **Deployment inputs**: Values that must be provided when deploying

## Design Patterns

### Sequential Pipeline
Agent A -> Agent B -> Agent C -> Sink
- Good for: research -> analysis -> writing pipelines

### Fan-out / Fan-in
Agent A -> [Agent B, Agent C, Agent D] -> Agent E -> Sink
- Good for: multi-dimensional analysis

### Monitor + React
Agent A (monitors) -> Agent B (analyzes) -> Sink (notifies)
- Good for: news monitoring, price alerts, change detection

## Trigger Selection

| Trigger | When to Use |
|---------|-------------|
| **Manual** | One-off tasks, testing |
| **Cron** | Scheduled tasks (e.g., `0 7 * * 1-5`) |
| **Interval** | Continuous monitoring |
""",
    },
    {
        "slug": "communication-frameworks",
        "name": "Communication Frameworks",
        "description": "Communication frameworks for professional messaging.",
        "content": """# Communication Frameworks

## High-Stakes Message Strategy (always offer 2-3 variants)

### Framework: GOALS
- **G**oal: What outcome do you want?
- **O**bstacles: What could prevent it?
- **A**pproach: What strategy gets past the obstacles?
- **L**anguage: What words/tone match the approach?
- **S**tructure: What format serves the goal?

### Common Variant Patterns

**Bad News Delivery:**
1. "Rip the bandaid" — direct, factual, empathetic
2. "Soften the landing" — context first, then the news, then path forward
3. "Collaborative frame" — present it as a shared challenge

**Asking for Something:**
1. "Direct ask" — state what you need, why, and by when
2. "Build the case" — provide context and evidence, then ask
3. "Reciprocity" — lead with what you're offering, then state the ask

**Disagreeing:**
1. "Hold firm" — clear, evidence-based pushback
2. "Disagree and commit" — state concern but signal willingness
3. "Seek alignment" — find common ground, narrow disagreement

## Channel Calibration

**Email**: Lead with the ask. Short paragraphs. Clear subject line.
**Slack**: One screen max. Bold action items. Thread for context.
**Meeting Agenda**: Objective in 1 sentence. Items with time allocations.
""",
    },
]

# ---------------------------------------------------------------------------
# Tier 1 external skills -- installed via `npx skills add`
# ---------------------------------------------------------------------------

TIER1_SKILLS = [
    {"source": "vercel-labs/skills", "skills": ["find-skills"]},
    {"source": "anthropics/skills", "skills": ["frontend-design", "pdf", "docx", "xlsx", "pptx", "skill-creator"]},
    {"source": "obra/superpowers", "skills": ["systematic-debugging", "test-driven-development", "writing-plans", "executing-plans", "verification-before-completion", "brainstorming"]},
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def seed_native_skills(skills_dir: str) -> None:
    """Write built-in SKILL.md files into the skills directory.

    Idempotent: skips any skill whose directory already exists.
    """
    base = Path(skills_dir)
    base.mkdir(parents=True, exist_ok=True)

    for skill in NATIVE_SKILLS:
        skill_path = base / skill["slug"]
        if skill_path.exists():
            logger.debug("Native skill '%s' already exists, skipping", skill["slug"])
            continue

        skill_path.mkdir(parents=True, exist_ok=True)

        frontmatter = (
            f"---\n"
            f"name: {skill['name']}\n"
            f"description: {skill['description']}\n"
            f"---\n"
        )
        (skill_path / "SKILL.md").write_text(
            frontmatter + skill["content"], encoding="utf-8"
        )
        logger.info("Seeded native skill '%s'", skill["slug"])


async def seed_external_skills(skills_root: str, skills_dir: str) -> None:
    """Install Tier 1 skills.sh packages via ``npx skills add``.

    Idempotent: skips any skill whose directory already exists under
    *skills_dir*.  Failures are logged as warnings but never raised.
    """
    from tools.skills.install import _promote_cli_skills

    base = Path(skills_dir)
    base.mkdir(parents=True, exist_ok=True)
    root = Path(skills_root)
    root.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["npm_config_update_notifier"] = "false"
    env["DISABLE_TELEMETRY"] = "1"
    env["NO_COLOR"] = "1"
    env["FORCE_COLOR"] = "0"

    for entry in TIER1_SKILLS:
        source = entry["source"]
        skill_names: list[str] = entry["skills"]

        # Check which skills still need installing
        missing = [s for s in skill_names if not (base / s).exists()]
        if not missing:
            logger.debug(
                "All skills from '%s' already installed, skipping", source
            )
            continue

        logger.info(
            "Installing Tier 1 skills from '%s': %s", source, missing
        )

        cmd = [
            "npx", "--yes", "skills", "add", source,
            "-a", "claude-code", "--copy", "-y",
        ]
        for name in missing:
            cmd += ["--skill", name]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(root),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=120
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                logger.warning(
                    "Timed out installing skills from '%s'", source
                )
                continue

            if proc.returncode != 0:
                err_text = stderr.decode("utf-8", errors="replace")[:500]
                logger.warning(
                    "Failed to install skills from '%s' (rc=%d): %s",
                    source, proc.returncode, err_text,
                )
                continue

            # Move installed skills from CLI staging to final location
            _promote_cli_skills(root, base)
            logger.info("Installed Tier 1 skills from '%s'", source)

        except Exception:
            logger.warning(
                "Error installing skills from '%s'", source, exc_info=True
            )
