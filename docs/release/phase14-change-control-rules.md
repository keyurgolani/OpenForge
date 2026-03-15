# Phase 14 Change Control Rules

Guidelines for what changes are permitted late in Phase 14 stabilization.

## Allowed Changes (merge without extra ceremony)

- Bug fixes for issues found during testing or review
- Copy and label fixes (typos, unclear wording, UI text corrections)
- Test additions and improvements (new test cases, better assertions, flaky test fixes)
- Logging improvements (adding missing log lines, adjusting log levels)
- Documentation updates for existing features
- Removal of dead code or unused imports

## Requires Extra Review (two reviewers, explicit sign-off)

- Any change to runtime behavior (agent execution, workflow orchestration, tool dispatch)
- Database migration changes (new migrations, migration fixes, schema alterations)
- Policy default changes (tool policies, safety settings, visibility defaults)
- Changes to authentication or authorization logic
- Changes to the evaluation harness that affect metric collection
- Dependency version bumps (even patch versions)

## Must Be Deferred Post-Release

- New features or capabilities not already in the Phase 14 plan
- Major refactors (restructuring modules, renaming core abstractions)
- New domain concepts (new model types, new service layers, new API resources)
- Experimental or exploratory changes
- Performance optimizations that change observable behavior
- New third-party integrations

## Contributor and Reviewer Rules

- Bias toward simplification: if a change can be made simpler, make it simpler
- Bias toward removing risk: prefer removing code over adding code when possible
- Avoid churn: do not refactor code that is working and tested just for style
- Every change must have a clear reason tied to a known issue or gap
- Reviewers should reject changes that increase surface area without clear justification

## Mandatory Smoke Test Requirements

- [ ] All existing tests pass (`pytest` green) before merge
- [ ] Docker Compose stack starts cleanly (`docker compose up` with no errors)
- [ ] Core API health check returns 200
- [ ] Chat send/receive round-trip works end-to-end
- [ ] At least one workspace CRUD cycle completes without error
- [ ] Trigger scheduler starts and logs its poll interval
- [ ] Evaluation harness can create and list runs without error
