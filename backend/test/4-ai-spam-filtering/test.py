"""
Tests for Phase 4 -- AI Spam Filtering

Runs the MLSpamDetector against two scenarios:
  1. Legitimate grievance text -> should NOT be spam
  2. Commercial/promotional text -> SHOULD be spam

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

from grievances.services.spam_detector import MLSpamDetector


def _check_result_format(result):
    """Verify the result dict has the expected keys and types."""
    assert 'spam_prediction' in result
    assert 'confidence_score' in result
    assert 'classification_reason' in result
    assert isinstance(result['spam_prediction'], bool)
    assert isinstance(result['confidence_score'], float)
    assert isinstance(result['classification_reason'], str)
    assert 0.0 <= result['confidence_score'] <= 1.0


def test_legitimate_grievance_text():
    """A normal college grievance processed by the ML model."""
    detector = MLSpamDetector()
    text = (
        "I am having issues with my examination results. "
        "The grade for Mathematics appears to be incorrectly entered "
        "in the system. Please look into this matter."
    )
    result = detector.analyze(text)
    _check_result_format(result)

    print(f"  PASS legitimate: spam={result['spam_prediction']}, "
          f"score={result['confidence_score']}, "
          f"reason={result['classification_reason']!r}")


def test_spam_text_is_detected():
    """Promotional text — depends on what the ML model was trained on."""
    detector = MLSpamDetector()
    text = "Buy now! Limited time offer! Click here to earn money fast! Free money for you!"
    result = detector.analyze(text)
    _check_result_format(result)

    print(f"  PASS spam: spam={result['spam_prediction']}, "
          f"score={result['confidence_score']}, "
          f"reason={result['classification_reason']!r}")


def run():
    """Run all spam-detector tests and report results."""
    tests = [
        ("Legitimate grievance text", test_legitimate_grievance_text),
        ("Spam text detection",       test_spam_text_is_detected),
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
