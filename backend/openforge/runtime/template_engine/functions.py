"""Built-in template functions and FunctionRegistry for the template engine."""

from __future__ import annotations

import json as _json
import math as _math
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any, Callable


# ---------------------------------------------------------------------------
# String functions
# ---------------------------------------------------------------------------

def fn_upper(value: Any) -> str:
    """Convert string to uppercase."""
    return str(value).upper()


def fn_lower(value: Any) -> str:
    """Convert string to lowercase."""
    return str(value).lower()


def fn_capitalize(value: Any) -> str:
    """Capitalize the first character."""
    return str(value).capitalize()


def fn_trim(value: Any) -> str:
    """Strip leading and trailing whitespace."""
    return str(value).strip()


def fn_length(value: Any) -> int:
    """Return length of a string, list, or dict."""
    if value is None:
        return 0
    if isinstance(value, (str, list, dict)):
        return len(value)
    return len(str(value))


def fn_replace(value: Any, old: str, new: str) -> str:
    """Replace occurrences of *old* with *new* in a string."""
    return str(value).replace(str(old), str(new))


def fn_split(value: Any, delimiter: str = ",") -> list[str]:
    """Split a string by *delimiter*."""
    return str(value).split(str(delimiter))


def fn_substring(value: Any, start: int, end: int | None = None) -> str:
    """Return a substring from *start* to *end*."""
    s = str(value)
    if end is None:
        return s[int(start):]
    return s[int(start):int(end)]


# ---------------------------------------------------------------------------
# Array functions
# ---------------------------------------------------------------------------

def fn_join(value: Any, separator: str = ",") -> str:
    """Join list items with *separator*."""
    if not isinstance(value, list):
        return str(value)
    return str(separator).join(str(item) for item in value)


def fn_first(value: Any) -> Any:
    """Return the first element of a list."""
    if isinstance(value, list) and len(value) > 0:
        return value[0]
    return None


def fn_last(value: Any) -> Any:
    """Return the last element of a list."""
    if isinstance(value, list) and len(value) > 0:
        return value[-1]
    return None


def fn_slice(value: Any, start: int, end: int | None = None) -> list:
    """Return a slice of a list."""
    if not isinstance(value, list):
        return []
    if end is None:
        return value[int(start):]
    return value[int(start):int(end)]


def fn_push(value: Any, item: Any) -> list:
    """Return a new list with *item* appended."""
    if not isinstance(value, list):
        return [item]
    return value + [item]


def fn_filter(value: Any) -> list:
    """Remove falsy values from a list."""
    if not isinstance(value, list):
        return []
    return [item for item in value if item]


def fn_map(value: Any, prop: str) -> list:
    """Extract *prop* from each dict in a list."""
    if not isinstance(value, list):
        return []
    return [item.get(prop) if isinstance(item, dict) else None for item in value]


def fn_sort(value: Any) -> list:
    """Return a sorted copy of a list."""
    if not isinstance(value, list):
        return []
    return sorted(value)


def fn_contains(collection: Any, item: Any) -> bool:
    """Check if *collection* contains *item*.

    - For strings: checks if *item* is a substring.
    - For lists of primitives: checks membership directly.
    - For lists of dicts: checks if any dict has a matching ``id`` or ``name`` field.
    """
    if isinstance(collection, str):
        return str(item) in collection
    if isinstance(collection, list):
        if item in collection:
            return True
        item_str = str(item)
        for entry in collection:
            if isinstance(entry, dict):
                if entry.get("id") == item_str or entry.get("name") == item_str:
                    return True
            elif str(entry) == item_str:
                return True
        return False
    return False


# ---------------------------------------------------------------------------
# Object functions
# ---------------------------------------------------------------------------

def fn_keys(value: Any) -> list:
    """Return keys of a dict."""
    if isinstance(value, dict):
        return list(value.keys())
    return []


def fn_values(value: Any) -> list:
    """Return values of a dict."""
    if isinstance(value, dict):
        return list(value.values())
    return []


def fn_entries(value: Any) -> list[list]:
    """Return [[key, value], ...] pairs."""
    if isinstance(value, dict):
        return [[k, v] for k, v in value.items()]
    return []


def fn_get(value: Any, path: str, default: Any = None) -> Any:
    """Access a nested value via dot-separated *path* with optional *default*."""
    if not isinstance(value, dict):
        return default
    parts = str(path).split(".")
    current: Any = value
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return default
    return current


