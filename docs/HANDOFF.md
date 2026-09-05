# Lin Mine（林脉）交接文档

日期：2026-09-05（傍晚更新：糖果皮肤全流合入并上线）
状态：**已上线**，CI 自动部署
线上地址：https://linmine.yupoet.com
仓库：https://github.com/yupoet/linmine

---

## 0. 《开心商店》画风「糖果」皮肤 + 可切换主题 — **已完成**（2026-09-05）

按《开心商店 / Happy Mall Story》画风全面提升美术（奶油底、巧克力描边、Q 版、糖果饱和色、厚边按钮），**只还原风格语言，未复制任何素材**。原外观保留为 **ember（余烬）** 皮肤，**candy（糖果）** 为默认，设置页可切。设计定稿见 `docs/art/STYLE_BIBLE.md`（含 §2.3 色盲修订）与 `docs/superpowers/specs/2026-09-05-candy-skin-and-theme-system-design.md`；分流计划 `docs/superpowers/plans/2026-09-05-candy-skin-plan.md`。

四条工作流全部合入 main：P 主题管线（74810d8）、A 品牌资产（39c7364）、U UI 皮肤（5295620）、R 渲染皮肤（f06cea1，merge 3fda90c）。

R 流验收矩阵结果（全部通过）：

- typecheck 干净；`npm test` 161/161 绿；`npm run sim` 与 §3 表零漂移
- `THEME=ember` / `THEME=candy` 的 `visual.mjs`：console 错误均为 0
- ember 静态屏（标题/选关/配装）与基线逐像素差异 ≤ 0.1%（在动画帧噪声底以内；运行屏 04–06 未固定种子，两次相同代码的自差即达 27–89%，不具判定力）
- drawCalls：ember 13（与改前相同），candy 27 = **+14 ≤ 预算 +15**；swiftshader 下 FPS 两者持平（10–12，软渲染封顶，仅供参考）
- candy 截图对照 STYLE_BIBLE §7 六条 DoD 通过；11 种方块可辨（贴花修复后）；深层傍晚为薰衣草紫（`LILAC_DK 0x6f5b9e`），无纯黑

R 流收尾时由 kimi 修掉的两个问题（合并前）：

1. **贴花图集 V 轴翻转 bug**：`CanvasTexture` 默认 `flipY=true`，`decalRect` 原实现让第 0 行贴花采样到空的底部行（炸弹眼睛/钻头箭头/修复脸全不显示，exit↔repair 互换）。已在 `decals.ts` 修正并加断言测试。
2. **drawCalls 超预算**：chibi 矿工 28 个基础网格 + 9 壳使 candy 达 41–43（预算 ≤ ember+15=28）。已将静态部件簇合并为顶点色网格（torso+hips、helmet 簇、整张脸、镐头+镐刃），15 网格 + 8 壳 → 27。单测已钉死数量上限防回退。与计划 R5 的逐部件清单是有意偏差（视觉不变，部件名变为 `torsoHips`/`face` 等，`HULL_SKIP` 同步更新）。

已知小缺口（不阻塞）：same-id `setTheme` 的 dispose-spy 测试未做（`SceneRenderer` 需 WebGL 上下文，vitest 里不可行，仅有纯 gate 函数测试 `theme-rebuild-gate.test.ts`）；WebGL1 回退下 candy 沿用 toon 灯光参数，未真机截图核对。

### 0.5 待打磨（合入后）

- 标题屏中部空旷：candy 下让渲染器在 `state === null` 时摆一个 Q 版矿工待机姿势，标题屏背景对该区域透明（需要在 `contracts.ts` 加一个 showcase 开关，属 app 层改动）。
- 卡牌稀有度角星未做：`CardView` 没有 rarity 字段，先补数据再补样式。
- 按钮描边字：bible 写 1.5px，实际密集汉字在 1rem 会糊，U 流已改为奶油字配饱和底 1.5px、深字配奶油底 0，标题 3px；这是定稿，别改回去。

