"""Tests for failure taxonomy classification."""

from openforge.observability.failure_taxonomy import (
    FAILURE_TAXONOMY,
    classify_failure,
    classify_error_code,
    FailureSeverity,
    Retryability,
    StructuredError,
)


class TestFailureTaxonomy:
    def test_all_classes_have_required_fields(self):
        for name, cls in FAILURE_TAXONOMY.items():
            assert cls.failure_class == name
            assert cls.error_code
            assert isinstance(cls.severity, FailureSeverity)
            assert isinstance(cls.retryability, Retryability)
            assert cls.description

    def test_classify_known_failure(self):
        result = classify_failure("model_timeout")
        assert result.failure_class == "model_timeout"
        assert result.error_code == "MODEL_TIMEOUT"
        assert result.severity == FailureSeverity.ERROR
        assert result.retryability == Retryability.RETRYABLE

    def test_classify_unknown_failure(self):
        result = classify_failure("something_unexpected")
        assert result.failure_class == "something_unexpected"
        assert "UNKNOWN" in result.error_code
        assert result.severity == FailureSeverity.ERROR

    def test_classify_error_code_mapping(self):
        result = classify_error_code("llm_timeout")
        assert result is not None
        assert result.failure_class == "model_timeout"

    def test_classify_error_code_unknown(self):
        result = classify_error_code("nonexistent_code")
        assert result is None

    def test_structured_error_from_classification(self):
        cls = classify_failure("tool_invocation_failure")
        err = StructuredError.from_classification(
            cls,
            "Tool foo failed with 500",
            affected_node_key="run_tool_foo",
        )
        assert err.error_code == "TOOL_INVOCATION_FAILED"
        assert err.failure_class == "tool_invocation_failure"
        assert err.affected_node_key == "run_tool_foo"
        assert err.severity == "error"
        assert err.retryability == "retryable"


class TestRetryability:
    def test_retryable_failures(self):
        retryable = [k for k, v in FAILURE_TAXONOMY.items() if v.retryability == Retryability.RETRYABLE]
        assert "model_invocation_failure" in retryable
        assert "tool_invocation_failure" in retryable
        assert "retrieval_failure" in retryable

    def test_non_retryable_failures(self):
        non_retryable = [k for k, v in FAILURE_TAXONOMY.items() if v.retryability == Retryability.NOT_RETRYABLE]
        assert "policy_denial" in non_retryable
        assert "workflow_schema_failure" in non_retryable
        assert "unknown_executor" in non_retryable
