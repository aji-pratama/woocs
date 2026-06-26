#!/usr/bin/env bash

# Go to the backend directory relative to the script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR" || exit 1

echo "Ensuring formatters are installed..."
if ! .venv/bin/python -m pip show black > /dev/null 2>&1; then
    .venv/bin/pip install -q black
fi

if ! .venv/bin/python -m pip show isort > /dev/null 2>&1; then
    .venv/bin/pip install -q isort
fi

echo "Sorting imports with isort..."
.venv/bin/isort .

echo "Formatting code with Black (PEP8 spacing)..."
# Black automatically ensures:
# - 2 blank lines before top-level functions and classes
# - 1 blank line before class methods
# - Standard PEP8 indentation and line wrapping
.venv/bin/black .

echo "Formatting complete!"
