import os

def search():
    target = "Evaluating"
    target2 = "ollama-local"
    workspace_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(f"Searching in {workspace_dir}...")
    for root, dirs, files in os.walk(workspace_dir):
        if "venv" in root or ".git" in root or "__pycache__" in root or "node_modules" in root:
            continue
        for file in files:
            if file.endswith(".py"):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines):
                        if target in line or target2 in line:
                            print(f"MATCH: {path}:{idx+1}: {line.strip()}")
                except Exception as e:
                    pass

if __name__ == "__main__":
    search()
