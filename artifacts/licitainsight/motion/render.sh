#!/usr/bin/env bash
# Renders the HyperFrames compositions in motion/ into public/motion/ (committed; nothing here runs in Docker or Vercel).
# Needs Node 22+, FFmpeg and macOS: the Safari file is HEVC with alpha, encoded by VideoToolbox.
set -euo pipefail
cd "$(dirname "$0")"

HF=hyperframes@0.8.140
OUT=../public/motion
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1
mkdir -p "$OUT"

# Logo ink: `--petroleo` on light surfaces, `--lima-marca` on dark ones.
for comp in pardal-assinatura pardal-raio-x; do
  pnpm dlx "$HF" lint "$comp"
  for ink in petroleo:#164c49 lima:#bfe17c; do
    name="$comp-${ink%%:*}"
    vars="{\"ink\":\"${ink#*:}\"}"
    pnpm dlx "$HF" render "$comp" --format webm --crf 34 --variables "$vars" --output "$OUT/$name.webm"
    pnpm dlx "$HF" render "$comp" --format mov --variables "$vars" --output "$TMP/$name.mov"
    ffmpeg -y -loglevel error -i "$TMP/$name.mov" -an \
      -c:v hevc_videotoolbox -alpha_quality 0.75 -q:v 55 -tag:v hvc1 "$OUT/$name.mov"
    ffmpeg -y -loglevel error -sseof -0.2 -i "$TMP/$name.mov" -update 1 -frames:v 1 -pix_fmt rgba "$OUT/$name.png"
  done
done

ls -lh "$OUT"
