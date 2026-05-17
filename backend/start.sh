#!/bin/bash

# 1. Clean up any old Xvfb lock files (Very important for Docker)
rm -f /tmp/.X99-lock
rm -rf /tmp/.X11-unix

# 2. Start Xvfb in the background on Display 99
Xvfb :99 -screen 0 1280x1024x24 &
XVFB_PID=$!
echo "✅ Xvfb started (PID=$XVFB_PID)"

# 3. Wait for Xvfb to be ready
sleep 3

# 4. Set the DISPLAY environment variable
export DISPLAY=:99

# 4.5 Start the Window Manager (Fluxbox) so wmctrl works!
fluxbox &
echo "✅ Fluxbox window manager started"

# 5. Force install setuptools at runtime to fix pkg_resources error
pip install setuptools --quiet

# 6. Start VNC Server (background) — broadcasts the Xvfb screen
x11vnc -display :99 -forever -shared -bg -nopw -rfbport 5900
echo "✅ x11vnc started on port 5900"

sleep 1

# 7. Start noVNC web player (try multiple known paths)
if [ -f /usr/share/novnc/utils/novnc_proxy ]; then
    /usr/share/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080 &
elif [ -f /usr/share/novnc/utils/launch.sh ]; then
    /usr/share/novnc/utils/launch.sh --vnc localhost:5900 --listen 6080 &
else
    websockify --web /usr/share/novnc 6080 localhost:5900 &
fi
echo "✅ noVNC proxy started on port 6080"

sleep 1

# 8. Start the backend
echo "🚀 Starting FastAPI backend..."
uvicorn main:app --host 0.0.0.0 --port 8000
