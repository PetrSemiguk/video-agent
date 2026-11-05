"""Repository text stays real UTF-8: no mojibake and no locale-dependent Python file I/O."""

import ast
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
# UTF-8 read as cp1252. Built from code points so this file does not match itself. A lead
# letter must be followed by another non-ASCII character, so that real text such as the
# Portuguese capital A-tilde before O stays valid: a broken sequence never continues in ASCII.
LEAD_LETTERS = chr(0xC2) + chr(0xC3)
EURO_SEQUENCE = chr(0xE2) + chr(0x20AC)
NON_ASCII = f"[{chr(0x80)}-{chr(0x10FFFF)}]"
MOJIBAKE = re.compile(f"[{LEAD_LETTERS}]{NON_ASCII}|{EURO_SEQUENCE}")
NOT_TEXT_FILES = {"Image", "wave", "rasterio", "os"}


def tracked_text_files():
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout
    for name in listing.decode("utf-8").split("\0"):
        path = ROOT / name
        if name and path.is_file():
            data = path.read_bytes()
            if b"\0" not in data:
                yield name, data.decode("utf-8", errors="replace")


def unspecified_encoding(source: str) -> list[int]:
    """Lines with a text-mode file call that would fall back to the Windows locale."""
    lines = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        function = node.func
        name = function.attr if isinstance(function, ast.Attribute) else getattr(function, "id", "")
        receiver = getattr(getattr(function, "value", None), "id", "")
        if name in {"read_text", "write_text"}:
            text_mode = True
        elif name in {"open", "fdopen"} and (name == "fdopen" or receiver not in NOT_TEXT_FILES):
            modes = [arg.value for arg in node.args if isinstance(arg, ast.Constant)]
            modes += [k.value.value for k in node.keywords if k.arg == "mode"]
            text_mode = not any(isinstance(mode, str) and "b" in mode for mode in modes)
        else:
            continue
        if text_mode and not any(k.arg == "encoding" for k in node.keywords):
            lines.append(node.lineno)
    return lines


@pytest.mark.parametrize("text", ["Stöckli", "© Kartverket", "Österreich", "a – b"])
def test_detector_finds_utf8_read_as_cp1252(text):
    assert MOJIBAKE.search(text.encode("utf-8").decode("cp1252"))


@pytest.mark.parametrize("valid", ["Stöckli", "© Kartverket", f"S{chr(0xC3)}O PAULO", "a – b"])
def test_detector_accepts_real_text(valid):
    assert not MOJIBAKE.search(valid)


def test_this_file_does_not_match_its_own_detector():
    assert not MOJIBAKE.search(Path(__file__).read_text(encoding="utf-8"))


def test_tracked_text_files_have_no_mojibake():
    broken = [
        f"{name}:{number}"
        for name, text in tracked_text_files()
        for number, line in enumerate(text.splitlines(), 1)
        if MOJIBAKE.search(line)
    ]
    assert not broken, f"Mojibake found: {broken}"


def test_detector_for_file_io_needs_explicit_encoding():
    assert unspecified_encoding("p.write_text('x')\np.read_text()\nopen('f')\np.open('a')\n") == [
        1,
        2,
        3,
        4,
    ]
    assert not unspecified_encoding(
        "p.write_text('x', encoding='utf-8')\nopen('f', 'rb')\np.open('wb')\nImage.open(p)\n"
    )


def test_python_text_file_io_declares_encoding():
    missing = [
        f"{path.relative_to(ROOT).as_posix()}:{line}"
        for folder in ("pipeline/src", "pipeline/tests")
        for path in sorted((ROOT / folder).rglob("*.py"))
        for line in unspecified_encoding(path.read_text(encoding="utf-8"))
    ]
    assert not missing, f"Text file I/O without encoding: {missing}"
