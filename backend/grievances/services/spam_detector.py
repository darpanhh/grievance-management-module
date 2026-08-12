"""
Spam Detection Service for the Grievance Management System.

Implements a swappable spam detection interface (Strategy pattern, NFR-26)
so the detection algorithm can be changed without touching business logic.

Phase 4 — AI Spam Filtering
SRS Reference: §3.4 (FR-14–FR-18), §4.6 (NFR-26)
"""

import pickle
import re
import threading
import warnings
from abc import ABC, abstractmethod
from pathlib import Path

from nltk.corpus import stopwords
from nltk.stem.porter import PorterStemmer

warnings.filterwarnings('ignore', message='.*InconsistentVersionWarning.*')
warnings.filterwarnings('ignore', message='Trying to unpickle estimator.*')


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


# ---------------------------------------------------------------------------
# NLTK and Emoji text preprocessing — exactly matching the Jupyter Notebook pipeline
# ---------------------------------------------------------------------------

import emoji
from nltk.tokenize import word_tokenize

_ps = PorterStemmer()

# Preserve negations because they change meaning
NEGATIONS = {
    "no",
    "not",
    "nor",
    "never",
    "cannot",
    "without"
}

_stop_words = set(stopwords.words("english")) - NEGATIONS

# Compiled Regular Expressions matching the notebook
URL_RE = re.compile(r"https?://\S+|www\.\S+")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\d{10}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b")
HTML_RE = re.compile(r"<.*?>")
MENTION_RE = re.compile(r"@\w+")
HASHTAG_RE = re.compile(r"#(\w+)")
NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")
MULTISPACE_RE = re.compile(r"\s+")
REPEAT_RE = re.compile(r"(.)\1{2,}")

CONTRACTIONS = {
    "can't": "cannot",
    "won't": "will not",
    "n't": " not",
    "'re": " are",
    "'ve": " have",
    "'ll": " will",
    "'d": " would",
    "'m": " am",
    "'s": ""
}


def expand_contractions(text: str) -> str:
    """Expand common English contractions."""
    for key, value in CONTRACTIONS.items():
        text = text.replace(key, value)
    return text


def _transform_text(text: str) -> str:
    """
    Text preprocessing optimized for University Grievance Spam Detection.
    Matches the exact logic used in the Jupyter Notebook training pipeline.
    """
    if not isinstance(text, str):
        return ""

    text = text.strip()

    if not text:
        return ""

    # Remove HTML
    text = HTML_RE.sub(" ", text)

    # Lowercase
    text = text.lower()

    # Expand contractions
    text = expand_contractions(text)

    # Replace URLs, Emails and Phone Numbers
    text = URL_RE.sub(" urltoken ", text)
    text = EMAIL_RE.sub(" emailtoken ", text)
    text = PHONE_RE.sub(" phonetoken ", text)

    # Remove mentions
    text = MENTION_RE.sub(" ", text)

    # Keep hashtag words
    text = HASHTAG_RE.sub(r" \1 ", text)

    # Convert emojis into words
    text = emoji.demojize(text, delimiters=(" ", " "))
    text = text.replace("_", " ")

    # Normalize repeated characters
    text = REPEAT_RE.sub(r"\1\1", text)

    # Remove punctuation, keep numbers
    text = NON_ALNUM_RE.sub(" ", text)

    # Remove extra spaces
    text = MULTISPACE_RE.sub(" ", text).strip()

    # Tokenize
    tokens = word_tokenize(text)

    cleaned = []

    SPECIAL_TOKENS = {
        "urltoken",
        "emailtoken",
        "phonetoken"
    }

    for token in tokens:
        # Preserve placeholders
        if token in SPECIAL_TOKENS:
            cleaned.append(token)
            continue

        # Remove stopwords except negations
        if token in _stop_words:
            continue

        # Remove single alphabetic characters
        if len(token) == 1 and token.isalpha():
            continue

        # Stem words
        cleaned.append(_ps.stem(token))

    return " ".join(cleaned)


# ---------------------------------------------------------------------------
# ML-based Spam Detector
# ---------------------------------------------------------------------------

MODEL_DIR = Path(__file__).resolve().parent / 'models'


class MLSpamDetector(SpamDetectorInterface):
    """
    Scikit-learn based spam detector using a pre-trained TF-IDF + classifier.

    Loads ``grievance_model.pkl`` from ``services/models/`` on first instantiation.
    The model is a scikit-learn Pipeline containing both the vectorizer and classifier.

    Text is pre-processed with the same NLTK pipeline (lowercase → tokenise
    → remove stopwords/punctuation → Porter stem) used during training.
    """

    def __init__(self):
        model_path = MODEL_DIR / 'grievance_model.pkl'

        with open(model_path, 'rb') as f:
            self._pipeline = pickle.load(f)

    def analyze(self, text: str) -> dict:
        clean = _transform_text(text.strip())

        if not clean:
            return {
                'spam_prediction': True,
                'confidence_score': 0.90,
                'classification_reason': 'No meaningful content after preprocessing.',
            }

        # Try predict_proba first for a proper confidence score
        if hasattr(self._pipeline, 'predict_proba'):
            proba = self._pipeline.predict_proba([clean])[0]
            # In binary classification, index 1 corresponds to SPAM (class 1)
            confidence_score = float(proba[1])
            spam_prediction = bool(self._pipeline.predict([clean])[0])
        else:
            spam_prediction = bool(self._pipeline.predict([clean])[0])
            confidence_score = 1.0 if spam_prediction else 0.0

        reason = (
            'Classified as spam by ML model.'
            if spam_prediction else
            'No spam indicators detected.'
        )

        return {
            'spam_prediction': spam_prediction,
            'confidence_score': round(confidence_score, 4),
            'classification_reason': reason,
        }


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------
# The detector is loaded once per process (pickle + NLTK data checks are
# expensive) and reused for every submission — instantiating it per request
# added ~100-500ms (or more on a cold NLTK data dir) to every POST.

_detector_instance: MLSpamDetector | None = None
_detector_lock = threading.Lock()


def get_spam_detector() -> MLSpamDetector:
    """
    Return the process-wide ``MLSpamDetector`` instance, creating it
    lazily and thread-safely on first use.
    """
    global _detector_instance
    if _detector_instance is None:
        with _detector_lock:
            if _detector_instance is None:
                _detector_instance = MLSpamDetector()
    return _detector_instance
