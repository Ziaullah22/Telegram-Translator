with open("d:/Freelance Projects/Translator New/backend/instagram_service.py", "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "def " in line:
            print(f"{i}: {line.strip()}")
