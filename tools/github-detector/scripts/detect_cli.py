"""
CLI wrapper around the GitHub detector.

    python scripts/detect_cli.py <handle> [--max-repos N] [--top-n N]

Prints the report as a single JSON object on stdout. **All logging goes to
stderr** — anything else on stdout would corrupt the JSON the backend parses
(same discipline as the MCP server).

This exists so the RAG backend can run the detector out-of-process: the
detector is slow (~5-28s by repository count) and must never block an auth
redirect.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.github import DetectorConfig, detect_github  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("handle", help="GitHub username, URL, @handle, or owner/repo")
    parser.add_argument("--max-repos", type=int, default=300)
    parser.add_argument("--top-n", type=int, default=0,
                        help="repos to shallow-clone; 0 = metadata only (default)")
    parser.add_argument("--include-forks", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

    cfg = DetectorConfig(
        top_n_clone=args.top_n,
        max_repos=args.max_repos,
        include_forks=args.include_forks,
        save_profile=False,
    )
    report = detect_github(args.handle, config=cfg)

    json.dump(report, sys.stdout, default=str)
    sys.stdout.write("\n")
    return 0 if not report.get("errors") else 1


if __name__ == "__main__":
    raise SystemExit(main())
