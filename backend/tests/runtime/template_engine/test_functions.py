"""Tests for template engine built-in functions and FunctionRegistry."""

from __future__ import annotations

import json
import uuid

import pytest

from openforge.runtime.template_engine.functions import (
    BUILT_IN_FUNCTIONS,
    FunctionRegistry,
)


# ---------------------------------------------------------------------------
# String functions
# ---------------------------------------------------------------------------
class TestStringFunctions:
    def test_upper(self):
        assert BUILT_IN_FUNCTIONS["upper"]("hello") == "HELLO"

    def test_lower(self):
        assert BUILT_IN_FUNCTIONS["lower"]("HELLO") == "hello"

    def test_capitalize(self):
        assert BUILT_IN_FUNCTIONS["capitalize"]("hello world") == "Hello world"

    def test_trim(self):
        assert BUILT_IN_FUNCTIONS["trim"]("  hello  ") == "hello"

    def test_length_string(self):
        assert BUILT_IN_FUNCTIONS["length"]("abc") == 3

    def test_replace(self):
        assert BUILT_IN_FUNCTIONS["replace"]("hello world", "world", "there") == "hello there"

    def test_split(self):
        assert BUILT_IN_FUNCTIONS["split"]("a,b,c", ",") == ["a", "b", "c"]

    def test_substring(self):
        assert BUILT_IN_FUNCTIONS["substring"]("hello world", 0, 5) == "hello"


# ---------------------------------------------------------------------------
# Array functions
# ---------------------------------------------------------------------------
class TestArrayFunctions:
    def test_join(self):
        assert BUILT_IN_FUNCTIONS["join"](["a", "b", "c"], ",") == "a,b,c"

    def test_first(self):
        assert BUILT_IN_FUNCTIONS["first"]([10, 20, 30]) == 10

    def test_last(self):
        assert BUILT_IN_FUNCTIONS["last"]([10, 20, 30]) == 30

    def test_slice(self):
        assert BUILT_IN_FUNCTIONS["slice"]([1, 2, 3, 4, 5], 1, 3) == [2, 3]

    def test_length_list(self):
        assert BUILT_IN_FUNCTIONS["length"]([1, 2, 3]) == 3

    def test_sort(self):
        assert BUILT_IN_FUNCTIONS["sort"]([3, 1, 2]) == [1, 2, 3]

    def test_filter_truthy(self):
        assert BUILT_IN_FUNCTIONS["filter"]([0, 1, "", "a", None, True, False]) == [1, "a", True]

    def test_map_property(self):
        items = [{"name": "Alice"}, {"name": "Bob"}]
        assert BUILT_IN_FUNCTIONS["map"](items, "name") == ["Alice", "Bob"]

    def test_push(self):
        result = BUILT_IN_FUNCTIONS["push"]([1, 2], 3)
        assert result == [1, 2, 3]


# ---------------------------------------------------------------------------
# Object functions
# ---------------------------------------------------------------------------
class TestObjectFunctions:
    def test_keys(self):
        result = BUILT_IN_FUNCTIONS["keys"]({"a": 1, "b": 2})
        assert sorted(result) == ["a", "b"]

    def test_values(self):
        result = BUILT_IN_FUNCTIONS["values"]({"a": 1, "b": 2})
        assert sorted(result) == [1, 2]

    def test_entries(self):
        result = BUILT_IN_FUNCTIONS["entries"]({"a": 1})
        assert result == [["a", 1]]

    def test_get_nested_dot_path(self):
        data = {"a": {"b": {"c": 42}}}
        assert BUILT_IN_FUNCTIONS["get"](data, "a.b.c") == 42

    def test_get_with_default(self):
        data = {"a": 1}
        assert BUILT_IN_FUNCTIONS["get"](data, "x.y", "fallback") == "fallback"


