"""Keep tests hermetic: no real Gemini key, generous rate limits."""

import os

os.environ["GEMINI_API_KEY"] = ""
os.environ["AI_RATE_LIMIT"] = "1000/minute"
os.environ["DATA_RATE_LIMIT"] = "1000/minute"
