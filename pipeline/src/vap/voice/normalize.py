"""Conservative English speech normalization; context beats bare-year heuristics."""

import re

VERSION = "2"
SMALL = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen "
    "fourteen fifteen sixteen seventeen eighteen nineteen"
).split()
TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split()


def cardinal(number: int) -> str:
    if number < 0:
        return "minus " + cardinal(-number)
    if number < 20:
        return SMALL[number]
    if number < 100:
        return TENS[number // 10] + ("-" + SMALL[number % 10] if number % 10 else "")
    if number < 1000:
        return (
            SMALL[number // 100]
            + " hundred"
            + (" " + cardinal(number % 100) if number % 100 else "")
        )
    for scale, name in [
        (10**12, "trillion"),
        (10**9, "billion"),
        (10**6, "million"),
        (1000, "thousand"),
    ]:
        if number >= scale:
            return (
                cardinal(number // scale)
                + " "
                + name
                + (" " + cardinal(number % scale) if number % scale else "")
            )
    raise ValueError("Unsupported number")


def number_words(text: str) -> str:
    text = text.replace(",", "")
    if "." in text:
        whole, fraction = text.split(".", 1)
        return cardinal(int(whole)) + " point " + " ".join(SMALL[int(n)] for n in fraction)
    return cardinal(int(text))


def year_words(year: int) -> str:
    if year < 1000 or 2000 <= year <= 2009 or year % 1000 == 0:
        return cardinal(year)
    first, last = divmod(year, 100)
    return cardinal(first) + (
        " hundred" if last == 0 else " oh " + cardinal(last) if last < 10 else " " + cardinal(last)
    )


def ordinal(number: int) -> str:
    words = cardinal(number)
    ending = {
        "one": "first",
        "two": "second",
        "three": "third",
        "five": "fifth",
        "eight": "eighth",
        "nine": "ninth",
        "twelve": "twelfth",
    }
    return re.sub(
        r"[a-z]+$",
        lambda m: ending.get(m[0], m[0][:-1] + "ieth" if m[0].endswith("y") else m[0] + "th"),
        words,
    )


UNITS = {"km": "kilometer", "m": "meter", "kg": "kilogram", "mi": "mile", "%": "percent"}
NUM = r"\d+(?:,\d{3})*(?:\.\d+)?"


def normalize(text: str) -> str:
    """Normalize a prose sentence, retaining punctuation and ordinary words."""
    text = text.replace("’", "'").replace("–", "-").replace("—", ", ")
    for pattern, spoken in [
        (r"\bU\.S\.(?:A\.)?", "United States"),
        (r"\bU\.K\.", "United Kingdom"),
        (r"\bDr\.", "Doctor"),
        (r"\bSt\.(?=\s+[A-Z])", "Saint"),
        (r"\bSt\.", "Street"),
    ]:
        text = re.sub(pattern, spoken, text)
    text = re.sub(
        rf"\b({NUM})\s*(km|kg|mi|m|%)(?!\w)",
        lambda m: (
            number_words(m[1])
            + " "
            + UNITS[m[2]]
            + ("s" if m[2] != "%" and float(m[1].replace(",", "")) != 1 else "")
        ),
        text,
    )
    # Quantity words disambiguate unseparated numbers from years.
    text = re.sub(
        rf"\b({NUM})(?=\s+(?:years?|people|troops|miles?|kilometers?|meters?|percent)\b)",
        lambda m: number_words(m[1]),
        text,
    )
    text = re.sub(r"\b(\d+)(?:st|nd|rd|th)\b", lambda m: ordinal(int(m[1])), text)
    text = re.sub(
        r"\b((?:1|2)\d{3})s\b",
        lambda m: (
            year_words(int(m[1]))[:-1] + "ies"
            if year_words(int(m[1])).endswith("y")
            else year_words(int(m[1])) + "s"
        ),
        text,
    )
    text = re.sub(r"\b((?:1|2)\d{3})\b(?!\d|,\d)", lambda m: year_words(int(m[1])), text)
    text = re.sub(rf"(?<![\w.])({NUM})(?!\w)", lambda m: number_words(m[1]), text)
    for pattern, spoken in [
        (r"\bB\.?C\.?E\.?\b", "before the common era"),
        (r"\bC\.?E\.?\b", "common era"),
        (r"\bB\.?C\.?\b", "before Christ"),
        (r"\bA\.?D\.?\b", "anno Domini"),
    ]:
        text = re.sub(pattern, spoken, text)
    return " ".join(text.split())
