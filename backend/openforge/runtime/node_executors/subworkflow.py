"""Subworkflow node executor."""

from __future__ import annotations

from .delegate_call import DelegateCallNodeExecutor


class SubworkflowNodeExecutor(DelegateCallNodeExecutor):
    """Spawn a child workflow run through the coordinator."""

    supported_types = ("subworkflow",)
