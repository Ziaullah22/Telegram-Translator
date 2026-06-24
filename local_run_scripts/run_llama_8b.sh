#!/bin/bash
# Optimized for RTX 3060 Ti (8GB VRAM)
# Runs Llama 3 8B with 16K context fully in VRAM

echo "Starting Llama 3 8B Instruct with 16K context..."
./build/bin/llama-server \
  -m Meta-Llama-3-8B-Instruct-Q4_K_M.gguf \
  -c 16384 \
  --port 8080 \
  -ngl 99
