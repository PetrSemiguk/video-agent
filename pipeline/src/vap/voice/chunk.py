"""Paragraph/sentence chunking with a 240-character normalized speech budget."""

import re
from dataclasses import dataclass, replace

from .normalize import normalize

DEFAULT_MAX_CHARS = 240


@dataclass(frozen=True)
class Chunk:
    original: str
    normalized: str
    paragraph: int
    section: int = 0
    boundary: str = "sentence"
    pause_after: float | None = None
    pause_before: float = 0.0


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
    result: list[Chunk] = []
    section, paragraph, leading_pause = 0, 0, 0.0
    # Keep headings as section boundaries while omitting their spoken text.
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    blocks = re.split(r"(^\s*#{1,6}\s+.*$)", text, flags=re.MULTILINE)
    for block in blocks:
        if re.match(r"^\s*#{1,6}\s+", block):
            section += 1
            continue
        for prose in read_prose(block):
            for fragment in re.split(r"(\[pause\s+[^\]]*\])", prose):
                if fragment.startswith("[pause"):
                    match = re.fullmatch(r"\[pause\s+(\d+(?:\.\d+)?)\]", fragment)
                    if not match or not 0 <= float(match[1]) <= 30:
                        raise ValueError("Pause must be [pause seconds], from 0 to 30")
                    pause = float(match[1])
                    if result:
                        previous = result[-1]
                        result[-1] = replace(
                            previous, pause_after=(previous.pause_after or 0) + pause
                        )
                    else:
                        leading_pause += pause
                    continue
                if "[pause" in fragment:
                    raise ValueError("Malformed pause directive")
                for sentence in sentences(fragment.strip()):
                    additions = _split_sentence(sentence, paragraph, section, max_chars)
                    if additions and not result:
                        additions[0] = replace(additions[0], pause_before=leading_pause)
                    result.extend(additions)
            paragraph += 1
    if not result:
        raise ValueError("Script contains no narration")
    return result


def _split_sentence(sentence: str, paragraph: int, section: int, max_chars: int) -> list[Chunk]:
    result = []
    pending: list[str] = []
    for word in sentence.split():
        if len(normalize(word)) > max_chars:
            raise ValueError("A single normalized token exceeds max_chars")
        if pending and len(normalize(" ".join([*pending, word]))) > max_chars:
            original = " ".join(pending)
            result.append(Chunk(original, normalize(original), paragraph, section, "continuation"))
            pending = []
        pending.append(word)
    if pending:
        original = " ".join(pending)
        result.append(Chunk(original, normalize(original), paragraph, section))
    return result
