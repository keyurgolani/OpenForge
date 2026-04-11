"""Cascade entity extraction pipeline: spaCy -> GLiNER -> LLM fallback."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger("openforge.memory.extraction")

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


class EntityType(str, Enum):
    PERSON = "PERSON"
    ORGANIZATION = "ORGANIZATION"
    LOCATION = "LOCATION"
    EVENT = "EVENT"
    OBJECT = "OBJECT"


@dataclass
class ExtractedEntity:
    name: str
    type: EntityType
    subtype: Optional[str] = None
    confidence: float = 0.0
    source: str = ""  # "spacy" | "gliner" | "llm"


@dataclass
class ExtractedRelation:
    source_entity: str
    target_entity: str
    relation_type: str
    confidence: float = 0.0


@dataclass
class ExtractionResult:
    entities: list[ExtractedEntity] = field(default_factory=list)
    relations: list[ExtractedRelation] = field(default_factory=list)


# ---------------------------------------------------------------------------
# spaCy NER label -> POLE+O mapping
# ---------------------------------------------------------------------------

_SPACY_LABEL_MAP: dict[str, EntityType] = {
    "PERSON": EntityType.PERSON,
    "ORG": EntityType.ORGANIZATION,
    "GPE": EntityType.LOCATION,
    "LOC": EntityType.LOCATION,
    "FAC": EntityType.LOCATION,
    "EVENT": EntityType.EVENT,
    "DATE": EntityType.EVENT,
    "TIME": EntityType.EVENT,
    "PRODUCT": EntityType.OBJECT,
    "WORK_OF_ART": EntityType.OBJECT,
}

# ---------------------------------------------------------------------------
# GLiNER label -> POLE+O mapping (label -> (type, subtype))
# ---------------------------------------------------------------------------

_GLINER_LABEL_MAP: dict[str, tuple[EntityType, Optional[str]]] = {
    "person": (EntityType.PERSON, None),
    "company": (EntityType.ORGANIZATION, "company"),
    "organization": (EntityType.ORGANIZATION, None),
    "city": (EntityType.LOCATION, "city"),
    "country": (EntityType.LOCATION, "country"),
    "location": (EntityType.LOCATION, None),
    "building": (EntityType.LOCATION, "building"),
    "event": (EntityType.EVENT, None),
    "meeting": (EntityType.EVENT, "meeting"),
    "product": (EntityType.OBJECT, "product"),
    "software": (EntityType.OBJECT, "software"),
    "document": (EntityType.OBJECT, "document"),
    "vehicle": (EntityType.OBJECT, "vehicle"),
    "device": (EntityType.OBJECT, "device"),
    "technology": (EntityType.OBJECT, "technology"),
}

_GLINER_LABELS = list(_GLINER_LABEL_MAP.keys())

# ---------------------------------------------------------------------------
# Lazy-loaded singletons
# ---------------------------------------------------------------------------

_spacy_nlp = None
_gliner_model = None


def _get_spacy_nlp():
    """Load spaCy en_core_web_sm lazily (singleton)."""
    global _spacy_nlp
    if _spacy_nlp is None:
        import spacy

        _spacy_nlp = spacy.load("en_core_web_sm")
    return _spacy_nlp


def _get_gliner_model():
    """Load GLiNER urchade/gliner_medium-v2.1 lazily (singleton)."""
    global _gliner_model
    if _gliner_model is None:
        from gliner import GLiNER

        _gliner_model = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")
    return _gliner_model


# ---------------------------------------------------------------------------
# Stage 1: spaCy extraction (~5ms)
# ---------------------------------------------------------------------------


def extract_spacy(text: str) -> ExtractionResult:
    """Extract entities using spaCy NER. Fast first pass."""
    nlp = _get_spacy_nlp()
    doc = nlp(text)

    seen: dict[str, ExtractedEntity] = {}
    for ent in doc.ents:
        entity_type = _SPACY_LABEL_MAP.get(ent.label_)
        if entity_type is None:
            continue
        key = ent.text.strip().lower()
        if not key:
            continue
        if key not in seen:
            seen[key] = ExtractedEntity(
                name=ent.text.strip(),
                type=entity_type,
                confidence=0.85,
                source="spacy",
            )

    return ExtractionResult(entities=list(seen.values()))


# ---------------------------------------------------------------------------
# Stage 2: GLiNER extraction (~50ms)
# ---------------------------------------------------------------------------


def extract_gliner(text: str) -> ExtractionResult:
    """Extract entities using GLiNER zero-shot NER. Richer type coverage."""
    model = _get_gliner_model()
    predictions = model.predict_entities(text, _GLINER_LABELS, threshold=0.4)

    seen: dict[str, ExtractedEntity] = {}
    for pred in predictions:
        label = pred.get("label", "").lower()
        mapping = _GLINER_LABEL_MAP.get(label)
        if mapping is None:
            continue
        entity_type, subtype = mapping
        name = pred.get("text", "").strip()
        if not name:
            continue
        key = name.lower()
        score = float(pred.get("score", 0.5))
        # Keep highest-scoring prediction per entity name
        if key not in seen or score > seen[key].confidence:
            seen[key] = ExtractedEntity(
                name=name,
                type=entity_type,
                subtype=subtype,
                confidence=score,
                source="gliner",
            )

    return ExtractionResult(entities=list(seen.values()))


# ---------------------------------------------------------------------------
# Stage 3: LLM extraction (~500ms)
# ---------------------------------------------------------------------------

_LLM_EXTRACTION_PROMPT = """\
You are an entity and relationship extraction engine.

