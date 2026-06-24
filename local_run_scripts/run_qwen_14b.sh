#!/bin/bash
# Optimized for RTX 3060 Ti (8GB VRAM)
# Runs Qwen 2.5 14B with 16K context.
# Offloads 25 layers to GPU and runs the rest on CPU system memory to prevent VRAM OOM.

echo "Starting Qwen 2.5 14B Instruct with 16K context..."
./build/bin/llama-server \
  -m Qwen2.5-14B-Instruct-Q4_K_M.gguf \
  -c 16384 \
  --port 8080 \
  -ngl 25
