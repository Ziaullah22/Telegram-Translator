#!/bin/bash

# 1. Clean up any old Xvfb lock files (Very important for Docker)
rm -f /tmp/.X99-lock
rm -rf /tmp/.X11-unix

# 2. Start Xvfb in the background on Display 99
Xvfb :99 -screen 0 1280x1024x24 &

# 3. Wait a moment for Xvfb to be ready
sleep 2

# 4. Set the DISPLAY environment variable
export DISPLAY=:99

# 5. Force install setuptools at runtime to fix pkg_resources error
pip install setuptools --quiet

# 6. Start the backend
uvicorn main:app --host 0.0.0.0 --port 8000
