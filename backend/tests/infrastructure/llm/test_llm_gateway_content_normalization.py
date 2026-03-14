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


def test_extract_ollama_chunk_text_ignores_thinking_only_chunk():
    gateway = LLMGateway()
    chunk = {
        "model": "gpt-oss:20b",
        "created_at": "2026-03-05T20:49:52.771712803Z",
        "response": "",
        "thinking": "User",
        "done": False,
    }
    assert gateway._extract_ollama_chunk_text(chunk) == ""


def test_extract_ollama_chunk_text_reads_response_field():
    gateway = LLMGateway()
    chunk = {"response": "hello", "done": False}
    assert gateway._extract_ollama_chunk_text(chunk) == "hello"


def test_extract_ollama_chunk_text_reads_chat_message_content():
    gateway = LLMGateway()
    chunk = {"message": {"role": "assistant", "content": "world"}, "done": False}
    assert gateway._extract_ollama_chunk_text(chunk) == "world"


def test_normalize_ollama_base_url_trims_v1_suffix():
    gateway = LLMGateway()
    assert gateway._normalize_ollama_base_url("http://localhost:11434/v1") == "http://localhost:11434"


def test_extract_ollama_chunk_thinking_reads_root_field():
    gateway = LLMGateway()
    chunk = {"thinking": "Reasoning step", "done": False}
    assert gateway._extract_ollama_chunk_thinking(chunk) == "Reasoning step"


def test_extract_ollama_chunk_thinking_reads_message_field():
    gateway = LLMGateway()
    chunk = {"message": {"thinking": "Deep thought"}, "done": False}
    assert gateway._extract_ollama_chunk_thinking(chunk) == "Deep thought"
