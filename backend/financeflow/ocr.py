import pytesseract, io
from PIL import Image
from pdf2image import convert_from_bytes
from typing import Optional  # <-- Add this import

def extract_text(blob: bytes, filename: Optional[str]=None) -> str:
    name = (filename or "").lower()
    pages = []
    if name.endswith(".pdf"):
        images = convert_from_bytes(blob)
        for img in images:
            pages.append(pytesseract.image_to_string(img))
    else:
        img = Image.open(io.BytesIO(blob))
        pages.append(pytesseract.image_to_string(img))
    return "\n".join(pages)