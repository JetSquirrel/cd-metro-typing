# Chengdu Metro Typing · 成都地铁打字

在真实成都地图上选择地铁线路，沿着精确站位练习**中文 / 英文站名**打字。到站时可播放**普通话**或**四川话**合成报站。

视觉与交互布局衍生自 [ridemountainpig/tw-metro-typing](https://github.com/ridemountainpig/tw-metro-typing) 的地图优先结构；本仓库以成都线网、双语站名与城市导视风格重新实现内容与样式，并保留本地数据管线与报站能力。详见 [`NOTICE.md`](NOTICE.md)。

## Features

- 17 条运营线路：1–10、13、17–19、27、30、S3（不含有轨电车蓉 2）
- 真实 WGS-84 站位与区间（OpenStreetMap）
- 计时 30 秒 / 整条线路两种模式
- 中英文输入（中文支持 IME 选字；错误字符不推动列车）
- 到站播报：静音 / 普通话 / 四川话
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

**Hosting:** `*.wav` 不进 Git。本地可生成在 `public/audio/{mandarin,sichuan}/`（已 gitignore）；生产由 Cloudflare R2 桶 `cd-metro-typing-audio` 托管，Worker 同源提供 `/audio/*.wav`。仓库只保留轻量 [`public/audio/manifest.json`](public/audio/manifest.json)。播放解析优先 **stationId**。

```bash
# one-time TTS toolchain
python3 -m venv tools/audio/.venv
tools/audio/.venv/bin/pip install -r tools/audio/requirements.txt

npm run audio:scripts
# Prefer a local HF snapshot if hub access is flaky:
#   export QWEN_TTS_MODEL=~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/<hash>
npm run audio:generate -- --skip-existing

# Create R2 bucket once, then upload local wavs
npx wrangler r2 bucket create cd-metro-typing-audio
npm run audio:upload
# npm run audio:upload -- --voice mandarin
# npm run audio:upload -- --dry-run

npm run deploy
```

可选：`VITE_AUDIO_BASE=https://other-origin` 将 manifest / 片段指到外部前缀（默认空 = 同源 `/audio`）。

Current pack status (see `manifest.json`):

- **普通话**: full Qwen3-TTS render (speaker Vivian)
- **四川话**: full Qwen3-TTS render (speaker Eric / 成都口音)

**Important:** these are **synthetic / unofficial** announcements, not Chengdu Metro onboard audio.

## Project layout

```
data/manual-overrides.json   # colors, deferred stations, manual lines 13/27/30
data/raw/                    # OSM snapshots (gitignored)
scripts/                     # fetch / build / validate / audio / R2 upload
public/data/                 # playable metro + districts TopoJSON
public/audio/manifest.json   # voice index (wavs are local-only / R2)
workers/audio-assets.js      # SPA assets + R2 /audio proxy
src/                         # React app (Vite)
tools/audio/                 # Qwen3-TTS offline generator
```

## License & attribution

第三方来源与许可分项见 [`NOTICE.md`](NOTICE.md)：

1. **TW Metro Typing** — UI 结构衍生来源；上游**未声明许可证**  
2. **OpenStreetMap** — 线网数据，ODbL 1.0  
3. **Qwen3-TTS** — 合成报站，Apache-2.0  

应用自有代码尚未单独发布 `LICENSE` 文件；第三方数据与模型仍按其原许可证约束。
