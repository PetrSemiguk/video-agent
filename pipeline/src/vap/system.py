"""What the machine can spare right now. Heavy renders ask before they start."""

from __future__ import annotations

import ctypes
import sys

# A 1080p episode render was killed at 4.8 GB available; below this it is not worth starting.
RENDER_MIN_FREE_GB = 6.0
# Rough appetite of one Chromium render worker at 1920x1080, plus its share of the bundle.
RENDER_GB_PER_WORKER = 2.5
# docs/python-env.md: 16 GB of RAM, so never more than the Remotion config's own cap.
RENDER_MAX_WORKERS = 2


class _MemoryStatus(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def available_gb() -> float | None:
    """Physical memory a new process can take, in GB, or None when it cannot be read."""
    if sys.platform == "win32":
        status = _MemoryStatus()
        status.dwLength = ctypes.sizeof(_MemoryStatus)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return None
        return status.ullAvailPhys / 1024**3
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / 1024**2
    except (OSError, ValueError, IndexError):
        return None
    return None


def render_concurrency(available: float | None, cap: int = RENDER_MAX_WORKERS) -> int:
    """Render workers the free memory allows: one, plus one per spare RENDER_GB_PER_WORKER."""
    if available is None:
        return 1
    spare = available - RENDER_MIN_FREE_GB
    return max(1, min(cap, 1 + int(spare // RENDER_GB_PER_WORKER)))


def check_render_memory(what: str = "An episode render") -> tuple[int, str]:
    """Workers to use and a line to log. Raises when there is too little memory to start."""
    available = available_gb()
    if available is None:
        return 1, "memory unknown, using 1 render worker"
    if available < RENDER_MIN_FREE_GB:
        raise ValueError(
            f"{what} needs about {RENDER_MIN_FREE_GB:.0f} GB of free RAM and only "
            f"{available:.1f} GB is available. Close what you can and run again; the render is "
            "killed rather than slowed when memory runs out (AGENTS.md, Environment)."
        )
    workers = render_concurrency(available)
    return workers, f"{available:.1f} GB available, using {workers} render worker(s)"
