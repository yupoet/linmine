# 设计：糖果皮肤（《开心商店》画风）+ 可切换主题系统

日期：2026-09-05 · 状态：已裁决（Fable），进入实施
关联：`docs/art/STYLE_BIBLE.md`（画风定义）、`CLAUDE.md`（架构红线）

## 1. 目标

1. 新增 **candy（糖果）** 皮肤：按 STYLE_BIBLE 1:1 还原《开心商店》的画风语言（明亮奶油底、巧克力描边、Q 版、糖果饱和色、厚边按钮）。
2. 保留现有外观为 **ember（余烬）** 皮肤，像素级不变。
3. 玩家可在设置里切换，选择持久化到存档；启动时无闪烁。
4. 默认皮肤 = candy（新老玩家一致；老玩家可切回）。

非目标：不改玩法、数值、关卡；不引入贴图文件、网络字体、第三方素材；不改 `core/` 规则。

## 2. 架构决策

### 2.1 主题标识放在 config

`src/config/theme.ts`（新，纯数据）：

```ts
export const THEME_IDS = ['candy', 'ember'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'candy';
export function isThemeId(v: unknown): v is ThemeId
```

理由：`core/save.ts` 需要校验/迁移该字段，core 只能依赖 config；render/ui 也从这里取类型。

### 2.2 存档

- `ProfileSettings.theme: ThemeId`，`createProfile()` 默认 `DEFAULT_THEME`；`sanitizeProfile` 非法值回落默认。
- `SAVE_SCHEMA_VERSION` 1 → **2**，`migrateProfile` 增加 `version < 2` 步：补 `settings.theme = DEFAULT_THEME`。
- `platform/storage.ts` 每次保存时**额外**写明文镜像键 `linmine.theme=<ThemeId>`（仅供启动脚本读，不参与校验和；损坏/缺失时忽略）。

### 2.3 契约（`src/app/contracts.ts`，app 层拥有，本次由 app 层工作流修改）

```ts
SettingsView.theme: ThemeId
UIHandlers.setTheme(theme: ThemeId): void
UIAPI.setTheme(theme: ThemeId): void      // 设 <html data-theme> 与 .ui[data-theme]
RendererAPI.setTheme(theme: ThemeId): void // 重建视觉资源并重放当前 RunState
```

`RendererOptions` 不变；渲染器以 `DEFAULT_THEME` 构造，`game.boot()` 与其他设置一起调用 `renderer.setTheme(profile.settings.theme)`（同 `setReducedMotion` 的位置）。切换语言重建 UI 后，`createUI` 从 `document.documentElement.dataset.theme` 读取初始主题，因此无需额外补调用。

### 2.4 启动无闪烁

`index.html` 在 `<head>` 内联脚本（≤10 行）：`try { localStorage.getItem('linmine.theme') } catch {}` → 校验属于 `candy|ember` → `document.documentElement.dataset.theme = id`，缺省 `candy`。启动样式改为 `html[data-theme="ember"] { --boot-bg ... }` / `html[data-theme="candy"] {...}` 双套变量；`#boot`/`#fatal` 只用变量。

`manifest.webmanifest` 的 `theme_color/background_color` 与 `favicon.svg` 采用 candy 配色（单一，不随主题切换）。

### 2.5 渲染层主题对象

`src/render/themes/types.ts`：

```ts
export interface RenderTheme {
  id: ThemeId;
  shading: 'standard' | 'toon';        // ember=standard, candy=toon
  outline: { enabled: boolean; color: number; scale: number }; // candy: #5a3a1e, 1.045
  sky: number; deep: number; darkByRow: number;                // 氛围
  lights: { hemiSky: number; hemiGround: number; hemiIntensity: number; sun: number; sunIntensity: number; lamp: number; lampIntensity: number };
  blocks: Record<BlockKind, { base: number; shade: number; light: number }>; // 三段色
  grass: number;
  highlight: { affordable: number; tooExpensive: number; hovered: number };
  particles: { dust: number; hitFlash: number };
  popups: { cash: string; gold: string; repair: string; labelOk: string; labelNo: string };
  miner: MinerTheme; // 调色 + 比例（chibi | classic）
  decals: boolean;   // 特殊方块"表情"贴花（candy=true）
}
```

- `themes/ember.ts` 的值**全部**从现有硬编码搬入（`BLOCKS[kind].color/accent`、`miner.ts:15-21`、`blocks.ts:28/340-342`、`fx.ts:101`、`dom.ts:32-36/128`、`constants.ts` 天空/深色）。搬入后这些位置只读主题，不再有字面量。
- `themes/candy.ts` 按 STYLE_BIBLE §2/§4。
- `config/blocks.ts` 的 `color/accent` 字段保留（ember 主题引用它们），注释改为"ember 皮肤基色"。

