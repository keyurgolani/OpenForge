---
name: Research Methodology
slug: research-methodology
description: Standardized research methodology for OpenForge agents. Covers query decomposition, multi-source search strategy, source evaluation, cross-referencing, and structured brief generation.
tags:
  - research
  - methodology
  - cross-agent
---

# Research Methodology Skill

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

## Research Brief Template

```
# Research Brief: [Topic]
Date: [current date]
Confidence: [HIGH/MEDIUM/LOW]

## Key Findings
1. [Finding with citation]
2. [Finding with citation]

## Source Agreement
[Where sources agree and disagree]

## Open Questions
[What couldn't be determined]

## Sources
1. [Title] — [Source] — [URL] — [Date]
```

## Anti-Hallucination Rules

- If you can't find it, say "I could not find information on this"
- NEVER fabricate a citation or source URL
- NEVER present a single source's claim as established fact
- NEVER add information "from memory" that wasn't in search results
- When paraphrasing, stay faithful to the source's meaning
