"""
Configuration — loads environment variables for the GitHub detector.

Only settings the detector actually reads live here. A setting nothing reads is
worse than no setting, because it implies a knob that does not work.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load .env from this tool's root (tools/github-detector/.env)
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"

if _ENV_FILE.exists():
    load_dotenv(_ENV_FILE)

# ---------------------------------------------------------------------------
# GitHub access
# ---------------------------------------------------------------------------
# Optional, but strongly recommended. Anonymous access is capped at 60 req/hr
# — roughly one profile per hour, because the LOC pass costs ~1 request per
# repository. A token raises the ceiling to 5,000 req/hr.
#
# Resolution order in app.github.resolve_token():
#   1. an explicit token argument
#   2. GITHUB_TOKEN / GH_TOKEN environment variables
#   3. this setting (.env)
#   4. the `gh` CLI credential helper, if installed
GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "") or os.getenv("GH_TOKEN", "")
