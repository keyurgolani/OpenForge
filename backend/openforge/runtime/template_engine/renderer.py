"""Template renderer — processes templates with variable substitution, conditionals, loops, and function calls."""

from __future__ import annotations

import re
from typing import Any

from openforge.runtime.template_engine.functions import BUILT_IN_FUNCTIONS
from openforge.runtime.template_engine.types import TemplateRenderResult

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_COMMENT_RE = re.compile(r"\{#[\s\S]*?#\}")
_VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w.-]*)((?:::?[^\}]*)?)\s*\}\}")
_FUNCTION_RE = re.compile(r"\{\{\s*([a-zA-Z_]\w*)\s*\(([\s\S]*?)\)\s*\}\}")
_FOR_RE = re.compile(
    r"\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}"
)

_MAX_ITERATIONS = 50


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_variable(path: str, context: dict[str, Any]) -> Any:
    """Resolve a dot-separated variable path against *context*.

    Returns ``None`` when any segment is missing.
    """
    parts = path.split(".")
    current: Any = context
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _parse_function_args(
    args_str: str,
    context: dict[str, Any],
    functions_used: set[str],
    warnings: list[str],
) -> list[Any]:
    """Parse a comma-separated argument string, resolving literals and references."""
    args: list[Any] = []
    if not args_str.strip():
        return args

    # Split on commas, but respect parentheses and quotes
    tokens: list[str] = []
    depth = 0
    current = ""
    in_quote: str | None = None
    for ch in args_str:
        if in_quote:
            current += ch
            if ch == in_quote:
                in_quote = None
        elif ch in ('"', "'"):
            in_quote = ch
            current += ch
        elif ch == "(":
            depth += 1
            current += ch
        elif ch == ")":
            depth -= 1
            current += ch
        elif ch == "," and depth == 0:
            tokens.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        tokens.append(current.strip())

    for token in tokens:
        args.append(_resolve_token(token, context, functions_used, warnings))
    return args


def _resolve_token(
    token: str,
    context: dict[str, Any],
    functions_used: set[str],
    warnings: list[str],
) -> Any:
    """Resolve a single token to its value."""
    # String literal (double or single quoted)
    if (token.startswith('"') and token.endswith('"')) or (
        token.startswith("'") and token.endswith("'")
    ):
        return token[1:-1]

    # Boolean literals
    if token.lower() == "true":
        return True
    if token.lower() == "false":
        return False

    # None literal
    if token.lower() == "none":
        return None

    # Number literal
    try:
        if "." in token:
            return float(token)
        return int(token)
    except ValueError:
        pass

    # Nested function call: name(args)
    nested_match = re.match(r"([a-zA-Z_]\w*)\s*\(([\s\S]*)\)$", token)
    if nested_match:
        func_name = nested_match.group(1)
        inner_args_str = nested_match.group(2)
        if func_name in BUILT_IN_FUNCTIONS:
            functions_used.add(func_name)
            inner_args = _parse_function_args(
                inner_args_str, context, functions_used, warnings
            )
            try:
                return BUILT_IN_FUNCTIONS[func_name](*inner_args)
            except Exception as exc:
                warnings.append(f"Function '{func_name}' error: {exc}")
                return ""

    # Variable reference
    val = _get_variable(token, context)
    return val if val is not None else token


def _evaluate_condition(condition: str, context: dict[str, Any]) -> bool:
    """Evaluate a simple condition string against *context*.

    Supports comparison operators (==, !=, >, <, >=, <=) with quoted strings
    or variable references, plus simple truthiness checks.
    """
    condition = condition.strip()

    # Try comparison operators (ordered so >= is matched before >)
    for op in ("==", "!=", ">=", "<=", ">", "<"):
        if op in condition:
            parts = condition.split(op, 1)
            if len(parts) == 2:
                left = _resolve_condition_value(parts[0].strip(), context)
                right = _resolve_condition_value(parts[1].strip(), context)
                if op == "==":
                    return left == right
                if op == "!=":
                    return left != right
                try:
                    if op == ">":
                        return left > right  # type: ignore[operator]
                    if op == "<":
                        return left < right  # type: ignore[operator]
                    if op == ">=":
                        return left >= right  # type: ignore[operator]
                    if op == "<=":
                        return left <= right  # type: ignore[operator]
                except TypeError:
                    return False

    # Simple truthiness check
    val = _get_variable(condition, context)
    return bool(val)


def _resolve_condition_value(token: str, context: dict[str, Any]) -> Any:
    """Resolve a token within a condition to its value."""
    # Quoted string
    if (token.startswith('"') and token.endswith('"')) or (
        token.startswith("'") and token.endswith("'")
    ):
        return token[1:-1]

    # Boolean
    if token.lower() == "true":
        return True
    if token.lower() == "false":
        return False

    # Number
    try:
        if "." in token:
            return float(token)
        return int(token)
    except ValueError:
        pass

    # Variable reference
    val = _get_variable(token, context)
    return val


def _find_matching_endif(text: str, start: int) -> int | None:
    """Return the start index of the ``{% endif %}`` matching the ``{% if %}``
    whose **body** begins at *start*, or ``None`` if unmatched.

    *start* should point just past the closing ``%}`` of the opening ``{% if … %}``.
    """
    depth = 1
    pos = start
    while depth > 0:
        next_if = text.find("{% if ", pos)
        next_endif = text.find("{% endif %}", pos)
        if next_endif == -1:
            return None  # unmatched
        if next_if != -1 and next_if < next_endif:
            depth += 1
            pos = next_if + 6  # skip past '{% if '
        else:
            depth -= 1
            if depth == 0:
                return next_endif
            pos = next_endif + 11  # len('{% endif %}')
    return None


