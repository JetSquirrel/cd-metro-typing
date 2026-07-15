# Chengdu Metro Typing · 成都地铁打字

在真实成都地图上选择地铁线路，沿着精确站位练习**中文 / 英文站名**打字。到站时可播放**普通话**或**四川话**（合成）报站。

> 独立作品，交互灵感来自台湾捷运打字练习类应用；本仓库为 clean-room 实现，未复制其源码。

## Features

- 17 条运营线路：1–10、13、17–19、27、30、S3（不含有轨电车蓉 2）
- 真实 WGS-84 站位与区间（OpenStreetMap）
- 计时 30 秒 / 整条线路两种模式
- 中英文输入（中文支持 IME 组字）
- 到站播报：静音 / 普通话 / 四川话
- 浅色 / 深色主题

## Quick start

```bash
npm install
npm run data:validate   # optional sanity check
npm run dev
```

Open `http://127.0.0.1:5173`.

```bash
npm test
npm run build
```

## Data pipeline

| Command | Purpose |
| --- | --- |
| `npm run data:fetch` | Snapshot OSM network + route_master + full routes via `api.openstreetmap.org` |
| `npm run data:build` | Merge OSM + [`data/manual-overrides.json`](data/manual-overrides.json) → `public/data/chengdu-metro.json` + districts TopoJSON |
| `npm run data:validate` | Fail on missing lines/coords/names, deferred stations, bad segments |
| `npm run data:refresh` | fetch → build → validate |

**Provenance**

- Geometry & many station names: © OpenStreetMap contributors ([ODbL 1.0](https://www.openstreetmap.org/copyright))
- Lines 13 / 27 / 30 sequences: curated from Wikipedia / opening notices (see overrides `asOf`)
- Deferred stations excluded: 玉虹路、分水、白仁店、芦葭
- CPTOND-2025 (CC BY 4.0) may be used as an offline cross-check only; it predates late-2025 openings
- Official map reference: [成都轨道集团线路图](https://www.chengdurail.com/ckfw/xlt.htm)

Snapshot date is recorded in `public/data/chengdu-metro.json` (`asOf` / `generatedAt`).

## Voice announcements

Scripts live in [`audio/scripts.json`](audio/scripts.json):

> 前方到站，{站名}。换乘站：{线路列表}。

Build-time synthesis uses [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (Apache-2.0):

- 普通话 → speaker `Vivian`
- 四川话 → speaker `Eric`（成都口音）

```bash
# one-time
python3 -m venv tools/audio/.venv
tools/audio/.venv/bin/pip install -r tools/audio/requirements.txt

npm run audio:scripts
# Prefer a local HF snapshot if hub access is flaky:
#   export QWEN_TTS_MODEL=~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/<hash>
npm run audio:generate -- --skip-existing
# or
npm run audio:placeholder       # silent stubs for UI wiring
tools/audio/.venv/bin/python tools/audio/generate_qwen_tts.py --limit 10 --voice sichuan --skip-existing
```

Clips are stored under `public/audio/{mandarin,sichuan}/` with `public/audio/manifest.json`.

Current pack status (paused to spare the machine):

- **普通话**: nearly full Qwen3-TTS render (~361/362)
- **四川话**: 5 real Eric samples + silent placeholders for the rest

Resume later without redoing finished files:

```bash
export QWEN_TTS_MODEL=~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/<hash>
PYTHONUNBUFFERED=1 npm run audio:generate -- --voice sichuan --skip-existing
# optional: finish any remaining Mandarin
PYTHONUNBUFFERED=1 npm run audio:generate -- --voice mandarin --skip-existing
```

**Important:** these are **synthetic / unofficial** announcements, not Chengdu Metro onboard audio. Do not present them as official broadcasts. Polyphonic / local pronunciations should be reviewed by a Sichuan speaker before public release.

Optional: install `ffmpeg` to emit Opus instead of WAV.

## Project layout

```
data/manual-overrides.json   # colors, deferred stations, manual lines 13/27/30
data/raw/                    # OSM snapshots (gitignored)
scripts/                     # fetch / build / validate / audio scripts
public/data/                 # playable metro + districts TopoJSON
public/audio/                # voice packs + manifest
src/                         # React app (Vite)
tools/audio/                 # Qwen3-TTS offline generator
```

## License & attribution

See [`NOTICE.md`](NOTICE.md). Application code is provided for this project; third-party data/models retain their own licenses.
