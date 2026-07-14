"""
Tests for Phase 4 -- AI Spam Filtering

Runs the KeywordSpamDetector against three scenarios:
  1. Legitimate grievance text -> should NOT be spam
  2. Commercial/promotional text -> SHOULD be spam
  3. Empty description -> SHOULD be spam

Usage:
    cd backend
    python test/4-ai-spam-filtering/test.py
"""

import sys
from pathlib import Path

# Ensure the backend root is on sys.path so imports resolve
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ---- Spam detector tests (no Django dependency needed) ----

from grievances.services.spam_detector import KeywordSpamDetector


def test_legitimate_grievance_text():
    """A normal college grievance should NOT be classified as spam."""
    detector = KeywordSpamDetector()
    text = (
        "I am having issues with my examination results. "
        "The grade for Mathematics appears to be incorrectly entered "
        "in the system. Please look into this matter."
    )
    result = detector.analyze(text)

    assert result['spam_prediction'] is False, \
        f"Expected ham, got spam (confidence: {result['confidence_score']})"
    assert 'classification_reason' in result, \
        f"Missing 'classification_reason' key: {result.keys()}"
    assert 0.0 <= result['confidence_score'] <= 1.0, \
        f"Confidence score out of range: {result['confidence_score']}"

    print(f"  PASS legitimate: score={result['confidence_score']}, "
          f"reason={result['classification_reason']!r}")


def test_spam_text_is_detected():
    """Commercial / promotional language should be classified as spam."""
    detector = KeywordSpamDetector()
    text = "Buy now! Limited time offer! Click here to earn money fast! Free money for you!"
    result = detector.analyze(text)

    assert result['spam_prediction'] is True, \
        "Expected spam, got ham"
    assert result['confidence_score'] >= 0.40, \
        f"Confidence too low for obvious spam: {result['confidence_score']}"
    assert 'classification_reason' in result

    print(f"  PASS spam: score={result['confidence_score']}, "
          f"reason={result['classification_reason']!r}")


def test_empty_text_is_spam():
    """Empty or whitespace-only descriptions should be flagged as spam."""
    detector = KeywordSpamDetector()
    result = detector.analyze('')

    assert result['spam_prediction'] is True, \
        "Empty text should be classified as spam"
    assert result['confidence_score'] == 0.95, \
        f"Expected 0.95, got {result['confidence_score']}"
    assert 'classification_reason' in result

    print(f"  PASS empty: score={result['confidence_score']}, "
          f"reason={result['classification_reason']!r}")


def run():
    """Run all three spam-detector tests and report results."""
    tests = [
        ("Legitimate grievance text", test_legitimate_grievance_text),
        ("Spam text detection",       test_spam_text_is_detected),
        ("Empty text classification", test_empty_text_is_spam),
    ]

    passed = 0
    failed = 0

    print(f"\n{'='*60}")
    print("  Phase 4 - AI Spam Filtering :: Spam Detector Tests")
    print(f"{'='*60}\n")

    for label, fn in tests:
        try:
            fn()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL {label}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR {label}: {e}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"  Results: {passed} passed, {failed} failed, "
          f"{passed + failed} total")
    print(f"{'='*60}\n")

    return failed == 0


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
