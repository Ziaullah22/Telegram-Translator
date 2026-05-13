FROM python:3.12-slim

WORKDIR /app

# Install system dependencies + Playwright requirements + Xvfb + Xauth
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    wget \
    gnupg \
    xvfb \
    xauth \
    libgbm1 \
    libasound2 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and their system deps
RUN playwright install --with-deps chromium

# Copy the rest of the backend code
COPY . .

# Make sure the startup script is executable
RUN chmod +x /app/start.sh

# Start the engine using our robust startup script
CMD ["/app/start.sh"]
