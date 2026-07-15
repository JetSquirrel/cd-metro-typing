#!/usr/bin/env python3
"""
Offline announcement generator using Qwen3-TTS CustomVoice.

Produces Mandarin (Vivian) and Sichuan (Eric) clips for each station script.
Requires: pip install qwen-tts soundfile numpy
Optional: ffmpeg for opus encoding.

This is a build-time tool only — models are not shipped to the browser.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "audio" / "scripts.json"
OUT_DIR = ROOT / "public" / "audio"
MANIFEST = OUT_DIR / "manifest.json"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def encode_opus(wav_path: Path, opus_path: Path) -> bool:
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(wav_path),
                "-c:a",
                "libopus",
                "-b:a",
                "32k",
                str(opus_path),
            ],
            check=True,
            capture_output=True,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", choices=["mandarin", "sichuan", "both"], default="both")
    parser.add_argument("--limit", type=int, default=0, help="Generate only first N scripts (debug)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--model",
        default="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        help="Hugging Face model id or local snapshot directory",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip clips whose wav already looks like a real render (>30KB)",
    )
    parser.add_argument(
        "--placeholder",
        action="store_true",
        help="Write silent placeholder wav/opus without loading Qwen3-TTS",
    )
    args = parser.parse_args()

    if not SCRIPTS.exists():
        print(f"Missing {SCRIPTS}; run: npm run audio:scripts", file=sys.stderr)
        return 1

    scripts = json.loads(SCRIPTS.read_text(encoding="utf-8"))
    stations = scripts["stations"]
    if args.limit:
        stations = stations[: args.limit]

    voices = []
    if args.voice in ("mandarin", "both"):
        voices.append(("mandarin", "Vivian", "Chinese"))
    if args.voice in ("sichuan", "both"):
        voices.append(("sichuan", "Eric", "Chinese"))

    existing = {}
    if MANIFEST.exists():
        try:
            existing = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = {}

    model = None
    if not args.placeholder and not args.dry_run:
        try:
            from qwen_tts import Qwen3TTSModel
            import soundfile as sf
            import numpy as np
        except ImportError:
            print(
                "qwen-tts / soundfile not installed. Use --placeholder or:\n"
                "  pip install qwen-tts soundfile numpy",
                file=sys.stderr,
            )
            return 1
        print(f"Loading Qwen3-TTS from {args.model} ...", flush=True)
        model = Qwen3TTSModel.from_pretrained(args.model)

    manifest = {
        "revision": scripts.get("revision", 1),
        "generatedAt": scripts.get("generatedAt"),
        "licenseNote": "Synthetic announcements via Apache-2.0 Qwen3-TTS; unofficial, not Chengdu Metro audio.",
        "voices": {
            "mandarin": dict((existing.get("voices") or {}).get("mandarin") or {}),
            "sichuan": dict((existing.get("voices") or {}).get("sichuan") or {}),
        },
    }

    def write_manifest() -> None:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for voice_key, speaker, language in voices:
        voice_dir = OUT_DIR / voice_key
        voice_dir.mkdir(parents=True, exist_ok=True)
        for index, station in enumerate(stations, start=1):
            stem = station["id"].replace("/", "-")
            wav_path = voice_dir / f"{stem}.wav"
            opus_path = voice_dir / f"{stem}.opus"
            text = station["text"]
            print(f"[{voice_key} {index}/{len(stations)}] {station['nameZh']}: {text}", flush=True)
            if args.dry_run:
                continue

            if (
                args.skip_existing
                and not args.placeholder
                and wav_path.exists()
                and wav_path.stat().st_size > 30_000
            ):
                path = f"/audio/{voice_key}/{stem}.wav"
                digest = sha256_file(wav_path)
                size = wav_path.stat().st_size
                entry = {
                    "nameZh": station["nameZh"],
                    "text": text,
                    "path": path,
                    "sha256": digest,
                    "bytes": size,
                    "engine": "qwen3-tts",
                }
                manifest["voices"][voice_key][station["id"]] = entry
                manifest["voices"][voice_key][station["nameZh"]] = entry
                continue

            if args.placeholder:
                import wave
                import struct

                rate = 24000
                n = int(rate * 0.35)
                with wave.open(str(wav_path), "w") as w:
                    w.setnchannels(1)
                    w.setsampwidth(2)
                    w.setframerate(rate)
                    frames = b"".join(struct.pack("<h", 0) for _ in range(n))
                    w.writeframes(frames)
            else:
                import soundfile as sf

                wavs, sr = model.generate_custom_voice(
                    text=text,
                    language=language,
                    speaker=speaker,
                    instruct="语气平稳、清晰，像地铁到站广播。",
                )
                sf.write(str(wav_path), wavs[0], sr)

            rel = f"/audio/{voice_key}/{stem}.opus"
            if encode_opus(wav_path, opus_path):
                path = rel
                digest = sha256_file(opus_path)
                size = opus_path.stat().st_size
                wav_path.unlink(missing_ok=True)
            else:
                path = f"/audio/{voice_key}/{stem}.wav"
                digest = sha256_file(wav_path)
                size = wav_path.stat().st_size

            entry = {
                "nameZh": station["nameZh"],
                "text": text,
                "path": path,
                "sha256": digest,
                "bytes": size,
                "engine": None if args.placeholder else "qwen3-tts",
            }
            manifest["voices"][voice_key][station["id"]] = entry
            manifest["voices"][voice_key][station["nameZh"]] = entry

            if index % 5 == 0:
                write_manifest()

    if not args.dry_run:
        write_manifest()
        print(f"Wrote {MANIFEST}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
