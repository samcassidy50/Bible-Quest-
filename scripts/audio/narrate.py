#!/usr/bin/env python3
"""Records the verse narration with the Kokoro voice model (Apache 2.0, runs offline).

Reads every verse in content/source/retelling/*.txt and writes one MP3 per verse to
src/assets/narration/<BOOK>-<chapter>-<verse>.mp3, plus manifest.json with the exact text each
clip reads and its length. The game plays a clip only while its manifest text matches the verse,
so after changing a verse, re-run this script (a unit test fails until you do).

Setup once (Kokoro needs Python 3.10–3.12 and eSpeak NG):
    brew install espeak-ng
    python3.12 -m venv .venv-narration
    .venv-narration/bin/pip install "kokoro>=0.9,<1" soundfile
Run:
    .venv-narration/bin/python scripts/audio/narrate.py          # only new or changed verses
    .venv-narration/bin/python scripts/audio/narrate.py --all    # re-record everything
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "content" / "source" / "retelling"
OUT = ROOT / "src" / "assets" / "narration"
MANIFEST = OUT / "manifest.json"

VOICE = "af_bella"
SPEED = 0.9  # matches NARRATION_RATE in src/services/narration.ts
SAMPLE_RATE = 24000
# eSpeak NG from Homebrew: the copy bundled with Kokoro's phonemizer has broken paths on macOS.
ESPEAK_LIB = "/opt/homebrew/opt/espeak-ng/lib/libespeak-ng.dylib"
ESPEAK_DATA = "/opt/homebrew/opt/espeak-ng/share/espeak-ng-data"


def read_verses() -> dict[str, str]:
    verses: dict[str, str] = {}
    for path in sorted(SOURCE.glob("*.txt")):
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^([A-Z0-9]{3}) (\d+):(\d+) (.+)$", line.strip())
            if m:
                book, ch, v, text = m.groups()
                verses[f"{book} {int(ch)}:{int(v)}"] = text
    return verses


def clip_name(ref: str) -> str:
    book, cv = ref.split(" ")
    ch, v = cv.split(":")
    return f"{book}-{ch}-{v}.mp3"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="re-record every verse")
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    import misaki.espeak  # noqa: F401  (sets the bundled paths; override them next)
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    EspeakWrapper.set_library(ESPEAK_LIB)
    EspeakWrapper.set_data_path(ESPEAK_DATA)
    from kokoro import KPipeline

    verses = read_verses()
    old = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    pipe = KPipeline(lang_code=VOICE[0], repo_id="hexgrad/Kokoro-82M")

    manifest: dict[str, dict[str, object]] = {}
    for ref, text in verses.items():
        name = clip_name(ref)
        prev = old.get(ref)
        if not args.all and prev and prev.get("text") == text and (OUT / name).exists():
            manifest[ref] = prev
            continue
        audio = np.concatenate([a for _, _, a in pipe(text, voice=VOICE, speed=SPEED)])
        sf.write(OUT / name, audio, SAMPLE_RATE, format="MP3")
        manifest[ref] = {"file": name, "text": text, "ms": round(len(audio) / SAMPLE_RATE * 1000)}
        print(f"{ref}: {manifest[ref]['ms']} ms")

    for ref, entry in old.items():  # drop clips for verses no longer in the source
        if ref not in manifest:
            (OUT / str(entry["file"])).unlink(missing_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(manifest)} clips in {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