### 0.6 多模型协作约定（用户要求）

Sonnet 做审计与写计划，Opus 写代码（各自 git worktree），codex/kimi/grok 出独立方案与盲审，最终由裁决者读 diff、看截图、跑矩阵后合并。外部模型请从**不含 `.env` 的 worktree** 运行（仓库根目录有 gitignored 的 `.env`，含 Cloudflare 凭据）。

---

## 1. 一句话概述

移动 Web 优先的竖屏 3D 点击挖掘游戏（对标 Pocket Mine 2《趣味挖矿2》）。单指点方块 → 矿工走位挥镐 → 方块破坏与连锁 → 金币收集 → 耐久耗尽结算 → 局外升级（镐头/宝箱/卡牌）→ 再来一局。默认中文，名为「林脉」，可切英文。

## 2. 快速上手

```bash
npm install          # 依赖：three ^0.169、TS 5.6、Vite 5、Vitest 2、wrangler 4（dev）
npm run dev          # 本地开发 http://localhost:5173
npm run typecheck    # tsc --noEmit（strict，无未用变量）
npm test             # 161 个测试，必须全绿
npm run build        # typecheck + vite build → dist/
npm run sim          # 平衡模拟报告（scripts/sim.ts，可传参 runs/level pickaxeLevel）
npm run deploy       # build + wrangler pages deploy（本地手动部署，一般不用——CI 自动）
```

**调试参数**：URL 加 `?dev=1` 开性能浮层（FPS/drawCalls/instances）；`?seed=<n>` 固定种子可复现。`window.linmine.game` 暴露 `digCell(col,row)`（自动挖）、`handlers`（UI 事件）、`getRun()`/`getProfile()`、`digWaveSound/digLandSound`。

**可视化验证**：`node scripts/visual.mjs`（Playwright + `/usr/bin/google-chrome-stable`，截图到 /tmp/shots，检查 console 错误；先 `npm run build && npx vite preview --port 4173`）。同类：`visual-i18n.mjs`（语言切换）、`visual-p0.mjs`（P0 回归）。三者都接受 `THEME=candy|ember` 环境变量。`scripts/ui-shots.mjs` 是确定性 DOM 截图（隐藏 canvas、固定种子、强制 calm），用于 CSS 逐像素回归。Playwright 从 `/data/duchess/node_modules` 引入（机器本地路径）。

## 3. 架构（依赖方向不可逆）

```
render/ ui/ platform/  →  app/  →  core/ config/
```

| 层 | 目录 | 职责 | 红线 |
|---|---|---|---|
| **规则核心** | `src/core/` + `src/config/` | 确定性模拟：一局 = 纯函数(种子, 关卡, build, 指令) | **禁止** import Three.js、DOM、localStorage、Math.random、墙钟 |
| **应用编排** | `src/app/` | 状态机（7 屏）、view model 组装、事件分发 | 只编排不做规则 |
| **渲染** | `src/render/` | Three.js 视图；instanced 方块；挖掘动画时序器 | 只读 RunState，永不改状态 |
| **UI** | `src/ui/` | DOM 屏幕与 HUD，纯视图 | 只消费 view model，经 handlers 回调 |
| **平台** | `src/platform/` | storage（校验和+备份）、audio（WebAudio 合成）、clock、input | 无游戏逻辑 |
| **i18n** | `src/i18n/` | zh 词典（英文 key→中文），默认 zh | 新增文案必须加进词典 |

关键契约在 `src/app/contracts.ts`（app 层拥有；render/ui 只 import 不改）。

### 核心约定

