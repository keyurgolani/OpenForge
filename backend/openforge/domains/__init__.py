"""
OpenForge Domain Packages

This package contains the core domain modules for OpenForge, organized by
the canonical product vocabulary:

- profiles: Agent Profiles - worker abstractions defining capabilities
- workflows: Workflow Definitions - composable execution graphs
- missions: Mission Definitions - packaged autonomous units
- triggers: Trigger Definitions - automation rules
- runs: Runs - execution instances
- artifacts: Artifacts - outputs produced by mission runs
- knowledge: Knowledge - user-provided context and data
- common: Shared domain types, enums, and base models
"""

from openforge.domains.router_registry import register_domain_routers

__all__ = ["register_domain_routers"]
