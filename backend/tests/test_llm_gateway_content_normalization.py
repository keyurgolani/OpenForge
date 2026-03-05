import sys
import types


if "litellm" not in sys.modules:
    litellm_stub = types.ModuleType("litellm")
    litellm_stub.acompletion = None
    sys.modules["litellm"] = litellm_stub

if "tiktoken" not in sys.modules:
    tiktoken_stub = types.ModuleType("tiktoken")
    tiktoken_stub.encoding_for_model = lambda _model: None
    tiktoken_stub.get_encoding = lambda _name: None
    sys.modules["tiktoken"] = tiktoken_stub


from openforge.core.llm_gateway import LLMGateway


def test_normalize_content_string_passthrough():
    gateway = LLMGateway()
    assert gateway._normalize_content("Simple title") == "Simple title"


def test_normalize_content_list_blocks():
    gateway = LLMGateway()
    content = [
        {"type": "text", "text": "Project"},
        {"type": "output_text", "text": " Plan"},
        {"foo": "ignored"},
    ]
    assert gateway._normalize_content(content) == "Project Plan"


def test_normalize_content_none_returns_empty_string():
    gateway = LLMGateway()
    assert gateway._normalize_content(None) == ""
