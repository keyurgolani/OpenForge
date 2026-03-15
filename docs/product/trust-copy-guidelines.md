# Trust Copy Guidelines

Phase 3 trust messaging should be explicit, brief, and attributable.

## Approval Requests

Every approval surface should answer:

- what action is being requested
- which tool or system requested it
- why approval is required
- what could change if it runs
- whether the action looks reversible

Preferred wording:

- `Approval required for shell.execute`
- `This action can change local files and is configured to require operator review.`

Avoid:

- vague warnings like `High risk action`
- unexplained urgency
- hidden jargon without the requested action name

## Blocked Actions

Blocked actions should say:

- action attempted
- reason blocked
- whether a policy change is needed

Preferred wording:

- `shell.execute was blocked by the active tool policy.`
- `The current policy denies this tool for the selected scope.`

Avoid:

- `Not allowed`
- `Permission error`

## Untrusted Content

When operator/debug surfaces show untrusted context, use language like:

- `External content wrapped as untrusted input`
- `Retrieved knowledge inserted as data, not instructions`

Avoid:

- implying the content was verified when it was only retrieved

## Policy Simulation

Simulation output should always include:

- final decision
- matched scope
- matched policy when available
- reason text

Preferred labels:

- `Decision`
- `Matched policy`
- `Matched scope`
- `Reason`

## Tone

- factual
- non-alarmist
- specific
- never anthropomorphic
