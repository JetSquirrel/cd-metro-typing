# Chengdu Metro Typing · 成都地铁打字

在真实成都地图上选择地铁线路，沿着精确站位练习**中文 / 英文站名**打字。到站时可播放**普通话**或**四川话（测试）**合成报站。

视觉与交互布局衍生自 [ridemountainpig/tw-metro-typing](https://github.com/ridemountainpig/tw-metro-typing) 的地图优先结构；本仓库以成都线网、双语站名与城市导视风格重新实现内容与样式，并保留本地数据管线与报站能力。详见 [`NOTICE.md`](NOTICE.md)。

## Features

- 17 条运营线路：1–10、13、17–19、27、30、S3（不含有轨电车蓉 2）
- 真实 WGS-84 站位与区间（OpenStreetMap）
- 计时 30 秒 / 整条线路两种模式
- 中英文输入（中文支持 IME 选字；错误字符不推动列车）
- 到站播报：静音 / 普通话 / 四川话（测试片段）
- 成都城市导视浅色 / 深色主题

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

| Command                 | Purpose                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run data:fetch`    | Snapshot OSM network + route_master + full routes via `api.openstreetmap.org`                                                  |
| `npm run data:build`    | Merge OSM + [`data/manual-overrides.json`](data/manual-overrides.json) → `public/data/chengdu-metro.json` + districts TopoJSON |
| `npm run data:validate` | Fail on missing lines/coords/names, deferred stations, bad segments                                                            |
| `npm run data:refresh`  | fetch → build → validate                                                                                                       |

**Provenance**

- Geometry & many station names: © OpenStreetMap contributors ([ODbL 1.0](https://www.openstreetmap.org/copyright))
- Lines 13 / 27 / 30 sequences: curated from Wikipedia / opening notices (see overrides `asOf`)
- Deferred stations excluded: 玉虹路、分水、白仁店、芦葭
- CPTOND-2025 (CC BY 4.0) may be used as an offline cross-check only; it predates late-2025 openings
- Official map reference: [成都轨道集团线路图](https://www.chengdurail.com/ckfw/xlt.htm)

Snapshot date is recorded in `public/data/chengdu-metro.json` (`asOf` / `generatedAt`).

## Voice announcements

Scripts live in [`audio/scripts.json`](audio/scripts.json):

> 前方到站，{站名}。可换乘{线路}。

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

Clips are stored under `public/audio/{mandarin,sichuan}/` with `public/audio/manifest.json`. Playback resolves clips by **stationId** first so transfer hubs do not reuse another line's audio.

Current pack status:

- **普通话**: nearly full Qwen3-TTS render
- **四川话**: mostly placeholders / sample clips — UI 标注为「测试」，勿对外承诺完整覆盖

Resume later without redoing finished files:

```bash
export QWEN_TTS_MODEL=~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/<hash>
PYTHONUNBUFFERED=1 npm run audio:generate -- --voice sichuan --skip-existing
```

**Important:** these are **synthetic / unofficial** announcements, not Chengdu Metro onboard audio. Do not present them as official broadcasts.

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
