#!/bin/bash
# Optimized for RTX 3060 Ti (8GB VRAM)
# Runs Qwen 2.5 7B with 16K context fully in VRAM

echo "Starting Qwen 2.5 7B Instruct with 16K context..."
./build/bin/llama-server \
  -m Qwen2.5-7B-Instruct-Q4_K_M.gguf \
  -c 16384 \
  --port 8080 \
  -ngl 99
