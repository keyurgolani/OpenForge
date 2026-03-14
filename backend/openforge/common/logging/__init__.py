"""
Common logging utilities for OpenForge.

This module provides centralized logging configuration and utilities
for consistent logging across the application.
"""

import logging
import sys
from typing import Optional


def get_logger(name: str, level: Optional[int] = None) -> logging.Logger:
    """
    Get a logger instance with consistent configuration.

    Args:
        name: Logger name (typically module name)
        level: Optional log level override

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)

    if level is not None:
        logger.setLevel(level)

    # Avoid adding handlers if they already exist
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(handler)

    return logger


def setup_logging(level: int = logging.INFO) -> None:
    """
    Setup application-wide logging configuration.

    Args:
        level: Root log level
    """
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