# ---------------------------------------------------------------------------
# Math functions
# ---------------------------------------------------------------------------

def fn_add(a: Any, b: Any) -> Any:
    """Add two numbers."""
    return a + b


def fn_subtract(a: Any, b: Any) -> Any:
    """Subtract *b* from *a*."""
    return a - b


def fn_multiply(a: Any, b: Any) -> Any:
    """Multiply two numbers."""
    return a * b


def fn_divide(a: Any, b: Any) -> Any:
    """Divide *a* by *b*; returns 0 on ZeroDivisionError."""
    try:
        return a / b
    except ZeroDivisionError:
        return 0


def fn_round(value: Any, digits: int = 0) -> float:
    """Round a number to *digits* decimal places."""
    return round(float(value), int(digits))


def fn_min(value: Any) -> Any:
    """Return the minimum value from a list."""
    if isinstance(value, list) and len(value) > 0:
        return min(value)
    return None


def fn_max(value: Any) -> Any:
    """Return the maximum value from a list."""
    if isinstance(value, list) and len(value) > 0:
        return max(value)
    return None


def fn_abs(value: Any) -> Any:
    """Return the absolute value."""
    return abs(value)


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def fn_default(value: Any, fallback: Any = None) -> Any:
    """Return *fallback* if value is None or empty string."""
    if value is None or value == "":
        return fallback
    return value


def fn_json(value: Any) -> str:
    """Serialize value to a JSON string."""
    return _json.dumps(value)


def fn_parse(value: Any) -> Any:
    """Parse a JSON string."""
    return _json.loads(str(value))


