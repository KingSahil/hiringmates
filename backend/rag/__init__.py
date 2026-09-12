"""
RAG backend core.

A config-driven, multi-scenario pipeline. The flow is fixed; scenarios are
configuration. Deterministic where it can be (MCQ scoring), model-driven only
where it must be (profiling, question generation, theory grading).
"""

__version__ = "0.1.0"