### 2.6 `setTheme` 重建顺序（渲染器）—— 已按 codex 审阅修订

`setTheme(id)` 只记录 `pendingTheme`；真正重建在 `update(dt)` 开头、且 `playing === false` 时执行（挖掘序列中途重建会丢失已从 grid 移除但尚未播完的方块）。**不要**用 `setState` 触发重铺——它会 snap 相机。

1. id 相同则清空 pending 返回。
2. 保留：`state / targets / hover / 矿工位置与朝向 / 相机位置 / time / qualityScale`。
3. 清空粒子、震屏、DOM 弹出层；从场景移除旧的 BlockField（主网格 + 描边壳 + 贴花层**一起** dispose，三者共享 `instanceMatrix`，r169 dispose 无引用计数）、HighlightField、Miner、粒子池。
4. 用新主题构造 BlockField / HighlightField / Miner / Particles；更新现有灯对象参数（不新建灯），头灯按主题挂回矿工或替换为光晕。
5. 新 field `reset()`；清 `hitPending*`；`updateAtmosphere()`、`field.sync(state)`、`pulseGoal()`。
6. 恢复矿工可见性/位置/朝向；`highlights.set(gridWidth, targets, hover)`；`setReducedMotion` 现值重放。
7. `onWave/onLand` 回调由序列器持有，不受影响。

### 2.7 方块视觉技术（candy）

- **着色**：`MeshToonMaterial` + 3 级 `gradientMap`（DataTexture，NearestFilter），保留 `instanceColor`（three r169 的 toon 材质支持实例颜色）。三段色中的 shade/light 通过 toon 分段自然产生；`blocks.base` 作为实例色。
- **着色补充**：gradientMap 只做明度分段（取 R 通道），三段色的 shade/light 由分段自然产生，实例色 = `blocks.base`。candy 灯光：去掉头灯对方块的贡献（头灯改光晕 sprite）、半球光天/地同色、太阳方向改为约 `(-3, 6, 1)`，使顶/正/侧三面落在不同色阶（现有 `(3,6,8)` 会让顶面与正面同阶）。
- **描边**：第二个 `InstancedMesh`，几何为主几何的克隆并**沿法线外推 0.045**（不要用 `hull.scale`，object 缩放会同时缩放实例平移），`MeshBasicMaterial({color: outline, side: BackSide, fog: false, toneMapped: false})`，`renderOrder = 1`。与主网格**共享同一个 `instanceMatrix` InstancedBufferAttribute 对象**（`hull.instanceMatrix = field.mesh.instanceMatrix`）；`count` 与 `visible` **不会**跟随，须在 `add/removeAt/reset` 后镜像；`instanceColor` 留空。绘制调用 +1，顶点处理约 ×2。
- **圆角**：`RoundedBoxGeometry(1,1,1, segments 3, radius 0.16)`（ember 保持 2/0.09）。segments 3 ≈ 588 三角/块，512 块 + 壳 ≈ 60 万三角；若低端机 FPS 不达标退回 segments 2（radius 不变）。不用 4。
- **贴花（表情）**：一个额外 `InstancedMesh<PlaneGeometry, MeshBasicMaterial(alphaTest)>`，共享程序化 `CanvasTexture` 图集（每格 64px：炸药眼、钻头箭头 ×2 方向、补给十字笑脸、宝库金币、金/铜矿脉、出口星星），实例属性 `decalUv`（vec2 偏移）由 `onBeforeCompile` 注入。仅特殊方块 + 矿石有贴花；上限 `MAX_BLOCK_INSTANCES`。绘制调用 +1。
- **高亮**：沿用 HighlightField，颜色换主题值；candy 增加 `sun-lt` 呼吸。
- **粒子（candy）**：圆角几何 + toon + 共享矩阵描边壳，+1 绘制；碎屑/尘土/受击闪光颜色全部来自主题对象（ember 公式原样保留）。
- 绘制预算（candy 相对 ember）：实例化层 +3（方块壳、贴花、粒子壳），矿工 +11（微小网格）。无新纹理文件（图集为运行时 CanvasTexture，约 1 MiB 显存，无 mipmap）。

### 2.8 矿工（candy）

`miner.ts` 拆为 `miner.ts`（骨架 + `update(dt)` 动画，不变）+ `minerParts.ts`（两套 `buildParts(theme)`：classic = 现有尺寸；chibi = 头 0.5、身 0.3、头身 1:0.9、球形眼白 + 瞳孔 + 高光、`blossom` 腮红、`sun` 圆顶安全帽 + `cherry` 帽带、放大镐头）。肩/髋枢轴 y 由部件返回，rig 读取，不再写死 0.52/0.24。**保留部件层级**（合并会冻结四肢），candy 每个部件用 `RoundedBoxGeometry` + `MeshToonMaterial`（按颜色共享材质），描边为该部件几何克隆缩放 ×1.09、`BackSide` 的子网格，随父级旋转/挤压；细部件（眼睛、镐柄）不加壳或减小外推（以 grok 审阅为准）。candy 矿工约 22 次绘制（ember 保持 11）；后续如需优化再按刚性枢轴合并（身体/双臂/双腿 ≈ 10 次）。

