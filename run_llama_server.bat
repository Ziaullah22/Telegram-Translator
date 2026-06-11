@echo off
title Llama.cpp Qwen Server Runner
chcp 65001 >nul

:: Set your llama.cpp installation directory
set "LLAMA_DIR=C:\llama.cpp"
set "MODEL_PATH=models\Qwen3.6-35B-A3B-UD-Q4_K_M.gguf"

echo ==========================================================
echo           Local Llama.cpp Qwen 35B Server Runner          
echo ==========================================================
echo.

:: 1. Check if the llama.cpp directory exists
if not exist "%LLAMA_DIR%" (
    echo [ERROR] Llama.cpp directory not found at: %LLAMA_DIR%
    echo.
    echo Please follow these steps:
    echo 1. Create a folder named: C:\llama.cpp
    echo 2. Download "Windows x64 (CPU)" from:
    echo    https://github.com/ggerganov/llama.cpp/releases
    echo 3. Extract the downloaded zip contents directly into C:\llama.cpp
    echo.
    goto end
)

:: 2. Check if llama-server.exe exists
if not exist "%LLAMA_DIR%\llama-server.exe" (
    echo [ERROR] llama-server.exe was not found inside %LLAMA_DIR%
    echo.
    echo Please ensure you extracted all files from the zip into %LLAMA_DIR%
    echo.
    goto end
)

:: 3. Check if the model file exists
if not exist "%LLAMA_DIR%\%MODEL_PATH%" (
    echo [ERROR] Model file not found at: %LLAMA_DIR%\%MODEL_PATH%
    echo.
    echo Please follow these steps:
    echo 1. Create a folder named: %LLAMA_DIR%\models
    echo 2. Download the GGUF model file and rename it to:
    echo    Qwen3.6-35B-A3B-UD-Q4_K_M.gguf
    echo 3. Place it inside the %LLAMA_DIR%\models folder.
    echo.
    goto end
)

:: 4. If all checks pass, run the server
echo [SUCCESS] Everything is set up correctly.
echo Starting llama.cpp server on http://127.0.0.1:8080...
echo.
echo Running with:
echo  - 8 Threads (-t 8) matching your physical CPU cores
echo  - 0 GPU Layers (-ngl 0) running entirely on CPU
echo  - Reasoning budget = 0 (bypasses thinking tokens for instant response)
echo.

cd /d "%LLAMA_DIR%"
llama-server.exe ^
  -m "%MODEL_PATH%" ^
  -ngl 0 ^
  --n-cpu-moe 8 ^
  --flash-attn on ^
  --jinja ^
  --reasoning-budget 0 ^
  -c 4096 ^
  -np 1 ^
  -t 8 ^
  -b 512 ^
  -ub 128 ^
  --cache-type-k q4_0 ^
  --cache-type-v q4_0 ^
  --mlock ^
  --host 127.0.0.1 ^
  --port 8080

:end
echo.
pause
