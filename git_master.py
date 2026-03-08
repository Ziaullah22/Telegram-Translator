import os
import subprocess
import sys
import tkinter as tk
from tkinter import messagebox, simpledialog

# Try to use CustomTkinter for a premium look, fallback to standard Tkinter
try:
    import customtkinter as ctk
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    USE_CUSTOM = True
except ImportError:
    USE_CUSTOM = False

class GitMasterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("⚡ Git Master - Translator Project")
        self.root.geometry("700x550")
        
        if USE_CUSTOM:
            self.setup_custom_ui()
        else:
            self.setup_standard_ui()

    def setup_custom_ui(self):
        # Modern Dark Theme UI
        self.frame = ctk.CTkFrame(self.root, corner_radius=15)
        self.frame.pack(padx=20, pady=20, fill="both", expand=True)

        self.label = ctk.CTkLabel(self.frame, text="TRANSLATOR PROJECT HUB", font=("Inter", 24, "bold"))
        self.label.pack(pady=(20, 10))

        self.desc = ctk.CTkLabel(self.frame, text="One-click GitHub synchronization", font=("Inter", 12))
        self.desc.pack(pady=(0, 20))

        # Button Container
        self.btn_frame = ctk.CTkFrame(self.frame, fg_color="transparent")
        self.btn_frame.pack(pady=10)

        self.push_btn = ctk.CTkButton(self.btn_frame, text="🚀 PUSH UPDATES", font=("Inter", 14, "bold"), 
                                      height=45, fg_color="#2563eb", hover_color="#1d4ed8", 
                                      command=self.push_updates)
        self.push_btn.grid(row=0, column=0, padx=10, pady=10)

        self.pull_btn = ctk.CTkButton(self.btn_frame, text="📥 PULL LATEST", font=("Inter", 14, "bold"), 
                                      height=45, fg_color="#4b5563", hover_color="#374151",
                                      command=self.pull_updates)
        self.pull_btn.grid(row=0, column=1, padx=10, pady=10)

        self.status_btn = ctk.CTkButton(self.btn_frame, text="📜 CHECK STATUS", font=("Inter", 14, "bold"), 
                                        height=45, fg_color="#10b981", hover_color="#059669",
                                        command=self.check_status)
        self.status_btn.grid(row=0, column=2, padx=10, pady=10)

        # Output Box
        self.output_text = ctk.CTkTextbox(self.frame, width=600, height=200, font=("Consolas", 12))
        self.output_text.pack(padx=20, pady=20, fill="both", expand=True)
        self.log("Ready. Select an action above.")

    def setup_standard_ui(self):
        # Fallback UI if customtkinter is missing
        tk.Label(self.root, text="Git Master (Classic Mode)", font=("Arial", 16, "bold")).pack(pady=10)
        
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(pady=10)

        tk.Button(btn_frame, text="Push Updates", command=self.push_updates, bg="#2563eb", fg="white", width=15).pack(side="left", padx=5)
        tk.Button(btn_frame, text="Pull Latest", command=self.pull_updates, bg="#4b5563", fg="white", width=15).pack(side="left", padx=5)
        tk.Button(btn_frame, text="Check Status", command=self.check_status, bg="#10b981", fg="white", width=15).pack(side="left", padx=5)

        self.output_text = tk.Text(self.root, height=15, width=80)
        self.output_text.pack(padx=10, pady=10)
        self.log("CustomTkinter not found. Using standard mode. Run 'pip install customtkinter' for the premium UI.")

    def log(self, message):
        self.output_text.insert("end", f"> {message}\n")
        self.output_text.see("end")

    def run_git(self, commands):
        try:
            for cmd in commands:
                self.log(f"Running: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                if result.stdout:
                    self.log(result.stdout)
            return True
        except subprocess.CalledProcessError as e:
            self.log(f"ERROR: {e.stderr}")
            messagebox.showerror("Git Error", f"Command failed: {e.stderr}")
            return False

    def push_updates(self):
        msg = simpledialog.askstring("Commit Message", "What did you change? (e.g., 'Fixed bug in chat')")
        if not msg:
            return
        
        self.log("Starting push process...")
        success = self.run_git([
            ["git", "add", "."],
            ["git", "commit", "-m", msg],
            ["git", "push"]
        ])
        if success:
            messagebox.showinfo("Success", "🚀 Updates pushed successfully to GitHub!")
            self.log("✅ PUSH COMPLETE")

    def pull_updates(self):
        self.log("Fetching latest changes from GitHub...")
        success = self.run_git([["git", "pull"]])
        if success:
            messagebox.showinfo("Success", "📥 Pulled latest changes successfully!")
            self.log("✅ PULL COMPLETE")

    def check_status(self):
        self.log("Checking modified files...")
        self.run_git([["git", "status"]])

if __name__ == "__main__":
    if USE_CUSTOM:
        root = ctk.CTk()
    else:
        root = tk.Tk()
    
    app = GitMasterApp(root)
    root.mainloop()