### 2.9 UI 主题（CSS）

- `.ui` 增加 `[data-theme]`；**结构一份**，形状与颜色全部 token 化：新增形状 token `--border-w --outline-c --btn-edge --radius --radius-sm --text-stroke --panel-inset --shadow-lift`。
- `.ui[data-theme="ember"] {…}` = 现有值（像素不变，作为回归基线）；`.ui[data-theme="candy"] {…}` = STYLE_BIBLE §5。
- 形状差异（厚边按钮、描边字、红方关闭、文件夹标签、气泡尾巴）用 `[data-theme="candy"] .btn {…}` 等**最少量**覆盖块实现。
- 现有 token 外硬编码（`styles.css` 1044-1052 / 1650 / 1698-1710 / 1917-1925、`index.html` 启动样式）一并 token 化。
- `render/dom.ts` 内联颜色改读主题对象（§2.5），不读 CSS 变量（渲染层不依赖 UI 层）。
- 新增动效全部登记到 `.ui--calm` 与 `prefers-reduced-motion` 两个块。
- 视觉脚本依赖的类名不改：`.levelcard__name .title__name .title__tagline .switch__label .hud__depth-goal`。
- 设置屏新增"皮肤"分段选择（复用 `.langbtn` 模式），文案：`Skin` / `Candy` / `Ember` → zh `皮肤` / `糖果` / `余烬`。

## 3. 工作流拆分（并行，各自 git worktree）

| 流 | 负责 | 范围 | 产出验收 |
|---|---|---|---|
| P 主题管线 | Opus | §2.1–2.4：config/theme.ts、save.ts+迁移+测试、contracts.ts、game.ts、ui/settings.ts、ui/index.ts `setTheme`、storage 镜像键、index.html 启动脚本与双套变量、i18n、main.ts | `npm test` 新增 save 迁移/清洗测试；集成测试覆盖切换皮肤持久化 |
| R 渲染皮肤 | Opus | §2.5–2.8：themes/*、blocks.ts toon+描边+贴花、miner 拆分与 chibi、fx/dom/index 读主题、`setTheme` 重建 | `?dev=1` 绘制调用增量 ≤3；ember 截图与改前逐像素对比一致 |
| U UI 皮肤 | Opus | §2.9 CSS 全量 token 化与 candy 覆盖、图标补充、标题屏英雄区 | `visual.mjs` 双皮肤各跑一遍零报错；两皮肤截图人工复核 |
| A 品牌资产 | Sonnet | favicon.svg、manifest 颜色、icons PNG 重生成（Playwright 栅格化 SVG） | 文件替换，PWA 安装图标正确 |

契约衔接：P 与 R 都需要在 `contracts.ts` 的 `RendererAPI` 末尾加同一行 `setTheme(theme: ThemeId): void;`，U 只依赖 `data-theme` 属性名。合并顺序：P → R → U → A。

## 4. 验证

1. `npm run typecheck`、`npm test`（含新迁移测试）全绿；`npm run sim` 数值零漂移（未触碰 config 数值）。
2. `node scripts/visual.mjs`（新增 `THEME=candy|ember` 环境变量，脚本在启动前写 `linmine.theme`）两皮肤零 console 错误。
3. ember：改前/改后同种子同操作序列截图逐像素 diff ≤ 0.5%（允许抗锯齿噪声）。
4. candy：与 STYLE_BIBLE §7 DoD 逐条核对；外部模型（codex/kimi/grok）对照参考截图描述做盲审，我裁决。
5. 性能：`?dev=1` 中位 FPS ≥ 改前 90%；candy drawCalls 增量 ≤ 15（实例化层 ≤ 3 + 矿工壳）；ember drawCalls 与改前相同。

## 5. 风险

- toon 材质 + instanceColor 在个别 Android WebGL1 设备的兼容性 → 回退：检测 `capabilities.isWebGL2` 为假时 candy 用 standard 着色但保留描边与调色。
- 描边壳使 pixelRatio 自适应更早触发 → 验收里盯 FPS；可把壳 `segments` 降为 2。
- 存档 schema 升 2 → 迁移必须幂等且有测试；旧版 sw.js 缓存的 index.html 无启动脚本 → 首次更新可能闪一次，可接受。
