"""GPU sanity check: versions, CUDA device info and a matmul benchmark.

Run with: uv run python -m vap.gpu_check
Exit code 0 when CUDA works, 1 otherwise.
"""

from __future__ import annotations

import platform
import sys
import time
import warnings

# numpy is not a dependency yet (it arrives with chatterbox-tts); silence torch's notice.
warnings.filterwarnings("ignore", message="Failed to initialize NumPy")

import torch  # noqa: E402
import torchaudio  # noqa: E402

MATRIX_SIZE = 4096
ITERATIONS = 20
GIB = 1024**3


def _bench(device: str, dtype: torch.dtype) -> float:
    """Return seconds for ITERATIONS matmuls of MATRIX_SIZE x MATRIX_SIZE."""
    a = torch.randn(MATRIX_SIZE, MATRIX_SIZE, device=device, dtype=dtype)
    b = torch.randn(MATRIX_SIZE, MATRIX_SIZE, device=device, dtype=dtype)
    is_cuda = device == "cuda"
    torch.matmul(a, b)  # warm-up (kernel selection, lazy init)
    if is_cuda:
        torch.cuda.synchronize()
    start = time.perf_counter()
    for _ in range(ITERATIONS):
        torch.matmul(a, b)
    if is_cuda:
        torch.cuda.synchronize()
    return time.perf_counter() - start


def _tflops(seconds: float) -> float:
    return 2 * MATRIX_SIZE**3 * ITERATIONS / seconds / 1e12


def main() -> int:
    print(f"python      : {platform.python_version()} ({sys.executable})")
    print(f"torch       : {torch.__version__}")
    print(f"torchaudio  : {torchaudio.__version__}")
    print(f"torch CUDA  : {torch.version.cuda}")
    print(f"cuDNN       : {torch.backends.cudnn.version()}")

    available = torch.cuda.is_available()
    print(f"cuda avail. : {available}")
    if not available:
        reason = (
            "torch is a CPU-only build"
            if torch.version.cuda is None
            else "CUDA build, but no usable device/driver"
        )
        print(f"GPU FAIL: {reason}")
        return 1

    try:
        name = torch.cuda.get_device_name(0)
        major, minor = torch.cuda.get_device_capability(0)
        free, total = torch.cuda.mem_get_info(0)
        print(f"device      : {name} (sm_{major}{minor})")
        print(f"VRAM        : {total / GIB:.2f} GiB total, {free / GIB:.2f} GiB free")

        n = f"{MATRIX_SIZE}x{MATRIX_SIZE}"
        gpu_s = _bench("cuda", torch.float16)
        print(f"GPU matmul  : {n} fp16 x{ITERATIONS}: {gpu_s:.3f} s ({_tflops(gpu_s):.1f} TFLOPS)")
        cpu_s = _bench("cpu", torch.float32)
        print(f"CPU matmul  : {n} fp32 x{ITERATIONS}: {cpu_s:.3f} s ({_tflops(cpu_s):.2f} TFLOPS)")
        print(f"speed-up    : {cpu_s / gpu_s:.0f}x")
    except Exception as exc:  # noqa: BLE001 - report any CUDA failure as GPU FAIL
        print(f"GPU FAIL: {type(exc).__name__}: {exc}")
        return 1

    print(f"GPU OK: {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
