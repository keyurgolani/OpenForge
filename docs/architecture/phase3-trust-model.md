# Phase 3 Trust Model

Phase 3 introduces an explicit trust foundation with four rules:

1. Prompts are managed domain objects.
2. Policy decisions come from the shared evaluator.
3. Approval requests are durable records.
4. Untrusted context is wrapped before prompt insertion.

## Trust Levels

### Trusted

Trusted content can shape instructions directly:

- system prompt content
- operator-authored prompt content
- direct user-authored conversation content

### Untrusted

Untrusted content is treated as data, not instructions:

- retrieved knowledge snippets
- raw tool output
- file content
- external web content
- summaries derived from untrusted sources unless explicitly promoted

## Boundary Handling

`backend/openforge/runtime/trust_boundaries.py` owns the source classification rules.

`backend/openforge/runtime/input_preparation.py` owns how trusted instructions and untrusted context blocks are assembled into LLM messages.

Untrusted context is wrapped with `<untrusted_content ...>` metadata so:

- the model sees a clear boundary
- logs and debugging surfaces can explain the source
- future runtime UIs can display provenance consistently

## Prompt Integrity

Managed prompts now carry:

- prompt id
- version
- owner metadata
- variable schema
- render usage logs

Rendering fails loudly on:

- missing required variables
- extra undeclared variables in strict mode
- invalid variable types
- missing prompt versions

## Policy Integrity

Tool access is evaluated centrally against:

- applicable scope hierarchy
- explicit allow/block/approval lists
- policy rules
- run-scoped rate limits
- risk-category defaults

Every decision returns a structured explanation:

- decision
- matched policy
- matched scope
- reason code
- reason text
- rate-limit state

## Approval Integrity

Approval requests are durable records, not side effects embedded in tool wrappers.

Each request captures:

- requested action
- tool name
- reason code and text
- risk category
- payload preview
- resolution status and note

## Operator Surfaces

The frontend Phase 3 trust surfaces should let an operator answer:

- which prompt version was used?
- which policy decided this?
- why did approval trigger?
- what content was untrusted?
