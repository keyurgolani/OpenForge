"""
Legacy Module

This package contains legacy modules from the old agent-centric architecture.
These modules are kept for transitional compatibility but should not be extended.

For new development, use the domain packages in openforge.domains.*

Legacy modules:
- agent_definition: Use openforge.domains.profiles instead
- agent_registry: Being replaced by domain services
- agent_schedules_api: Use openforge.domains.triggers instead
- targets_api: Use openforge.domains.artifacts instead
- target_service: Use openforge.domains.artifacts instead

Migration path:
- Phase 1: Legacy modules marked, new domains created
- Phase 2: Legacy modules moved to this package, re-exports with deprecation warnings
- Phase 3+: Gradual removal as domains are fully implemented
"""

# LEGACY MODULE
# Scheduled for deletion.
# Do not import into non-legacy modules.
