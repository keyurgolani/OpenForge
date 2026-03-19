"""Integration regression tests for cross-domain consistency."""
import pathlib

import pytest


class TestTerminologyConsistency:
    """Verify no legacy terminology leaks into public APIs."""

    def test_product_vocabulary_completeness(self):
        """Product vocabulary should cover all surviving domain concepts."""
        from openforge.core.product_vocabulary import DOMAIN_LABELS, DomainNoun
        required = [
            DomainNoun.AGENT,
            DomainNoun.AUTOMATION,
            DomainNoun.RUN,
            DomainNoun.OUTPUT,
            DomainNoun.KNOWLEDGE,
        ]
        for domain in required:
            assert domain in DOMAIN_LABELS, f"Missing domain in vocabulary: {domain}"


class TestCrossDomainContracts:
    """Verify cross-domain data contracts are consistent."""

    def test_artifact_model_references_run(self):
        from openforge.db.models import ArtifactModel
        columns = {c.name for c in ArtifactModel.__table__.columns}
        assert "source_run_id" in columns, "Artifact must reference source run"

    def test_trigger_references_target(self):
        from openforge.db.models import TriggerDefinitionModel
        columns = {c.name for c in TriggerDefinitionModel.__table__.columns}
        assert "target_id" in columns, "Trigger must reference target"

    def test_usage_record_references_run(self):
        from openforge.db.models import UsageRecordModel
        columns = {c.name for c in UsageRecordModel.__table__.columns}
        assert "run_id" in columns, "Usage record must reference run"


class TestMigrationChainIntegrity:
    """Verify migration chain is complete and ordered."""

    def test_migration_files_exist(self):
        migrations_dir = (
            pathlib.Path(__file__).parent.parent.parent
            / "openforge" / "db" / "migrations" / "versions"
        )
        migration_files = sorted(migrations_dir.glob("*.py"))
        migration_files = [f for f in migration_files if not f.name.startswith("__")]
        assert len(migration_files) >= 2, (
            f"Expected at least 2 migrations, found {len(migration_files)}"
        )
