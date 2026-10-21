#!/usr/bin/env python3
"""Builds the Chrome Web Store zip with only the files the extension needs (no tests, docs or store assets).
Works on macOS, Windows and Linux (Python 3.8+, standard library only).
Usage: python3 scripts/build.py [output.zip]   (default: dist/job-apply-assistant-v<version>.zip)"""
import json, os, sys, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INCLUDE = ['manifest.json', 'background.js', 'LICENSE', 'PRIVACY.md', 'lib', 'content', 'popup', 'options', 'onboarding', 'tailor', 'practice', 'cover', 'privacy', 'icons']
SKIP_NAMES = {'.DS_Store', 'Thumbs.db'}
SKIP_EXT = {'.svg'}  # icon sources; the PNGs are shipped

version = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))['version']
out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', f'job-apply-assistant-v{version}.zip'))
os.makedirs(os.path.dirname(out), exist_ok=True)
if os.path.exists(out):
    os.remove(out)
files = []
for item in INCLUDE:
    p = os.path.join(ROOT, item)
    if os.path.isfile(p):
        files.append(item)
        continue
    for d, dirs, names in os.walk(p):
        dirs.sort()
        for n in sorted(names):
            if n in SKIP_NAMES or (item == 'icons' and os.path.splitext(n)[1] in SKIP_EXT):
                continue
            files.append(os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, '/'))
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        info = zipfile.ZipInfo(f, date_time=(2026, 1, 1, 0, 0, 0))  # reproducible
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(os.path.join(ROOT, f), 'rb') as fh:
            z.writestr(info, fh.read())
print(f'built {out} ({os.path.getsize(out) // 1024} KB, {len(files)} files, version {version})')
