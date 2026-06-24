#!/bin/bash
# Optimized for RTX 3060 Ti (8GB VRAM)
# Runs Llama 3.1 8B with a large 32K context fully in VRAM

echo "Starting Llama 3.1 8B Instruct with 32K context..."
./build/bin/llama-server \
  -m Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf \
  -c 32768 \
  --port 8080 \
  -ngl 99 \
  --chat-template-kwargs '{"enable_thinking":false}'
