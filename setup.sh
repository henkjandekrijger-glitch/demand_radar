#!/bin/bash
# Bouwt de video-werkplaats opnieuw op in een lege Vercel-sandbox (node22).
set -e
mkdir -p /vercel/s/v2 && cd /vercel/s/v2
R=https://raw.githubusercontent.com/henkjandekrijger-glitch/demand_radar/$1
for f in render.js video.html tts.py vo.txt; do curl -sfL "$R/$f" -o $f; done
[ -d node_modules/playwright ] || npm i -s playwright@1 ffmpeg-static >/tmp/npm.log 2>&1
node -e "console.log(require('ffmpeg-static'))" > ff.txt
npx -y playwright install --with-deps chromium >/tmp/pw.log 2>&1
python3 -m pip install -q kokoro-onnx soundfile >/tmp/pip.log 2>&1 || sudo python3 -m pip install -q kokoro-onnx soundfile >>/tmp/pip.log 2>&1
mkdir -p ko
[ -s ko/kokoro.onnx ] || curl -sfL https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx -o ko/kokoro.onnx
[ -s ko/voices.bin ] || curl -sfL https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin -o ko/voices.bin
curl -sfL https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg -o appstore.svg
curl -sfL https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png -o play.png
S=$(curl -sfL "https://itunes.apple.com/lookup?id=6786402997&country=us" | python3 -c "import sys,json;print(json.load(sys.stdin)['results'][0]['screenshotUrls'][0])")
curl -sfL "$S" -o as1.png
ls -la
