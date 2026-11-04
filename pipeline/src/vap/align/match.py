"""Monotone token alignment with explicit missing/extra-word evidence."""

import math
import re

from vap.voice.normalize import normalize


def tokens(text: str) -> list[str]:
    return re.findall(r"[^\W_]+(?:'[^\W_]+)*", text.replace("’", "'").casefold())


def edit_path(expected: list[str], heard: list[str]) -> list[tuple[str, int | None, int | None]]:
    """Levenshtein alignment; exact matches win ties, followed by substitution."""
    n, m = len(expected), len(heard)
    cost = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        cost[i][0] = i
    for j in range(m + 1):
        cost[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost[i][j] = min(
                cost[i - 1][j] + 1,
                cost[i][j - 1] + 1,
                cost[i - 1][j - 1] + (expected[i - 1] != heard[j - 1]),
            )
    path, i, j = [], n, m
    while i or j:
        if i and j and cost[i][j] == cost[i - 1][j - 1] + (expected[i - 1] != heard[j - 1]):
            path.append(
                ("match" if expected[i - 1] == heard[j - 1] else "substitute", i - 1, j - 1)
            )
            i, j = i - 1, j - 1
        elif i and cost[i][j] == cost[i - 1][j] + 1:
            path.append(("missing", i - 1, None))
            i -= 1
        else:
            path.append(("extra", None, j - 1))
            j -= 1
    return path[::-1]


def owned_forms(words: list[str]) -> tuple[list[str], list[int]]:
    """Map contextual normalization back to original word owners.

    The second alignment handles St. -> Saint, plural units, etc. without
    replacing original script words with normalized or recognized spellings.
    """
    individual, owners = [], []
    for index, word in enumerate(words):
        forms = tokens(normalize(word))
        individual.extend(forms)
        owners.extend([index] * len(forms))
    contextual = tokens(normalize(" ".join(words)))
    mapped = []
    last_owner = 0
    for _, expected, actual in edit_path(individual, contextual):
        if expected is not None:
            last_owner = owners[expected]
        if actual is not None:
            mapped.append(last_owner)
    return contextual, mapped


def heard_forms(words: list[dict]) -> tuple[list[str], list[dict]]:
    merged = []
    for word in words:
        current = dict(word)
        # Whisper can tokenize 2,000 as "2" and ",000" with separate spans.
        if (
            merged
            and re.fullmatch(r",\d{3}(?:,\d{3})*(?:[.!?])?", current["text"])
            and re.search(r"\d$", merged[-1]["text"])
        ):
            merged[-1]["text"] += current["text"]
            merged[-1]["end"] = current["end"]
        else:
            merged.append(current)
    forms, owners = owned_forms([w["text"] for w in merged])
    return forms, [merged[owner] for owner in owners]


def align_chunk(chunk: dict, recognized: dict, word_offset: int) -> tuple[list[dict], list[dict]]:
    for word in recognized["words"]:
        if not (
            math.isfinite(word["start"])
            and math.isfinite(word["end"])
            and chunk["start"] <= word["start"] <= word["end"] <= chunk["end"]
        ):
            raise ValueError("Recognized word has invalid/out-of-chunk timing")
    originals = [w for w in chunk["original"].split() if tokens(w)]
    expected, owners = owned_forms(originals)
    if expected != tokens(chunk["normalized"]):
        raise ValueError("Current normalizer differs from manifest: regenerate narration first")
    heard, observations = heard_forms(recognized["words"])
    matches = [[] for _ in originals]
    issues, statuses = [], ["matched"] * len(originals)
    for operation, i, j in edit_path(expected, heard):
        if operation == "match":
            matches[owners[i]].append(observations[j])
        else:
            if i is not None:
                statuses[owners[i]] = "unresolved"
            issues.append(
                {
                    "type": operation,
                    "chunk_id": chunk["id"],
                    "word_index": word_offset + owners[i] if i is not None else None,
                    "expected": expected[i] if i is not None else None,
                    "recognized": heard[j] if j is not None else None,
                    "start": observations[j]["start"] if j is not None else None,
                    "end": observations[j]["end"] if j is not None else None,
                }
            )
    output = []
    for index, (text, observed) in enumerate(zip(originals, matches, strict=True)):
        status = statuses[index] if observed else "unresolved"
        start = min(w["start"] for w in observed) if status == "matched" else None
        end = max(w["end"] for w in observed) if status == "matched" else None
        if start is not None and end <= start:
            status, start, end = "unresolved", None, None
            issues.append(
                {
                    "type": "zero_duration",
                    "chunk_id": chunk["id"],
                    "word_index": word_offset + index,
                }
            )
        output.append(
            {
                "index": word_offset + index,
                "text": text,
                "chunk_id": chunk["id"],
                "paragraph": chunk["paragraph"],
                "section": chunk.get("section", 0),
                "start": start,
                "end": end,
                "status": status,
            }
        )
    return output, issues
