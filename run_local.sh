#!/bin/bash
# Interactive Llama.cpp model launcher optimized for RTX 3060 Ti (8GB VRAM)

echo "=========================================================="
echo "   🦙 Interactive Local Model Launcher (llama.cpp) 🦙"
echo "=========================================================="
echo "Select the model you want to run:"
echo "1) Qwen 3.5 9B      (32K Context - Fully on GPU)"
echo "2) Qwen 3.5 4B      (32K Context - Fully on GPU, Super Fast)"
echo "3) Llama 3.1 8B     (32K Context - Fully on GPU)"
echo "4) Qwen 2.5 7B      (16K Context - Fully on GPU)"
echo "5) Qwen 2.5 14B     (16K Context - Optimized GPU/CPU split)"
echo "6) Qwen 2.5 35B     (16K Context - Optimized GPU/CPU split)"
echo "=========================================================="
read -p "Enter selection (1-6): " choice

case $choice in
  1)
    echo "Starting Qwen 3.5 9B Instruct..."
    ./build/bin/llama-server -m qwen3.5-9b-q4_k_m.gguf -c 32768 --port 8080 -ngl 99 --chat-template-kwargs '{"enable_thinking":false}'
    ;;
  2)
    echo "Starting Qwen 3.5 4B Instruct..."
    ./build/bin/llama-server -m qwen3.5-4b-q4_k_m.gguf -c 32768 --port 8080 -ngl 99 --chat-template-kwargs '{"enable_thinking":false}'
    ;;
  3)
    echo "Starting Llama 3.1 8B Instruct..."
    ./build/bin/llama-server -m Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf -c 32768 --port 8080 -ngl 99 --chat-template-kwargs '{"enable_thinking":false}'
    ;;
  4)
    echo "Starting Qwen 2.5 7B Instruct..."
    ./build/bin/llama-server -m Qwen2.5-7B-Instruct-Q4_K_M.gguf -c 16384 --port 8080 -ngl 99
    ;;
  5)
    echo "Starting Qwen 2.5 14B Instruct..."
    ./build/bin/llama-server -m Qwen2.5-14B-Instruct-Q4_K_M.gguf -c 16384 --port 8080 -ngl 25
    ;;
  6)
    echo "Starting Qwen 2.5 35B Instruct..."
    ./build/bin/llama-server -m Qwen2.5-32B-Instruct-Q4_K_M.gguf -c 16384 --port 8080 -ngl 12
    ;;
  *)
    echo "Invalid selection."
    exit 1
    ;;
esac