def _find_else_at_depth(text: str, start: int, endif_pos: int) -> int | None:
    """Return the start index of the ``{% else %}`` at depth-0 between *start*
    and *endif_pos*, or ``None`` if there is no else at this depth."""
    depth = 0
    pos = start
    while pos < endif_pos:
        next_if = text.find("{% if ", pos)
        next_else = text.find("{% else %}", pos)
        next_endif = text.find("{% endif %}", pos)

        # Restrict to before our endif
        if next_if != -1 and next_if >= endif_pos:
            next_if = -1
        if next_else != -1 and next_else >= endif_pos:
            next_else = -1
        if next_endif != -1 and next_endif >= endif_pos:
            next_endif = -1

        # Find the earliest relevant tag
        candidates = []
        if next_if != -1:
            candidates.append(("if", next_if))
        if next_else != -1:
            candidates.append(("else", next_else))
        if next_endif != -1:
            candidates.append(("endif", next_endif))

        if not candidates:
            break

        tag, tag_pos = min(candidates, key=lambda x: x[1])

        if tag == "if":
            depth += 1
            pos = tag_pos + 6
        elif tag == "endif":
            depth -= 1
            pos = tag_pos + 11
        elif tag == "else":
            if depth == 0:
                return tag_pos
            pos = tag_pos + 10  # len('{% else %}')
    return None


_IF_OPEN_RE = re.compile(r"\{%\s*if\s+([\s\S]*?)\s*%\}")


# ---------------------------------------------------------------------------
# Renderer
# ---------------------------------------------------------------------------


class TemplateRenderer:
    """Renders templates by substituting variables, evaluating conditionals,
    expanding loops, and calling functions."""

    @staticmethod
    def render(template: str, context: dict[str, Any]) -> TemplateRenderResult:
        """Render *template* with the given *context* and return a :class:`TemplateRenderResult`."""
        variables_used: set[str] = set()
        functions_used: set[str] = set()
        warnings: list[str] = []

        output = template

        # 1. Strip comments
        output = _COMMENT_RE.sub("", output)

        # 2. Process loops (iteratively for safety)
        for _ in range(_MAX_ITERATIONS):
            m = _FOR_RE.search(output)
            if not m:
                break
            iterator_name = m.group(1)
            iterable_name = m.group(2)
            body = m.group(3)

            iterable = _get_variable(iterable_name, context)
            if iterable is None or not hasattr(iterable, "__iter__"):
                iterable = []

            items = list(iterable)
            rendered_parts: list[str] = []
            length = len(items)
            for idx, item in enumerate(items):
                loop_context = dict(context)
                loop_context[iterator_name] = item
                loop_context["loop"] = {
                    "index": idx,
                    "first": idx == 0,
                    "last": idx == length - 1,
                    "length": length,
                }
                rendered_body = TemplateRenderer.render(body, loop_context)
                rendered_parts.append(rendered_body.output)
                variables_used.update(rendered_body.variables_used)
                functions_used.update(rendered_body.functions_used)
                warnings.extend(rendered_body.warnings)

            output = output[: m.start()] + "".join(rendered_parts) + output[m.end() :]

        # 3. Process conditionals (nesting-aware iterative scan)
        for _ in range(_MAX_ITERATIONS):
            m = _IF_OPEN_RE.search(output)
            if not m:
                break
            condition = m.group(1)
            body_start = m.end()  # just past '%}'

            endif_pos = _find_matching_endif(output, body_start)
            if endif_pos is None:
                # Malformed template — leave as-is to avoid infinite loop
                break

            endif_end = endif_pos + 11  # len('{% endif %}')

            # Check for {% else %} at this depth
            else_pos = _find_else_at_depth(output, body_start, endif_pos)

            if else_pos is not None:
                true_block = output[body_start:else_pos]
                false_block = output[else_pos + 10:endif_pos]  # len('{% else %}') == 10
            else:
                true_block = output[body_start:endif_pos]
                false_block = ""

            if _evaluate_condition(condition, context):
                replacement = true_block
            else:
                replacement = false_block

            output = output[: m.start()] + replacement + output[endif_end:]

        # 4. Process function calls (iteratively)
        for _ in range(_MAX_ITERATIONS):
            m = _FUNCTION_RE.search(output)
            if not m:
                break
            func_name = m.group(1)
            args_str = m.group(2)

            if func_name in BUILT_IN_FUNCTIONS:
                functions_used.add(func_name)
                parsed_args = _parse_function_args(
                    args_str, context, functions_used, warnings
                )
                try:
                    result_val = BUILT_IN_FUNCTIONS[func_name](*parsed_args)
                    replacement = str(result_val)
                except Exception as exc:
                    warnings.append(f"Function '{func_name}' error: {exc}")
                    replacement = ""
            else:
                warnings.append(f"Unknown function: {func_name}")
                replacement = ""

            output = output[: m.start()] + replacement + output[m.end() :]

        # 5. Process plain variables
        def _replace_variable(m: re.Match[str]) -> str:
            name = m.group(1)
            variables_used.add(name)
            val = _get_variable(name, context)
            if val is None:
                warnings.append(f"Missing variable: {name}")
                return ""
            return str(val)

        output = _VARIABLE_RE.sub(_replace_variable, output)

        return TemplateRenderResult(
            output=output,
            variables_used=variables_used,
            functions_used=functions_used,
            warnings=warnings,
        )