- **世界坐标**：方块 (col,row) 中心 = `(worldX(col), worldY(row), 0)`，方块尺寸 1；矿工脚 y = `-row-0.5`。见 `render/constants.ts`。
- **RNG**：mulberry32 风格 `hash32` + 派生流；行惰性生成 = `hash(seed, salt, row)`，`GENERATION_LOOKAHEAD=24`。
- **连锁**：炸弹 Chebyshev 半径 1（3×3）、钻头直线 6 格，按**波次**结算（wave 0 = 被点方块免耐久）。
- **关卡结构**：6 列网格；`targetDepth` 行是**全宽 Exit 目标层**；其下 2 行基岩封底。5 条剧情矿道 + `daily_YYYYMMDD` 每日矿道（UTC 日期种子，选关列表首位，不占剧情解锁位）。
- **挖掘动画时序**（`render/index.ts` buildDig）：走格 0.1s/格 + 挥镐 0.16s + 连锁 stagger 0.09s，总预算 `DIG_BUDGET=0.75s` 可压缩；坠落不压缩。**音频是事件驱动**的：渲染器在真实命中帧回调 `onWave`/`onLand` → `game.digWaveSound/digLandSound`，不要退回 setTimeout 估算。
- **受击帧**：`BlockField.hit()`（白闪+抖动 0.1s）在 impact 前 0.1s 触发；实例槽交换时 hit 状态自动失效（removeAt/reset 有清理）。
- **存档**：localStorage `linmine.save`（校验和信封）+ `linmine.save.bak` 备份；损坏→备份→新档。schema **v2**（v2 新增 `settings.theme`），迁移阶梯在 `core/save.ts`。另有明文镜像键 `linmine.theme`，只供 `index.html` 启动脚本在模块加载前着色，不参与校验和。
- **主题系统**：`config/theme.ts`（`ThemeId = 'candy'|'ember'`，默认 candy）；契约 `UIHandlers/UIAPI/RendererAPI.setTheme`；UI 侧靠 `<html data-theme>` 与 `.ui[data-theme]`（`styles.css` 基础块即 ember，`theme-candy.css` 只覆盖 candy）；渲染侧靠 `src/render/themes/*` 的 `RenderTheme` 对象（渲染层**不得**读 CSS 变量）。
- **奖励只发一次**：`buildResult`（结算时）push 宝箱；`claimResult` 只清 pending。完美通关（>50% 耐久）首通 epic / 复通 rare。

### 数值现状（200 局模拟/关，镐 1 级无卡）

| 关 | 目标 | 胜率 | 平均金币 | 连锁/局 |
|---|---|---|---|---|
| 向阳矿坑 | 54m | 62.5% | 1241 | 10.6 |
| 铜砺峡谷 | 70m | 60.5% | 1856 | 13.7 |
| 深渊矿台 | 90m | 63.0% | 2681 | 17.6 |
| 熔岩之境 | 112m | 48.5% | 3474 | 20.5 |
| 漫漫长夜 | 140m | 43.5% | 4683 | 25.6 |

卡牌已按 kimi 评审重平衡（2026-09-05）：Deep Pockets +6%/级、Chain Bonus +35%/级、Loaded Crates 递减、Big Blast 半径 1/1/2/2/3、Rich Veins 附带矿石耐久 -1（`oreCostDelta`）。宝箱分档：木箱随机单卡；鎏金必出新卡；皇家必出新卡+跳级双倍（`profile.ts drawCardForTier`）。**改数值必跑 `npm run sim` 对比**。

## 4. 部署

- **CI 自动部署**（`.github/workflows/ci.yml`）：push 到 main → 质量门禁（typecheck/test/200 局平衡模拟/build）→ wrangler 部署 Cloudflare Pages 项目 `linmine`。Node 22（wrangler 4 硬要求）。
- **Secrets**（GitHub repo）：`CLOUDFLARE_API_TOKEN`（dufive 的 Pages CI token）+ `CLOUDFLARE_ACCOUNT_ID`。
- **域名**：`linmine.yupoet.com`（CNAME→linmine.pages.dev，proxied）+ `linmine.pages.dev`。
- **本地手动部署**（必要时）：`/data/linmine/.env` 有 token（gitignored），`source .env && npm run deploy`。Pages-scoped token 必须同时带 `CLOUDFLARE_ACCOUNT_ID`，否则 wrangler 的 /memberships 查询 403。
- 详细的 Cloudflare 凭据说明见记忆 `reference_cloudflare_deploy.md`（多项目共享 token，ytht-reborn 的 ZONE_ID 是错的）。

