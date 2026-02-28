import rarfile
import os

rarfile.UNRAR_TOOL = r"C:\Program Files\WinRAR\UnRAR.exe"
try:
    rarfile.tool_setup()
    print("RAR tool found and configured")
except Exception as e:
    print(f"RAR tool not working: {e}")
