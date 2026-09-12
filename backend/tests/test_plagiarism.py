"""
Tests for CopyDetectEngine and AI code heuristics.
"""

from __future__ import annotations

from rag.llm import FakeLLM
from rag.models import PlagiarismCheckRequest
from rag.plagiarism import CopyDetectEngine


def test_copydetect_identical_code_gives_100_percent():
    engine = CopyDetectEngine(k=4, window_size=4)
    code = """
    function calculateTotal(items) {
        let total = 0;
        for (let i = 0; i < items.length; i++) {
            total += items[i].price;
        }
        return total;
    }
    """
    sim, matched, union = engine.compare(code, code, "Identical")
    assert sim >= 95.0
    assert matched == union


def test_copydetect_variable_renaming_still_detected():
    engine = CopyDetectEngine(k=4, window_size=4)
    code_a = """
    function calculateTotal(items) {
        let total = 0;
        for (let i = 0; i < items.length; i++) {
            total += items[i].price;
        }
        return total;
    }
    """
    code_b = """
    function computeSum(products) {
        let result = 0;
        for (let j = 0; j < products.length; j++) {
            result += products[j].price;
        }
        return result;
    }
    """
    sim, matched, union = engine.compare(code_a, code_b, "Renamed")
    assert sim >= 70.0  # Normalized AST tokens match despite renamed variables


def test_emoji_and_ai_marker_detection():
    engine = CopyDetectEngine()
    code_with_ai = """
    // 🚀 Step 1: Initialize task queue
    function initQueue() {
        // ✨ Helper function to prepare workers
        const queue = [];
        return queue; // ✅ Done
    }
    """
    flags, emojis = engine.scan_comments_and_ai_markers(code_with_ai)
    assert "🚀" in emojis or "✨" in emojis or "✅" in emojis
    assert len(flags) >= 2


def test_analyze_with_fake_llm():
    engine = CopyDetectEngine()
    fake_llm = FakeLLM(
        default={
            "confidence_score": 88.5,
            "is_ai_generated": True,
            "is_plagiarized": False,
            "verdict": "AI_GENERATED",
            "explanation": "Flagged due to unusual emojis in code comments and formulaic docstrings.",
        }
    )
    req = PlagiarismCheckRequest(
        code="// 🚀 Step 1: run code\nfunction run() { return 1; }",
        language="javascript",
        run_llm=True,
    )
    res = engine.analyze(req, llm=fake_llm)
    assert res.is_ai_generated is True
    assert res.verdict == "AI_GENERATED"
    assert res.confidence_score == 88.5
    assert "emojis" in res.llm_explanation.lower()