# ---------------------------------------------------------------------------
# Math functions
# ---------------------------------------------------------------------------
class TestMathFunctions:
    def test_add(self):
        assert BUILT_IN_FUNCTIONS["add"](2, 3) == 5

    def test_subtract(self):
        assert BUILT_IN_FUNCTIONS["subtract"](10, 4) == 6

    def test_multiply(self):
        assert BUILT_IN_FUNCTIONS["multiply"](3, 4) == 12

    def test_divide(self):
        assert BUILT_IN_FUNCTIONS["divide"](10, 2) == 5.0

    def test_divide_by_zero(self):
        assert BUILT_IN_FUNCTIONS["divide"](10, 0) == 0

    def test_round(self):
        assert BUILT_IN_FUNCTIONS["round"](3.14159, 2) == 3.14

    def test_min(self):
        assert BUILT_IN_FUNCTIONS["min"]([5, 2, 8, 1]) == 1

    def test_max(self):
        assert BUILT_IN_FUNCTIONS["max"]([5, 2, 8, 1]) == 8

    def test_abs(self):
        assert BUILT_IN_FUNCTIONS["abs"](-42) == 42


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------
class TestUtilityFunctions:
    def test_default_with_value(self):
        assert BUILT_IN_FUNCTIONS["default"]("hello", "fallback") == "hello"

    def test_default_none_returns_fallback(self):
        assert BUILT_IN_FUNCTIONS["default"](None, "fallback") == "fallback"

    def test_default_empty_string_returns_fallback(self):
        assert BUILT_IN_FUNCTIONS["default"]("", "fallback") == "fallback"

    def test_json(self):
        result = BUILT_IN_FUNCTIONS["json"]({"a": 1})
        assert json.loads(result) == {"a": 1}

    def test_parse(self):
        result = BUILT_IN_FUNCTIONS["parse"]('{"a": 1}')
        assert result == {"a": 1}

    def test_uuid_format(self):
        result = BUILT_IN_FUNCTIONS["uuid"]()
        # Validate it's a proper UUID v4 string
        parsed = uuid.UUID(result)
        assert str(parsed) == result


# ---------------------------------------------------------------------------
# Conditional functions
# ---------------------------------------------------------------------------
class TestConditionalFunctions:
    def test_if_true(self):
        assert BUILT_IN_FUNCTIONS["if"](True, "yes", "no") == "yes"

    def test_if_false(self):
        assert BUILT_IN_FUNCTIONS["if"](False, "yes", "no") == "no"

    def test_unless_true(self):
        assert BUILT_IN_FUNCTIONS["unless"](True, "yes", "no") == "no"

    def test_unless_false(self):
        assert BUILT_IN_FUNCTIONS["unless"](False, "yes", "no") == "yes"


# ---------------------------------------------------------------------------
# Type-checking functions
# ---------------------------------------------------------------------------
class TestTypeCheckFunctions:
    def test_isString(self):
        assert BUILT_IN_FUNCTIONS["isString"]("hello") is True
        assert BUILT_IN_FUNCTIONS["isString"](123) is False

    def test_isNumber(self):
        assert BUILT_IN_FUNCTIONS["isNumber"](42) is True
        assert BUILT_IN_FUNCTIONS["isNumber"](3.14) is True
        assert BUILT_IN_FUNCTIONS["isNumber"]("42") is False

    def test_isBoolean_true_is_true(self):
        assert BUILT_IN_FUNCTIONS["isBoolean"](True) is True

    def test_isBoolean_1_is_false(self):
        assert BUILT_IN_FUNCTIONS["isBoolean"](1) is False

    def test_isArray(self):
        assert BUILT_IN_FUNCTIONS["isArray"]([1, 2]) is True
        assert BUILT_IN_FUNCTIONS["isArray"]("nope") is False

    def test_isObject(self):
        assert BUILT_IN_FUNCTIONS["isObject"]({"a": 1}) is True

    def test_isObject_list_is_false(self):
        assert BUILT_IN_FUNCTIONS["isObject"]([1]) is False

    def test_isEmpty_various(self):
        assert BUILT_IN_FUNCTIONS["isEmpty"](None) is True
        assert BUILT_IN_FUNCTIONS["isEmpty"]("") is True
        assert BUILT_IN_FUNCTIONS["isEmpty"]([]) is True
        assert BUILT_IN_FUNCTIONS["isEmpty"]({}) is True
        assert BUILT_IN_FUNCTIONS["isEmpty"]("hello") is False
        assert BUILT_IN_FUNCTIONS["isEmpty"]([1]) is False
        assert BUILT_IN_FUNCTIONS["isEmpty"]({"a": 1}) is False


# ---------------------------------------------------------------------------
# FunctionRegistry
# ---------------------------------------------------------------------------
class TestFunctionRegistry:
    def test_get_existing(self):
        registry = FunctionRegistry()
        fn = registry.get("upper")
        assert fn is not None
        assert fn("hello") == "HELLO"

    def test_get_missing_returns_none(self):
        registry = FunctionRegistry()
        assert registry.get("nonexistent_xyz") is None

    def test_register_custom(self):
        registry = FunctionRegistry()
        registry.register("double", lambda x: x * 2)
        fn = registry.get("double")
        assert fn is not None
        assert fn(5) == 10

    def test_catalog_non_empty_with_required_keys(self):
        registry = FunctionRegistry()
        catalog = registry.catalog()
        assert len(catalog) > 0
        required_keys = {"name", "category", "signature", "description", "example"}
        for entry in catalog:
            assert required_keys.issubset(entry.keys()), f"Missing keys in {entry}"