Given the text below and a list of entities already found, extract:
1. Any additional entities NOT already in the list.
2. Relationships between ALL entities (both existing and new).

Entity types: PERSON, ORGANIZATION, LOCATION, EVENT, OBJECT

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "entities": [
    {"name": "...", "type": "PERSON|ORGANIZATION|LOCATION|EVENT|OBJECT", "subtype": "...or null"}
  ],
  "relations": [
    {"source": "entity name", "target": "entity name", "relation": "relation type"}
  ]
}

Already-found entities:
%s

Text:
%s"""


async def extract_llm(
    text: str,
    existing_entities: list[ExtractedEntity],
    *,
    provider_name: str,
    api_key: str,
    model: str,
    base_url: str | None = None,
) -> ExtractionResult:
    """Extract entities and relations using an LLM. Slowest but most capable."""
    from openforge.core.llm_gateway import llm_gateway

    existing_names = [f"{e.name} ({e.type.value})" for e in existing_entities]
    existing_str = ", ".join(existing_names) if existing_names else "(none)"
    prompt = _LLM_EXTRACTION_PROMPT % (existing_str, text[:4000])

    try:
        response = await llm_gateway.chat(
            messages=[{"role": "user", "content": prompt}],
            provider_name=provider_name,
            api_key=api_key,
            model=model,
            base_url=base_url,
            max_tokens=2000,
        )

        # Strip markdown fences if the model wraps its response
        cleaned = response.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

        data = json.loads(cleaned)

        entities: list[ExtractedEntity] = []
        for ent_data in data.get("entities", []):
            name = ent_data.get("name", "").strip()
            raw_type = ent_data.get("type", "").upper()
            if not name:
                continue
            try:
                entity_type = EntityType(raw_type)
            except ValueError:
                continue
            entities.append(
                ExtractedEntity(
                    name=name,
                    type=entity_type,
                    subtype=ent_data.get("subtype"),
                    confidence=0.7,
                    source="llm",
                )
            )

        relations: list[ExtractedRelation] = []
        for rel_data in data.get("relations", []):
            source = rel_data.get("source", "").strip()
            target = rel_data.get("target", "").strip()
            relation = rel_data.get("relation", "").strip()
            if source and target and relation:
                relations.append(
                    ExtractedRelation(
                        source_entity=source,
                        target_entity=target,
                        relation_type=relation,
                        confidence=0.7,
                    )
                )

        return ExtractionResult(entities=entities, relations=relations)

    except Exception:
        logger.exception("LLM entity extraction failed")
        return ExtractionResult()


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


def merge_results(*results: ExtractionResult) -> ExtractionResult:
    """Merge multiple extraction results; highest confidence wins per entity name (case-insensitive)."""
    entity_map: dict[str, ExtractedEntity] = {}
    all_relations: list[ExtractedRelation] = []

    for result in results:
        for entity in result.entities:
            key = entity.name.lower()
            if key not in entity_map or entity.confidence > entity_map[key].confidence:
                entity_map[key] = entity
        all_relations.extend(result.relations)

    # Deduplicate relations
    seen_rels: set[tuple[str, str, str]] = set()
    unique_relations: list[ExtractedRelation] = []
    for rel in all_relations:
        rel_key = (rel.source_entity.lower(), rel.target_entity.lower(), rel.relation_type.lower())
        if rel_key not in seen_rels:
            seen_rels.add(rel_key)
            unique_relations.append(rel)

    return ExtractionResult(
        entities=list(entity_map.values()),
        relations=unique_relations,
    )


# ---------------------------------------------------------------------------
# Cascade pipeline
# ---------------------------------------------------------------------------


async def extract_entities_cascade(
    text: str,
    *,
    use_llm_fallback: bool = True,
    provider_name: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> ExtractionResult:
    """
    Run the full cascade: spaCy -> GLiNER -> merge -> optional LLM fallback.

    The LLM fallback triggers when average confidence < 0.6 or no entities found.
    LLM parameters are required only when use_llm_fallback is True.
    """
    # Stage 1: spaCy
    spacy_result = extract_spacy(text)

    # Stage 2: GLiNER
    gliner_result = extract_gliner(text)

    # Merge stages 1 + 2
    merged = merge_results(spacy_result, gliner_result)

    # Determine if LLM fallback is needed
    needs_llm = False
    if not merged.entities:
        needs_llm = True
    else:
        avg_confidence = sum(e.confidence for e in merged.entities) / len(merged.entities)
        if avg_confidence < 0.6:
            needs_llm = True

    if use_llm_fallback and needs_llm and provider_name and model:
        llm_result = await extract_llm(
            text,
            merged.entities,
            provider_name=provider_name,
            api_key=api_key or "",
            model=model,
            base_url=base_url,
        )
        merged = merge_results(merged, llm_result)

    return merged
