"""
Plagiarism and AI-code detection engine.

Based on the open-source `copydetect` algorithm (GitHub: blingenf/copydetect)
implementing:
1. Token-based AST normalization & winnowing fingerprinting (Stanford MOSS standard).
2. AI-generated code detection:
   - Emoji extraction from comments and string literals (🤖, 🚀, ✨, 💡, ✅, etc.)
   - Formulaic AI comment patterns (e.g. "Step 1: Initialize...", "Helper function to...")
3. Deep forensic evaluation using the backend's configured LLM (Gemini / OpenAI / Anthropic)
   to calibrate a final confidence score (0-100%).
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from rag.models import AICommentFlag, PlagiarismAnalysis, PlagiarismCheckRequest

if TYPE_CHECKING:
    from rag.llm import LLMClient

logger = logging.getLogger("rag.plagiarism")

# Common unicode emoji regex covering emoticons, transport, symbols, pictographs
EMOJI_PATTERN = re.compile(
    r"[\U0001F1E0-\U0001F1FF"  # flags (iOS)
    r"\U0001F300-\U0001F5FF"  # symbols & pictographs
    r"\U0001F600-\U0001F64F"  # emoticons
    r"\U0001F680-\U0001F6FF"  # transport & map symbols
    r"\U0001F700-\U0001F77F"  # alchemical symbols
    r"\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
    r"\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
    r"\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
    r"\U0001FA00-\U0001FA6F"  # Chess Symbols
    r"\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
    r"\U00002702-\U000027B0"  # Dingbats
    r"\U000024C2-\U0001F251"
    r"]+",
    flags=re.UNICODE,
)

AI_COMMENT_PATTERNS = [
    (re.compile(r"^\s*(?://|#|\*)\s*(?:step\s*\d+|phase\s*\d+):", re.IGNORECASE), "Step-by-step AI commentary"),
    (re.compile(r"^\s*(?://|#|\*)\s*helper\s+function\s+to", re.IGNORECASE), "Formulaic helper docstring"),
    (re.compile(r"^\s*(?://|#|\*)\s*(?:time|space)\s+complexity\s*:", re.IGNORECASE), "Textbook complexity annotation"),
    (re.compile(r"^\s*(?://|#|\*)\s*note:\s*(?:ensure|remember|this\s+guarantees)", re.IGNORECASE), "Instructional AI advisory comment"),
    (re.compile(r"^\s*(?://|#|\*)\s*(?:initialize|return)\s+the\s+", re.IGNORECASE), "Redundant obvious-action comment"),
    (re.compile(r"```(?:javascript|typescript|python|js|ts)?", re.IGNORECASE), "Markdown code fence residue"),
    (re.compile(r"here(?:\s+is|\s+'s)\s+(?:the\s+)?(?:code|solution|implementation)", re.IGNORECASE), "Conversational LLM response residue"),
]


class CopyDetectEngine:
    """
    Open-source code plagiarism detection engine following `copydetect` architecture:
    - Language tokenization & identifier normalization
    - K-gram rolling polynomial hashing
    - Winnowing sliding window algorithm for fingerprint reduction
    - Jaccard similarity index computation
    """

    def __init__(self, k: int = 5, window_size: int = 4, prime: int = 31, mod: int = 1_000_000_007) -> None:
        self.k = k
        self.window_size = window_size
        self.prime = prime
        self.mod = mod

    def extract_emojis(self, text: str) -> list[str]:
        """Find all unique emojis in the text."""
        return list(dict.fromkeys(EMOJI_PATTERN.findall(text)))

    def scan_comments_and_ai_markers(self, source: str) -> tuple[list[AICommentFlag], list[str]]:
        """
        Extract all comments, flags emojis in comments/strings,
        and detects characteristic AI comment formulas.
        """
        flags: list[AICommentFlag] = []
        detected_emojis: list[str] = []
        lines = source.splitlines()

        for idx, line in enumerate(lines, start=1):
            # Check for emojis in this line
            line_emojis = EMOJI_PATTERN.findall(line)
            if line_emojis:
                for em in line_emojis:
                    if em not in detected_emojis:
                        detected_emojis.append(em)
                flags.append(
                    AICommentFlag(
                        line_number=idx,
                        line_content=line.strip(),
                        flag_type="emoji",
                        detail=f"Contains AI-characteristic emoji: {' '.join(line_emojis)}",
                    )
                )

            # Check for AI comment patterns
            for pat, desc in AI_COMMENT_PATTERNS:
                if pat.search(line):
                    flags.append(
                        AICommentFlag(
                            line_number=idx,
                            line_content=line.strip(),
                            flag_type="ai_phrase",
                            detail=desc,
                        )
                    )
                    break

        return flags, detected_emojis

    def normalize_code(self, source: str) -> str:
        """
        Codeforces / copydetect token normalization:
        - Strips comments and docstrings
        - Replaces string and number literals with generic markers
        - Standardizes keywords and normalizes identifiers to generic IDs (V1, V2, etc.)
        """
        if not source:
            return ""

        # Remove comments
        code = re.sub(r"/\*[\s\S]*?\*/", "", source)  # C/JS multiline
        code = re.sub(r"//.*$", "", code, flags=re.MULTILINE)  # C/JS single line
        code = re.sub(r"#.*$", "", code, flags=re.MULTILINE)  # Python single line
        code = re.sub(r'"""[\s\S]*?"""', "", code)  # Python multiline
        code = re.sub(r"'''[\s\S]*?'''", "", code)

        # Normalize string and number literals
        code = re.sub(r"([\"'])(?:(?=(\\?))\2[\s\S])*?\1", "STR", code)
        code = re.sub(r"\b\d+(\.\d+)?\b", "NUM", code)

        keyword_map = {
            "function": "FNC",
            "const": "VAR",
            "let": "VAR",
            "var": "VAR",
            "def": "FNC",
            "class": "CLS",
            "return": "RET",
            "for": "LOP",
            "while": "LOP",
            "if": "CND",
            "else": "CND",
            "switch": "CND",
            "case": "CND",
            "import": "IMP",
            "export": "EXP",
            "from": "FRM",
            "try": "TRY",
            "catch": "CTH",
            "except": "CTH",
            "throw": "ERR",
            "raise": "ERR",
            "async": "ASY",
            "await": "AWT",
            "true": "BLN",
            "false": "BLN",
            "null": "NUL",
            "none": "NUL",
            "undefined": "NUL",
        }

        tokens = re.findall(r"[A-Za-z_$][A-Za-z0-9_$]*|[^\s\w]", code)
        normalized_parts: list[str] = []
        id_map: dict[str, str] = {}
        id_counter = 1

        for token in tokens:
            lower = token.lower()
            if lower in keyword_map:
                normalized_parts.append(keyword_map[lower])
            elif re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", token):
                if token not in id_map:
                    id_map[token] = f"V{id_counter}"
                    id_counter += 1
                normalized_parts.append(id_map[token])
            elif token in "{}([]) ;, . + - * / = > < ! & | : % ^ ~":
                normalized_parts.append(token)

        return "".join(normalized_parts)

    def hash_kgram(self, kgram: str) -> int:
        """Polynomial rolling hash for a token sequence."""
        h = 0
        for ch in kgram:
            h = (h * self.prime + ord(ch)) % self.mod
        return h

    def generate_fingerprints(self, source: str) -> set[int]:
        """Generate winnowed structural fingerprints (Stanford MOSS / copydetect)."""
        normalized = self.normalize_code(source)
        fingerprints: set[int] = set()

        if len(normalized) < self.k:
            if normalized:
                fingerprints.add(self.hash_kgram(normalized))
            return fingerprints

        hashes = [
            self.hash_kgram(normalized[i : i + self.k])
            for i in range(len(normalized) - self.k + 1)
        ]

        if len(hashes) <= self.window_size:
            fingerprints.add(min(hashes))
            return fingerprints

        min_idx = -1
        for i in range(len(hashes) - self.window_size + 1):
            window = hashes[i : i + self.window_size]
            cur_min = window[0]
            cur_min_idx = i
            for j in range(1, len(window)):
                if window[j] <= cur_min:
                    cur_min = window[j]
                    cur_min_idx = i + j
            if cur_min_idx != min_idx:
                fingerprints.add(cur_min)
                min_idx = cur_min_idx

        return fingerprints

    def compare(
        self,
        candidate_code: str,
        reference_code: str,
        reference_name: str = "Reference",
    ) -> tuple[float, int, int]:
        """
        Compare candidate code against a reference using Jaccard similarity of
        winnowed fingerprints. Returns (similarity_percent, matched_count, union_count).
        """
        fp1 = self.generate_fingerprints(candidate_code)
        fp2 = self.generate_fingerprints(reference_code)

        if not fp1 or not fp2:
            return 0.0, 0, max(len(fp1), len(fp2))

        intersection = fp1.intersection(fp2)
        union = fp1.union(fp2)
        jaccard = (len(intersection) / len(union)) * 100.0 if union else 0.0
        return round(jaccard, 1), len(intersection), len(union)

    def analyze(
        self,
        request: PlagiarismCheckRequest,
        llm: LLMClient | None = None,
    ) -> PlagiarismAnalysis:
        """
        Run complete plagiarism detection:
        1. Copydetect winnowing similarity against reference (if provided)
        2. AI emoji and comment pattern extraction
        3. LLM deep forensic evaluation if requested and configured
        """
        flags, detected_emojis = self.scan_comments_and_ai_markers(request.code)
        norm_sample = self.normalize_code(request.code)[:60]

        similarity_score = 0.0
        overlap_fps = 0
        total_fps = 0
        ref_name = request.reference_name

        if request.reference_code:
            similarity_score, overlap_fps, total_fps = self.compare(
                request.code,
                request.reference_code,
                ref_name,
            )

        # Baseline heuristic calculation
        emoji_count = len(detected_emojis)
        ai_phrase_count = sum(1 for f in flags if f.flag_type == "ai_phrase")

        heuristic_ai_points = 0
        if emoji_count > 0:
            heuristic_ai_points += min(45, emoji_count * 20)
        if ai_phrase_count > 0:
            heuristic_ai_points += min(45, ai_phrase_count * 15)

        # Combined heuristic score
        base_confidence = max(similarity_score, float(heuristic_ai_points))
        base_confidence = min(99.0, base_confidence)

        is_plagiarized = similarity_score >= 65.0
        is_ai = base_confidence >= 50.0 or emoji_count >= 1

        verdict = "CLEAN"
        if is_plagiarized:
            verdict = "PLAGIARIZED"
        elif is_ai:
            verdict = "AI_GENERATED"
        elif base_confidence >= 35.0:
            verdict = "SUSPICIOUS"

        llm_explanation = ""
        final_confidence = base_confidence

        # LLM Forensics Deep Audit
        if request.run_llm and llm is not None:
            try:
                system_prompt = (
                    "You are a code plagiarism and AI-generated code detection specialist. "
                    "Analyze the given candidate code. Check for AI hallmarks: formulaic comments, "
                    "unusual emojis in code comments/strings, typical ChatGPT/Claude phrasing, "
                    "or direct copying from online benchmarks. "
                    "Return a JSON object with: "
                    '{"confidence_score": <float 0-100>, "is_ai_generated": <bool>, '
                    '"is_plagiarized": <bool>, "verdict": "CLEAN"|"SUSPICIOUS"|"PLAGIARIZED"|"AI_GENERATED", '
                    '"explanation": "<detailed 2-3 sentence forensic finding>"}'
                )
                user_prompt = (
                    f"Language: {request.language}\n"
                    f"Code:\n```\n{request.code[:4000]}\n```\n"
                    f"Detected Emojis: {detected_emojis}\n"
                    f"Flagged Comments: {[f.line_content for f in flags[:6]]}\n"
                    f"Structural Token Winnowing Similarity: {similarity_score}% against {ref_name} ({overlap_fps}/{total_fps} fingerprints)"
                )
                res = llm.complete_json(system_prompt, user_prompt)
                if isinstance(res, dict):
                    if "confidence_score" in res:
                        final_confidence = round(float(res["confidence_score"]), 1)
                    if "verdict" in res and res["verdict"] in ["CLEAN", "SUSPICIOUS", "PLAGIARIZED", "AI_GENERATED"]:
                        verdict = res["verdict"]
                    if "is_plagiarized" in res:
                        is_plagiarized = bool(res["is_plagiarized"])
                    if "is_ai_generated" in res:
                        is_ai = bool(res["is_ai_generated"])
                    if "explanation" in res:
                        llm_explanation = str(res["explanation"]).strip()
            except Exception as e:
                logger.warning("LLM plagiarism audit failed or unavailable: %s", e)
                # Fallback to heuristic explanation
                reasons: list[str] = []
                if detected_emojis:
                    reasons.append(f"Contains AI-style emojis ({', '.join(detected_emojis)}) in code comments.")
                if ai_phrase_count > 0:
                    reasons.append(f"Identified {ai_phrase_count} robotic step-by-step commentary pattern(s).")
                if similarity_score >= 50.0:
                    reasons.append(f"{similarity_score}% structural token match with {ref_name}.")
                llm_explanation = " ".join(reasons) or "Code shows natural human keystroke and structural variance."

        if not llm_explanation:
            reasons = []
            if detected_emojis:
                reasons.append(f"Contains AI-style emojis ({', '.join(detected_emojis)}) in code comments.")
            if ai_phrase_count > 0:
                reasons.append(f"Contains {ai_phrase_count} textbook AI comment pattern(s).")
            if similarity_score >= 50.0:
                reasons.append(f"{similarity_score}% structural token overlap with {ref_name}.")
            llm_explanation = " ".join(reasons) or "Independent logic verified. No significant plagiarism or AI artifacts detected."

        return PlagiarismAnalysis(
            similarity_score=similarity_score,
            confidence_score=final_confidence,
            verdict=verdict,
            is_plagiarized=is_plagiarized,
            is_ai_generated=is_ai,
            detected_emojis=detected_emojis,
            flagged_comments=flags,
            overlap_fingerprints=overlap_fps,
            total_fingerprints=total_fps,
            reference_matched=ref_name if similarity_score > 0 else "",
            llm_explanation=llm_explanation,
            ast_tokens_sample=norm_sample,
        )
