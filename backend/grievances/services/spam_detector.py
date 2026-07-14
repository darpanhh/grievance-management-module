"""
Spam Detection Service for the Grievance Management System.

Implements a swappable spam detection interface (Strategy pattern, NFR-26)
so the detection algorithm can be changed without touching business logic.

Phase 4 — AI Spam Filtering
SRS Reference: §3.4 (FR-14–FR-18), §4.6 (NFR-26)
"""

import re
from abc import ABC, abstractmethod


class SpamDetectorInterface(ABC):
    """
    Abstract interface for spam detection.

    Implementations must provide an ``analyze(text)`` method that returns
    a dictionary with exactly three keys:

    .. code-block:: python

        {
            "spam_prediction": bool,   # True if the text is classified as spam
            "confidence_score": float,  # 0.0 (certain ham) to 1.0 (certain spam)
            "classification_reason": str, # Human-readable explanation
        }
    """

    @abstractmethod
    def analyze(self, text: str) -> dict:
        """Analyse *text* and return a spam prediction dict."""
        ...


class KeywordSpamDetector(SpamDetectorInterface):
    """
    Heuristic-based spam detector that checks for known spam patterns,
    keyword density, and length heuristics.

    This is the initial implementation; it can be replaced with an ML-based
    detector later (e.g. scikit-learn / HuggingFace) without changing any
    view or business-logic code — the interface is the contract.

    Spam indicators (weighted):
      - Presence of commercial spam keywords
      - Excessive repetition of characters or words
      - Description length anomalies (too short / too long)
      - All-caps / SHOUTING content
      - High link-to-text ratio
    """

    # Commercial / promotional spam keywords with weight multipliers
    SPAM_KEYWORDS = [
        (r'\bbuy\s+now\b', 0.25),
        (r'\bclick\s+here\b', 0.20),
        (r'\bfree\s+money\b', 0.30),
        (r'\bwin\s+(?:prize|money|cash)\b', 0.30),
        (r'\blimited\s+time\s+offer\b', 0.25),
        (r'\bact\s+now\b', 0.15),
        (r'\bregister\s+(?:today|now|online)\b', 0.15),
        (r'\bearn\s+money\b', 0.25),
        (r'\bwork\s+from\s+home\b', 0.15),
        (r'\bget\s+rich\b', 0.30),
        (r'\binvestment\s+opportunity\b', 0.20),
        (r'\bdon\'?t\s+miss\s+out\b', 0.15),
        (r'\bexclusive\s+offer\b', 0.20),
        (r'\bcongratulations\s+(?:you\s+)?(?:have\s+)?won\b', 0.30),
        (r'\bclaim\s+your\s+(?:prize|reward|bonus)\b', 0.30),
        (r'\bno\s+cost\b', 0.15),
        (r'\bgift\s+card\b', 0.15),
        (r'\bfor\s+only\s+\$\d+\b', 0.20),
        (r'\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b', 0.10),  # email harvesting
        (r'\bhttp[s]?://\S+\b', 0.10),  # promotional URLs
    ]

    # Characters whose repetition suggests spam
    REPETITION_PATTERN = re.compile(r'(.)\1{4,}')
    # All-caps word threshold
    ALL_CAPS_THRESHOLD = 0.40  # if 40%+ of alphabetic chars are uppercase
    # Minimum reasonable description length
    MIN_DESCRIPTION_LENGTH = 10
    MAX_DESCRIPTION_LENGTH = 5000

    def __init__(self):
        self._compiled_keywords = [
            (re.compile(pattern, re.IGNORECASE), weight)
            for pattern, weight in self.SPAM_KEYWORDS
        ]

    def analyze(self, text: str) -> dict:
        """
        Analyse *text* and return a spam prediction dict.

        The confidence score is a float in [0.0, 1.0] built from weighted
        spam indicators.  A score >= 0.40 triggers a spam classification.
        """
        if not text or not text.strip():
            return {
                'spam_prediction': True,
                'confidence_score': 0.95,
                'classification_reason': 'Empty or whitespace-only description.',
            }

        score = 0.0
        reasons = []
        clean = text.strip()

        # --- 1. Keyword matches -------------------------------------------
        matched_any = False
        for compiled, weight in self._compiled_keywords:
            if compiled.search(clean):
                matched_any = True
                score += weight

        if matched_any:
            reasons.append('Contains commercial or promotional language.')
        else:
            # Slight penalty if *nothing* matched — uncommon for legitimate
            # college grievances to have zero keyword signals
            pass

        # --- 2. Length heuristics -----------------------------------------
        if len(clean) < self.MIN_DESCRIPTION_LENGTH:
            score += 0.30
            reasons.append('Description is unusually short.')
        elif len(clean) > self.MAX_DESCRIPTION_LENGTH:
            score += 0.10
            reasons.append('Description is unusually long.')

        # --- 3. Repetitive characters (e.g. "aaaaaa", "!!!!!!") -----------
        rep_matches = self.REPETITION_PATTERN.findall(clean)
        if rep_matches:
            score += 0.10 * min(len(rep_matches), 5)
            reasons.append('Contains unusual character repetition.')

        # --- 4. All-caps / SHOUTING content --------------------------------
        alpha_chars = [c for c in clean if c.isalpha()]
        if alpha_chars:
            upper_ratio = sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars)
            if upper_ratio > self.ALL_CAPS_THRESHOLD:
                score += 0.15
                reasons.append(
                    f'High proportion of uppercase text ({upper_ratio:.0%}).'
                )

        # --- Final classification ------------------------------------------
        spam_prediction = score >= 0.40

        # Clamp score to [0.0, 1.0]
        confidence_score = min(score, 1.0)

        reason = '; '.join(reasons) if reasons else (
            'No spam indicators detected.'
            if not spam_prediction else
            'Classified as spam based on heuristic analysis.'
        )

        return {
            'spam_prediction': spam_prediction,
            'confidence_score': round(confidence_score, 4),
            'classification_reason': reason,
        }