## 5. 质量门禁（改代码必做）

1. `npm run typecheck` 零错误
2. `npm test` 全绿（当前 161）
3. `npm run sim` 胜率/金币与上一版对比无异常漂移
4. `node scripts/visual.mjs` 零 console 错误
5. push → CI 绿 → 线上抽查

## 6. Kimi K3 评审结论与剩余工作

完整报告：`docs/REVIEW_KIMI.md`。总评 **B**（内核 A 级，外围不足）。已修完全部 P0（见 git d68bbfa）。

### 剩余 P1（建议顺序）

1. **输入缓冲 1→3 格**（`game.ts queuedTap`）：busy 期间连点不丢，心流加速
2. **每日 streak**：连续完成每日矿道第 3/7 天给 rare/epic（UTC 日期键已有：`levels.ts currentDailyKey`）
3. **结算页升级进度条**：「距下一镐升级还差 X 金币」（次留最便宜杠杆）
4. **存档导出/导入**：JSON 下载上传，对冲丢档流失（半天工作量）
5. **波内逐格 12ms 蔓延爆裂**：大连锁的扩散感（`render/index.ts breakWave` 目前同波同帧）
6. **出口层下的"奖励层"深层宝箱**（2026-09-05 立项想法）：打穿出口层后胜利锁定但不结算，脚下多 2–4 行奖励层，箱子**可见**、靠剩余耐久精确规划够到（不藏、不靠欧气；可保留极低概率"暗格"彩蛋）。列位置与周围石材随机。用 `npm run sim` 把"通关且拿箱"率调到镐 1 级 25–35%、满级 ~80%。箱内放皮肤类奖励（镐/帽/整体皮肤，接主题系统），不冲击金币经济。商业化挂点：差一两点耐久时"看广告 +5 耐久"（每局一次）、结算"看广告双倍开箱"、每日矿道"看广告再来一次"；红线：胜利本身不卖。需改 `core/run.ts` 胜利判定、`core/generation.ts` 封底、加"收工"按钮与结算展示。

### P2

- 成就系统（`LifetimeStats` 已埋好数据）
- 本地最佳深度排行榜
- 金币飞向 HUD 的收口动画
- 移除/只读化 `window.linmine`（上任何排行榜前必须）
- 合规：海外路线补隐私政策/用户协议（约 1 周）；大陆路线需版号+防沉迷（6 个月级，需尽早决策）
- 商业化定调：海外=激励广告（复活/双倍结算）+去广告 IAP；大陆=先版号

## 7. 已知限制 / 坑

- **截图可读性因工具而异**：Claude Code 会话可用 Read 直接看 PNG；其他 CLI 可能不行。稳妥做法是 Playwright 脚本的 DOM 断言 + 截图存档人工复核。
- **余额经济**：全部内容约 4.8 万金币可买穿（镐 35k + 卡池），重度玩家 3-5 天毕业——长期消耗口（皮肤/第 4 卡槽）是 P1 之后的事。
- **防作弊为零**：纯前端结算 + `window.linmine` 调试口。单机无碍，上排行榜前必须处理。
- i18n 新增字符串若忘进 `src/i18n/index.ts` 词典，中文界面会漏英文——typecheck 不报，需人工留意。
- kimi CLI 在 `/home/paris/.kimi-code/bin/kimi`（K3 模型），非交互 `-p "<prompt>"`，在项目目录跑可读源码。评审 prompt 存档可从 git 历史或会话记录复原。

## 8. 相关文档

- `PROJECT_PLAN.md` — 立项计划 v1.2（MVP 范围、里程碑、风险）
- `docs/REVIEW_KIMI.md` — K3 腾讯级评审全文摘要
- `docs/ASSETS.md` / `THIRD_PARTY_NOTICES.md` — 资产与许可合规（全原创/合成，无第三方素材）
- `README.md` — 项目简介
