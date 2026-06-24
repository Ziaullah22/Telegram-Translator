#!/bin/bash
# Optimized for RTX 3060 Ti (8GB VRAM)
# Runs Qwen 3.5 9B with 32K context fully in VRAM

echo "Starting Qwen 3.5 9B Instruct with 32K context..."
./build/bin/llama-server \
  -m qwen3.5-9b-q4_k_m.gguf \
  -c 32768 \
  --port 8080 \
  -ngl 99 \
  --chat-template-kwargs '{"enable_thinking":false}'
