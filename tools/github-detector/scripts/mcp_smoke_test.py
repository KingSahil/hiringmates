"""
Smoke test for the GitHub detector MCP server over the real stdio transport.

Spawns the server as a subprocess, performs the MCP handshake, lists the
advertised tools, and invokes them end to end. This is the only test that
proves the stdio JSON-RPC stream is not corrupted by stray stdout writes.

Run from the tool root:
    python scripts/mcp_smoke_test.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _interpreter() -> str:
    """Prefer the local venv; fall back to whatever is running this script."""
    if sys.platform == "win32":
        candidate = ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = ROOT / ".venv" / "bin" / "python"
    return str(candidate if candidate.exists() else Path(sys.executable))


async def main() -> int:
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    params = StdioServerParameters(
        command=_interpreter(),
        args=["-m", "app.mcp_server"],
        cwd=str(ROOT),
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("handshake: OK")

            tools = await session.list_tools()
            names = [t.name for t in tools.tools]
            print(f"tools advertised: {names}")
            for t in tools.tools:
                desc = (t.description or "").split(".")[0]
                print(f"  - {t.name}: {desc[:80]}")

            print("\ninvoking get_ranking_weights (offline)...")
            res = await session.call_tool("get_ranking_weights", {})
            payload = _extract(res)
            print("  weights    :", payload.get("weights"))
            print("  drop_if    :", payload["hard_filter"]["drop_if"])

            print("\ninvoking detect_github_profile (live, top_n=0)...")
            res = await session.call_tool(
                "detect_github_profile",
                {"handle": "octocat", "top_n": 0},
            )
            payload = _extract(res)
            prof = payload.get("profile", {})
            stats = payload.get("stats", {})
            meta = payload.get("meta", {})
            print("  login   :", prof.get("login"))
            print("  name    :", prof.get("name"))
            print("  repos   :", stats.get("repos_total"), "total,",
                  stats.get("repos_ranked"), "ranked")
            print("  rate    :", stats.get("rate_limit"))
            print("  errors  :", payload.get("errors"))
            print("  meta    :", sorted(meta))

            # The MCP layer must not strip engine-owned meta. Regression guard
            # for a bug where assigning a fresh meta dict dropped these.
            for required in ("loc_accuracy", "top_n_clone", "loc_strategy",
                             "detector", "version"):
                if required not in meta:
                    print(f"\nFAILED: meta.{required} missing through the MCP "
                          f"transport")
                    return 1
            print("  loc_accuracy survives transport: OK")

    print("\nMCP server smoke test: PASSED")
    return 0


def _extract(result) -> dict:
    """Pull the JSON payload out of an MCP tool result."""
    structured = getattr(result, "structuredContent", None)
    if isinstance(structured, dict):
        # FastMCP-style servers may wrap the return under a result key.
        if set(structured.keys()) == {"result"} and isinstance(structured["result"], dict):
            return structured["result"]
        return structured
    for block in result.content or []:
        text = getattr(block, "text", None)
        if text:
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                continue
    raise AssertionError(f"no JSON payload in tool result: {result!r}")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
