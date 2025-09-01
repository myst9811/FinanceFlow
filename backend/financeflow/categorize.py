import re

RULES = [
    (r"uber|ola|ride|cab", "Transport"),
    (r"swiggy|zomato|restaurant|cafe|food", "Food"),
    (r"rent|maintenance|housing|flat", "Housing"),
    (r"amazon|flipkart|shopping|store", "Shopping"),
    (r"upi|transfer|imps|neft", "Transfers"),
    (r"salary|credit|refund|reversal", "Income"),
]

def assign_category(description: str, amount: float) -> str:
    desc = (description or "").lower()
    for pat, cat in RULES:
        if re.search(pat, desc):
            return cat
    return "Income" if amount > 0 else "Other"