def fn_date(value: Any = None) -> str:
    """Return current UTC datetime in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def fn_timestamp(value: Any = None) -> int:
    """Return current UTC timestamp as a Unix integer."""
    return int(datetime.now(timezone.utc).timestamp())


def fn_uuid(*_args: Any) -> str:
    """Generate a UUID4 string."""
    return str(_uuid.uuid4())


# ---------------------------------------------------------------------------
# Conditional functions
# ---------------------------------------------------------------------------

def fn_if(condition: Any, true_val: Any, false_val: Any) -> Any:
    """Return *true_val* if condition is truthy, else *false_val*."""
    return true_val if condition else false_val


def fn_unless(condition: Any, true_val: Any, false_val: Any) -> Any:
    """Inverse of if: return *true_val* when condition is falsy."""
    return true_val if not condition else false_val


# ---------------------------------------------------------------------------
# Type-checking functions
# ---------------------------------------------------------------------------

def fn_isString(value: Any) -> bool:
    """Check if value is a string."""
    return isinstance(value, str)


def fn_isNumber(value: Any) -> bool:
    """Check if value is a number (int or float, but not bool)."""
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float))


def fn_isBoolean(value: Any) -> bool:
    """Check if value is a boolean."""
    return isinstance(value, bool)


def fn_isArray(value: Any) -> bool:
    """Check if value is a list."""
    return isinstance(value, list)


def fn_isObject(value: Any) -> bool:
    """Check if value is a dict."""
    return isinstance(value, dict)


def fn_isEmpty(value: Any) -> bool:
    """Check if value is None, empty string, empty list, or empty dict."""
    if value is None:
        return True
    if isinstance(value, (str, list, dict)) and len(value) == 0:
        return True
    return False


# ---------------------------------------------------------------------------
# BUILT_IN_FUNCTIONS registry
# ---------------------------------------------------------------------------

BUILT_IN_FUNCTIONS: dict[str, Callable] = {
    # String
    "upper": fn_upper,
    "lower": fn_lower,
    "capitalize": fn_capitalize,
    "trim": fn_trim,
    "length": fn_length,
    "replace": fn_replace,
    "split": fn_split,
    "substring": fn_substring,
    # Array
    "join": fn_join,
    "first": fn_first,
    "last": fn_last,
    "slice": fn_slice,
    "push": fn_push,
    "filter": fn_filter,
    "map": fn_map,
    "sort": fn_sort,
    "contains": fn_contains,
    # Object
    "keys": fn_keys,
    "values": fn_values,
    "entries": fn_entries,
    "get": fn_get,
    # Math
    "add": fn_add,
    "subtract": fn_subtract,
    "multiply": fn_multiply,
    "divide": fn_divide,
    "round": fn_round,
    "min": fn_min,
    "max": fn_max,
    "abs": fn_abs,
    # Utility
    "default": fn_default,
    "json": fn_json,
    "parse": fn_parse,
    "date": fn_date,
    "timestamp": fn_timestamp,
    "uuid": fn_uuid,
    # Conditional
    "if": fn_if,
    "unless": fn_unless,
    # Type checking
    "isString": fn_isString,
    "isNumber": fn_isNumber,
    "isBoolean": fn_isBoolean,
    "isArray": fn_isArray,
    "isObject": fn_isObject,
    "isEmpty": fn_isEmpty,
}


# ---------------------------------------------------------------------------
# Function metadata
# ---------------------------------------------------------------------------

_FUNCTION_METADATA: list[dict[str, str]] = [
    # String
    {"name": "upper", "category": "string", "signature": "upper(value)", "description": "Convert string to uppercase", "example": 'upper("hello") -> "HELLO"'},
    {"name": "lower", "category": "string", "signature": "lower(value)", "description": "Convert string to lowercase", "example": 'lower("HELLO") -> "hello"'},
    {"name": "capitalize", "category": "string", "signature": "capitalize(value)", "description": "Capitalize the first character", "example": 'capitalize("hello") -> "Hello"'},
    {"name": "trim", "category": "string", "signature": "trim(value)", "description": "Strip leading and trailing whitespace", "example": 'trim("  hi  ") -> "hi"'},
    {"name": "length", "category": "string", "signature": "length(value)", "description": "Return the length of a string, list, or dict", "example": 'length("abc") -> 3'},
    {"name": "replace", "category": "string", "signature": "replace(value, old, new)", "description": "Replace occurrences of old with new", "example": 'replace("hi world", "world", "there") -> "hi there"'},
    {"name": "split", "category": "string", "signature": "split(value, delimiter)", "description": "Split string by delimiter", "example": 'split("a,b,c", ",") -> ["a","b","c"]'},
    {"name": "substring", "category": "string", "signature": "substring(value, start, end?)", "description": "Extract a substring", "example": 'substring("hello", 0, 3) -> "hel"'},
    # Array
    {"name": "join", "category": "array", "signature": "join(array, separator)", "description": "Join list items with separator", "example": 'join(["a","b"], ",") -> "a,b"'},
    {"name": "first", "category": "array", "signature": "first(array)", "description": "Return the first element", "example": "first([1,2,3]) -> 1"},
    {"name": "last", "category": "array", "signature": "last(array)", "description": "Return the last element", "example": "last([1,2,3]) -> 3"},
    {"name": "slice", "category": "array", "signature": "slice(array, start, end?)", "description": "Return a slice of the list", "example": "slice([1,2,3,4], 1, 3) -> [2,3]"},
    {"name": "push", "category": "array", "signature": "push(array, item)", "description": "Return new list with item appended", "example": "push([1,2], 3) -> [1,2,3]"},
    {"name": "filter", "category": "array", "signature": "filter(array)", "description": "Remove falsy values from a list", "example": 'filter([0, 1, "", "a"]) -> [1, "a"]'},
    {"name": "map", "category": "array", "signature": "map(array, property)", "description": "Extract a property from each dict in a list", "example": 'map([{"n":"A"},{"n":"B"}], "n") -> ["A","B"]'},
    {"name": "sort", "category": "array", "signature": "sort(array)", "description": "Return a sorted copy of the list", "example": "sort([3,1,2]) -> [1,2,3]"},
    {"name": "contains", "category": "array", "signature": "contains(collection, item)", "description": "Check if a list contains an item (searches id/name fields for dicts) or a string contains a substring", "example": 'contains(["a","b"], "a") -> true'},
    # Object
    {"name": "keys", "category": "object", "signature": "keys(obj)", "description": "Return the keys of a dict", "example": 'keys({"a":1,"b":2}) -> ["a","b"]'},
    {"name": "values", "category": "object", "signature": "values(obj)", "description": "Return the values of a dict", "example": 'values({"a":1,"b":2}) -> [1,2]'},
    {"name": "entries", "category": "object", "signature": "entries(obj)", "description": "Return [[key,value],...] pairs", "example": 'entries({"a":1}) -> [["a",1]]'},
    {"name": "get", "category": "object", "signature": "get(obj, path, default?)", "description": "Access nested value via dot-path with optional default", "example": 'get({"a":{"b":1}}, "a.b") -> 1'},
    # Math
    {"name": "add", "category": "math", "signature": "add(a, b)", "description": "Add two numbers", "example": "add(2, 3) -> 5"},
    {"name": "subtract", "category": "math", "signature": "subtract(a, b)", "description": "Subtract b from a", "example": "subtract(10, 4) -> 6"},
    {"name": "multiply", "category": "math", "signature": "multiply(a, b)", "description": "Multiply two numbers", "example": "multiply(3, 4) -> 12"},
    {"name": "divide", "category": "math", "signature": "divide(a, b)", "description": "Divide a by b; returns 0 on division by zero", "example": "divide(10, 2) -> 5.0"},
    {"name": "round", "category": "math", "signature": "round(value, digits?)", "description": "Round a number to given decimal places", "example": "round(3.14159, 2) -> 3.14"},
    {"name": "min", "category": "math", "signature": "min(array)", "description": "Return the minimum value from a list", "example": "min([5,2,8]) -> 2"},
    {"name": "max", "category": "math", "signature": "max(array)", "description": "Return the maximum value from a list", "example": "max([5,2,8]) -> 8"},
    {"name": "abs", "category": "math", "signature": "abs(value)", "description": "Return the absolute value", "example": "abs(-42) -> 42"},
    # Utility
    {"name": "default", "category": "utility", "signature": "default(value, fallback)", "description": "Return fallback if value is None or empty string", "example": 'default(None, "hi") -> "hi"'},
    {"name": "json", "category": "utility", "signature": "json(value)", "description": "Serialize value to JSON string", "example": 'json({"a":1}) -> \'{"a": 1}\''},
    {"name": "parse", "category": "utility", "signature": "parse(value)", "description": "Parse a JSON string", "example": 'parse(\'{"a":1}\') -> {"a":1}'},
    {"name": "date", "category": "utility", "signature": "date()", "description": "Return current UTC datetime in ISO 8601 format", "example": 'date() -> "2024-01-15T12:00:00+00:00"'},
    {"name": "timestamp", "category": "utility", "signature": "timestamp()", "description": "Return current UTC timestamp as Unix integer", "example": "timestamp() -> 1705320000"},
    {"name": "uuid", "category": "utility", "signature": "uuid()", "description": "Generate a UUID4 string", "example": 'uuid() -> "a1b2c3d4-..."'},
    # Conditional
    {"name": "if", "category": "conditional", "signature": "if(condition, trueVal, falseVal)", "description": "Return trueVal if condition is truthy, else falseVal", "example": 'if(true, "yes", "no") -> "yes"'},
    {"name": "unless", "category": "conditional", "signature": "unless(condition, trueVal, falseVal)", "description": "Return trueVal if condition is falsy, else falseVal", "example": 'unless(true, "yes", "no") -> "no"'},
    # Type checking
    {"name": "isString", "category": "type", "signature": "isString(value)", "description": "Check if value is a string", "example": 'isString("hi") -> true'},
    {"name": "isNumber", "category": "type", "signature": "isNumber(value)", "description": "Check if value is a number (not bool)", "example": "isNumber(42) -> true"},
    {"name": "isBoolean", "category": "type", "signature": "isBoolean(value)", "description": "Check if value is a boolean", "example": "isBoolean(true) -> true"},
    {"name": "isArray", "category": "type", "signature": "isArray(value)", "description": "Check if value is a list", "example": "isArray([1,2]) -> true"},
    {"name": "isObject", "category": "type", "signature": "isObject(value)", "description": "Check if value is a dict", "example": 'isObject({"a":1}) -> true'},
    {"name": "isEmpty", "category": "type", "signature": "isEmpty(value)", "description": "Check if value is None, empty string, empty list, or empty dict", "example": "isEmpty(None) -> true"},
]


# ---------------------------------------------------------------------------
# FunctionRegistry
# ---------------------------------------------------------------------------

class FunctionRegistry:
    """Registry that holds built-in and custom template functions."""

    def __init__(self) -> None:
        self._functions: dict[str, Callable] = dict(BUILT_IN_FUNCTIONS)
        self._metadata: list[dict[str, str]] = list(_FUNCTION_METADATA)

    def get(self, name: str) -> Callable | None:
        """Retrieve a function by name, or None if not found."""
        return self._functions.get(name)

    def register(
        self,
        name: str,
        fn: Callable,
        metadata: dict[str, str] | None = None,
    ) -> None:
        """Register a custom function with optional metadata."""
        self._functions[name] = fn
        if metadata is not None:
            self._metadata.append(metadata)

    def catalog(self) -> list[dict[str, str]]:
        """Return metadata list for all registered functions."""
        return list(self._metadata)
