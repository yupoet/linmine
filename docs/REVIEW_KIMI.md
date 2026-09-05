# Kimi K3 腾讯级评审报告（2026-09-05）

总体评级：**B**（内核 A 级原型，外围系统不及格）

| 维度 | 分数 |
|---|---|
| 可玩性 | 6.5 |
| 留存 | 3.0 |
| 商业化与经济 | 3.0 |
| 表现力 | 6.0 |
| 风险与合规 | 3.0（大陆）/ 5.0（海外）|

## P0 行动项（按 ROI 排序）

1. **接通每日矿道 + 修三个实锤 bug**（1-2 天）
   - daily level 生成代码已有但无入口（levels.ts:194-233 死代码）
   - 每日首通错误解锁剧情第 2 关（profile.ts:143-146）
   - daily 战绩被 sanitizeProfile 丢弃（save.ts:115-126）
   - 通关宝箱双发（game.ts:494 buildResult push + game.ts:621 claimResult 再 push）
2. **打击感修复包**（2-3 天）
   - 音频墙钟估算错位（game.ts:330 步数×110+160 vs 渲染实际 DIG_BUDGET 压缩），改事件驱动
   - 方块受击帧：白闪 + 80ms 抖动缩放再碎裂；连锁≥3波 hit-stop 40-60ms
   - 常规挥镐 8-15ms 轻震动；CHAIN 阈值 6→3
3. **经济重做**
   - 宝箱定价倒挂：木箱单卡 310 < 鎏金 535 < 皇家 1033，最贵是严格劣选项
   - 通胀：Deep Pockets +10%→+6%/级，Chain Bonus +60%→+35%/级
   - Big Blast 统治解削弱；Rich Veins 陷阱卡（41%→13%）加保底
   - flawlessRewardTier 死代码接线（完美通关 epic 箱）

## P1
- 输入缓冲 1→3 格；busy 期间保留预高亮
- 每日 streak（3/7 天给 rare/epic）
- 结算页「距下一升级还差 X」进度条
- 存档导出/导入
- PWA 离线 bug：sw ignoreSearch（start_url 带 ?source=pwa 会 Response.error）

## P2
- 成就（LifetimeStats 已埋点）；本地最佳排行榜
- 波内逐格 12ms 蔓延爆裂；金币飞 HUD 收口
- window.linmine 移除或只读（上排行榜前必须）
- 合规：海外路线补隐私政策/协议（1 周）；大陆路线版号+防沉迷（6 个月级）

## 亮点（保留）
- 确定性核心+回放：中台水准
- 坠落单向边：比 Pocket Mine 做得对
- WebAudio 合成音效零资源
- 深度氛围系统（雾收缩/头灯/暗角）
