import re

with open("backend/instagram_service.py", "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "failed" in line.lower():
            print(f"Line {i}: {line.strip()}")
