#!/usr/bin/env bash
python3 -m venv .venv && source .venv/bin/activate
pip3 install -r requirements.txt
uvicorn app:app --reload --port 8000
