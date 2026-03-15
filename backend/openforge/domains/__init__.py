"""
OpenForge domain package exports.

Keep the package import light-weight so importing one domain submodule does not
eagerly import every router and schema in the tree.
"""


def register_domain_routers(app):
    from openforge.domains.router_registry import register_domain_routers as _register_domain_routers

    return _register_domain_routers(app)


__all__ = ["register_domain_routers"]
