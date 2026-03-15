# Phase 6 Model Configuration Audit

## Current Model Configuration Surfaces

The model configuration IA is split across these routes:

- `/settings/models/providers`
- `/settings/models/reasoning`
- `/settings/models/vision`
- `/settings/models/embedding`
- `/settings/models/audio`
- `/settings/models/clip`
- `/settings/models/pdf`

## Audit Notes

- Provider credentials and provider discovery belong under `providers`.
- Runtime model choice belongs under the specialized assignment subsections, not inside workspace content pages.
- Profile detail pages may show the resolved model policy, but editing model infrastructure remains a settings concern.

## Current Alignment

This matches the Phase 6 rule that configuration should be clearly separated from content and execution surfaces.
