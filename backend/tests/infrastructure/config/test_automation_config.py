from openforge.services.automation_config import coerce_bool_setting


def test_coerce_bool_setting_truthy_values() -> None:
    assert coerce_bool_setting(True, False) is True
    assert coerce_bool_setting(1, False) is True
    assert coerce_bool_setting("true", False) is True
    assert coerce_bool_setting("enabled", False) is True


def test_coerce_bool_setting_falsey_values() -> None:
    assert coerce_bool_setting(False, True) is False
    assert coerce_bool_setting(0, True) is False
    assert coerce_bool_setting("false", True) is False
    assert coerce_bool_setting("off", True) is False


def test_coerce_bool_setting_falls_back_to_default() -> None:
    assert coerce_bool_setting("unknown", True) is True
    assert coerce_bool_setting(None, False) is False
