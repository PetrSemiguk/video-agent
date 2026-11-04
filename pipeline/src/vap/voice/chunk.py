"""Paragraph/sentence chunking with a 240-character normalized speech budget."""

import re
from dataclasses import dataclass

from .normalize import normalize

DEFAULT_MAX_CHARS = 240


@dataclass(frozen=True)
class Chunk:
    original: str
    normalized: str
    paragraph: int


def read_prose(text: str) -> list[str]:
    """Skip Markdown headings/comments; each remaining blank-line block is a paragraph."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`]", "", text)
    return [" ".join(p.split()) for p in re.split(r"\n\s*\n", text) if p.strip()]


def sentences(paragraph: str) -> list[str]:
    # Protect standard dotted abbreviations before detecting sentence boundaries.
    protected = re.sub(
        r"\b(?:U\.S\.(?:A\.)?|U\.K\.|St\.|Dr\.)", lambda m: m[0].replace(".", "\x00"), paragraph
    )
    return [s.replace("\x00", ".") for s in re.split(r"(?<=[.!?])\s+", protected) if s]


def chunks(text: str, max_chars: int = DEFAULT_MAX_CHARS) -> list[Chunk]:
    if max_chars < 40:
        raise ValueError("max_chars must be at least 40")
    result = []
    for paragraph, prose in enumerate(read_prose(text)):
        for sentence in sentences(prose):
            pending: list[str] = []
            for word in sentence.split():
                if len(normalize(word)) > max_chars:
                    raise ValueError("A single normalized token exceeds max_chars")
                if pending and len(normalize(" ".join([*pending, word]))) > max_chars:
                    original = " ".join(pending)
                    result.append(Chunk(original, normalize(original), paragraph))
                    pending = []
                pending.append(word)
            if pending:
                original = " ".join(pending)
                result.append(Chunk(original, normalize(original), paragraph))
    if not result:
        raise ValueError("Script contains no narration")
    return result
