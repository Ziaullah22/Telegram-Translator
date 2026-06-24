#!/bin/bash
# Optimized for RTX 3060 Ti (8GB VRAM)
# Runs Qwen 3.5 4B with 32K context fully in VRAM (Ultra Fast)

echo "Starting Qwen 3.5 4B Instruct with 32K context..."
./build/bin/llama-server \
  -m qwen3.5-4b-q4_k_m.gguf \
  -c 32768 \
  --port 8080 \
  -ngl 99 \
  --chat-template-kwargs '{"enable_thinking":false}'
