"""Test that local_setup is a valid onboarding step."""
import unittest


class TestOnboardingSteps(unittest.TestCase):
    def test_local_setup_in_step_order(self):
        from openforge.common.config.onboarding import _STEP_ORDER
        assert "local_setup" in _STEP_ORDER

    def test_local_setup_between_providers_and_workspace(self):
        from openforge.common.config.onboarding import _STEP_ORDER
        steps = list(_STEP_ORDER)
        assert steps.index("local_setup") == steps.index("providers_setup") + 1
        assert steps.index("local_setup") == steps.index("workspace_create") - 1

    def test_transitions_allow_local_setup(self):
        from openforge.common.config.onboarding import _VALID_TRANSITIONS
        assert "local_setup" in _VALID_TRANSITIONS["providers_setup"]
        assert "workspace_create" in _VALID_TRANSITIONS["local_setup"]
        assert "providers_setup" in _VALID_TRANSITIONS["local_setup"]
