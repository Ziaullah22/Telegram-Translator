#!/bin/bash

# Define paths (assumes you clone llama.cpp to your home directory: ~/llama.cpp)
LLAMA_DIR="$HOME/llama.cpp"
MODEL_PATH="models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf"

echo "=========================================================="
echo "      Linux Llama.cpp Qwen 35B CUDA GPU Server Runner     "
echo "=========================================================="
echo

# Check if model exists
if [ ! -f "$LLAMA_DIR/$MODEL_PATH" ]; then
    echo "[ERROR] Model file not found at: $LLAMA_DIR/$MODEL_PATH"
    echo "Please download the Qwen3.6-35B-A3B-UD-Q4_K_M.gguf model and put it inside $LLAMA_DIR/models/"
    exit 1
fi

# Run the llama-server with CUDA GPU acceleration
cd "$LLAMA_DIR"
./build/bin/llama-server \
  -m "$MODEL_PATH" \
  --mmproj "models/mmproj-BF16.gguf" \
  -ngl 99 \
  --n-cpu-moe 999 \
  --flash-attn on \
  --jinja \
  -c 32768 \
  -t 12 \
  -b 512 \
  -ub 128 \
  --cache-type-k q4_0 \
  --cache-type-v q4_0 \
  --mlock \
  --host 127.0.0.1 \
  --port 8080
