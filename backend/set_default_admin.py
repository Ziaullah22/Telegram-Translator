import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.admin_security import set_admin_password

def set_default_admin():
    password = "admin123"
    print(f"Setting admin password to: {password}")
    set_admin_password(password)
    print("✅ Admin password set successfully!")

if __name__ == "__main__":
    set_default_admin()
