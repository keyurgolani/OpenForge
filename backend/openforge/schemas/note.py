"""Backward-compatible aliases for knowledge schemas."""

from openforge.schemas.knowledge import (
    KnowledgeCreate,
    KnowledgeUpdate,
    KnowledgeTagsUpdate,
    KnowledgeListItem,
    KnowledgeResponse,
    KnowledgeListParams,
)

# Backward compatibility exports
NoteCreate = KnowledgeCreate
NoteUpdate = KnowledgeUpdate
NoteTagsUpdate = KnowledgeTagsUpdate
NoteListItem = KnowledgeListItem
NoteResponse = KnowledgeResponse
NoteListParams = KnowledgeListParams

__all__ = [
    'KnowledgeCreate',
    'KnowledgeUpdate',
    'KnowledgeTagsUpdate',
    'KnowledgeListItem',
    'KnowledgeResponse',
    'KnowledgeListParams',
    'NoteCreate',
    'NoteUpdate',
    'NoteTagsUpdate',
    'NoteListItem',
    'NoteResponse',
    'NoteListParams',
]
