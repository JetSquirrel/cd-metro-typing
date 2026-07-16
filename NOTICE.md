# NOTICE

第三方来源与许可分项如下。本应用**不是**成都轨道集团官方产品；背景中的太阳神鸟意象为原创装饰，**不是**城市官方标识。

---

## 1. Taiwan Metro Typing（UI 结构衍生）

地图优先首页、选线聚焦 / 路线架、游戏全屏地图与站牌等交互布局，衍生自：

- 项目：https://github.com/ridemountainpig/tw-metro-typing  
- 作者：ridemountainpig  

**许可证状态：** 上游仓库截至查阅时**未声明开源许可证**（无 `LICENSE` 文件，GitHub `license` 字段为空）。因此**不能**默认按 MIT / Apache 等条款再授权或商用再分发该衍生部分。

本仓库在 NOTICE 中保留归因。成都线网数据、双语打字逻辑、报站音频管线、城市导视视觉令牌与文案为本仓库原创内容。

---

## 2. OpenStreetMap（线网站位与行政区几何）

站位坐标、线路关系、行政区轮廓等数据包含 OpenStreetMap 贡献内容：

- © OpenStreetMap contributors  
- 许可证：[Open Database License (ODbL) 1.0](https://www.openstreetmap.org/copyright)  
- 来源：https://www.openstreetmap.org / https://api.openstreetmap.org  

分发衍生数据库时，须遵守 ODbL 的署名与 share-alike 要求。应用代码选用何种许可证**不替代** ODbL 对 OSM 衍生数据的约束。

线路 13 / 27 / 30 的运营序列另参考公开开通公告与站名表，再与 OSM / Nominatim 坐标接合；运营核对请以[成都轨道集团线路图](https://www.chengdurail.com/ckfw/xlt.htm)为准。

---

## 3. Qwen3-TTS（合成报站）

到站播报为离线合成音频，使用 Qwen3-TTS：

- 项目：https://github.com/QwenLM/Qwen3-TTS  
- 许可证：Apache License 2.0  
- 本仓库所用说话人：Vivian（普通话）、Eric（四川话 / 成都口音）  

合成音频**与成都轨道集团无关**，不得表述为官方车载报站。普通话与四川话均为完整站名合成包（非官方车载录音）。

**分发方式：** `*.wav` **不**随 Git 仓库分发。生产环境存放在 Cloudflare R2（桶名 `cd-metro-typing-audio`），由本站 Worker 同源路径 `/audio/*` 提供；仓库仅保留 `public/audio/manifest.json` 索引。本地开发可在 `public/audio/` 放置 wav（已 gitignore）。

---

## 其他（可选参考，默认不随仓库分发）

### CPTOND-2025

可作为线下交叉核对的公开数据集（[CC BY 4.0](https://doi.org/10.6084/m9.figshare.29377427.v2)）。本项目默认**不**再分发该档案；其快照时间早于部分 2025 年末开通区段。

### 字体

界面字体来自 Google Fonts：Noto Sans SC、Noto Serif SC、DM Mono，各按其许可证使用。
