"""Stdio JSON-RPC loop. Reads one JSON line per request on stdin, writes
one JSON line per response on stdout. Errors return ok=false with a
reason string — never raise, never exit non-zero for request errors.

CRITICAL: The stdout channel is the JSON response stream. ANY stray
print() or library chatter on stdout will corrupt the protocol and the
Node client will reject the line as non-JSON. Before we import crawl4ai
(which prints "[INIT]..." etc on startup) we save the real stdout and
redirect sys.stdout to sys.stderr so every other writer is silenced.
"""

from __future__ import annotations

import os
import sys

# 1. Capture the real stdout BEFORE any library imports so we can still
#    write JSON responses to it. Binary mode — JSON output is bytes.
_RAW_STDOUT = sys.stdout.buffer

# 2. Silence stdout for the rest of the process. crawl4ai + deps print
#    banner/status text to stdout during import and during calls; those
#    MUST NOT reach the Node client. stderr goes to the Node logger and
#    is fine.
sys.stdout = sys.stderr

# 3. Suppress noisy async resource warnings at shutdown (Windows-only
#    asyncio proactor cleanup chatter — harmless but confuses operators).
os.environ.setdefault("PYTHONWARNINGS", "ignore::ResourceWarning")

# 4. Now it's safe to import — any banner text goes to stderr via the
#    swap above.
try:
    import orjson

    def _dumps(obj: dict) -> bytes:
        return orjson.dumps(obj) + b"\n"

    def _loads(line: bytes) -> dict:
        return orjson.loads(line)

except ImportError:
    import json

    def _dumps(obj: dict) -> bytes:
        return (json.dumps(obj) + "\n").encode("utf-8")

    def _loads(line: bytes) -> dict:
        return json.loads(line)


from .extract import extract_from_html, warmup


def _respond(resp: dict) -> None:
    _RAW_STDOUT.write(_dumps(resp))
    _RAW_STDOUT.flush()


def _handle_line(line_bytes: bytes) -> None:
    try:
        req = _loads(line_bytes)
    except Exception as err:
        _respond({"id": "", "ok": False, "error": f"json_parse: {err}"})
        return

    req_id = str(req.get("id") or "")
    url = str(req.get("url") or "")
    html = req.get("html") or ""
    features_raw = req.get("features") or []
    features = [str(f) for f in features_raw if isinstance(f, str)]

    if not html:
        _respond({
            "id": req_id, "ok": True,
            "markdown": "", "tables": [], "lists": [],
            "metrics": {"duration_ms": 0, "word_count": 0, "table_count": 0},
        })
        return

    try:
        result = extract_from_html(url=url, html=str(html), features=features)
        _respond({"id": req_id, "ok": True, **result})
    except Exception as err:
        _respond({"id": req_id, "ok": False, "error": f"{type(err).__name__}: {err}"})


def main() -> int:
    try:
        warmup()
    except Exception:
        pass  # fallback path in extract.py handles cold cache

    stdin = sys.stdin.buffer
    while True:
        try:
            line = stdin.readline()
        except Exception as err:
            sys.stderr.write(f"[sidecar] readline fatal: {err}\n")
            return 2
        if not line:
            return 0
        stripped = line.strip()
        if not stripped:
            continue
        try:
            _handle_line(stripped)
        except Exception as err:
            # Last-resort — _handle_line already envelopes exceptions, but
            # belt-and-suspenders for anything that escapes.
            sys.stderr.write(f"[sidecar] handle fatal: {err}\n")


if __name__ == "__main__":
    sys.exit(main())
