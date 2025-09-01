import re
from datetime import datetime
from typing import List, Dict

# extremely simple parser for bank-SMS-like lines: "2024-08-01, UPI to XYZ, -230.50"
LINE = re.compile(r"(?P<date>\d{4}-\d{2}-\d{2}).*?(?P<desc>[^,\n]+),\s*(?P<amount>-?\d+(?:\.\d{1,2})?)")

def parse_text(text: str) -> List[Dict]:
    out = []
    for m in LINE.finditer(text):
        d = m.group("date")
        try:
            date = datetime.strptime(d, "%Y-%m-%d").date().isoformat()
        except Exception:
            continue
        out.append({
            "date": date,
            "amount": float(m.group("amount")),
            "currency": "INR",
            "description": m.group("desc").strip()
        })
    return out
