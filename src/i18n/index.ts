/**
 * Minimal i18n. English strings are the keys; the zh dictionary maps them to
 * Chinese. Default language is zh (the game's primary market), with a runtime
 * toggle persisted in the profile settings.
 *
 * Dynamic strings use {param} placeholders: t('Need {n} more cash', {n: 40}).
 * Missing keys fall back to English, so an un-translated string is never
 * blank — worst case it shows English.
 */

import type { CardDef } from '../config/cards.ts';

export type Lang = 'zh' | 'en';

let currentLang: Lang = 'zh';

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang === 'en' ? 'en' : 'zh';
}

/** Game display name. */
export function gameName(): string {
  return currentLang === 'zh' ? '林脉' : 'Lin Mine';
}

export function t(key: string, params?: Record<string, string | number>): string {
  let out = currentLang === 'zh' ? (zh[key] ?? key) : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

// ---------------------------------------------------------------- config data

/** Localized level name. */
export function tLevel(name: string): string {
  return t(name);
}

const CHEST_NAMES: Record<string, string> = {
  'Rusty Crate': '锈蚀木箱',
  'Gilded Crate': '鎏金宝箱',
  'Royal Cache': '皇家秘藏',
};

export function tChest(name: string): string {
  return currentLang === 'zh' ? (CHEST_NAMES[name] ?? name) : name;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Localized card description, mirroring the formulas in config/cards.ts. */
export function tCardDesc(card: CardDef, level: number): string {
  if (currentLang === 'en') return card.describe(level);
  switch (card.id) {
    case 'rich_veins':
      return `矿石出现频率提高 ${pct(0.18 * level)}，且开采耐久 -1。`;
    case 'loaded_crates':
      return `特殊方块出现频率提高 ${pct(0.25 * level)}。`;
    case 'appraiser':
      return `矿石售出价格提高 ${pct(0.2 * level)}。`;
    case 'deep_pockets':
      return `每深入 10 行，深度加成提高 ${pct(0.06 * level)}。`;
    case 'sturdy_grip':
      return `每局初始耐久 +${6 + 4 * (level - 1)}。`;
    case 'soft_soil':
      return `挖土与岩石的耐久消耗降低 ${(1 + 0.25 * (level - 1)).toFixed(2)}。`;
    case 'big_blast':
      return `爆裂箱的波及半径扩大至 ${Math.min(3, Math.floor(1 + 0.5 * (level - 1)))} 格。`;
    // (rich_veins 保底：矿石耐久 -1，文案已并入上一条)
    case 'chain_bonus':
      return `连锁破坏的收益提高 ${pct(0.35 * level)}。`;
    default:
      return card.describe(level);
  }
}

// ------------------------------------------------------------------ dictionary

const zh: Record<string, string> = {
  // --- title
  'Lin Mine': '林脉',
  'Tap the soil. Chase the vein. Get out before the pick gives.':
    '叩开矿土，追寻矿脉，赶在镐头耗尽之前脱身。',
  'Dig In': '开始挖矿',
  Settings: '设置',

  // --- levels
  'Pick a dig': '选择矿道',
  Shop: '商店',
  'Reach {n} m': '目标 {n} 米',
  'Best {n} m': '最佳 {n} 米',
  'No dig yet': '尚未开挖',
  '{p} play · {c} clear': '{p} 次下矿 · {c} 次通关',
  '{p} plays · {c} clears': '{p} 次下矿 · {c} 次通关',
  'Clear the previous dig': '先通关上一条矿道',
  Lvl: '等级',
  'Unknown dig': '未知矿道',
  'Back to title': '返回首页',
  'Back to levels': '返回矿道',

  // --- level names & blurbs
  'Sunlit Shaft': '向阳矿坑',
  'Soft soil, shallow pockets. Learn the swing.': '土质松软，矿苗浅显。先练练手。',
  'Copper Gorge': '铜砺峡谷',
  'Wider veins, harder rock. Watch the pick.': '矿脉更宽，岩层更硬。看好你的镐。',
  'The Deep Shelf': '深渊矿台',
  'Long drops pay off if you can survive them.': '长坠有回报——前提是你撑得住。',
  'Molten Reach': '熔岩之境',
  'Gold everywhere, but bedrock bites back.': '遍地黄金，基岩咬人不吐骨头。',
  'The Long Dark': '漫漫长夜',
  'One shaft, no second chances.': '一条矿道，没有第二次机会。',
  'Daily Shaft': '每日矿道',
  'A new shaft every day at midnight UTC. Beat it for a bonus cache.':
    '每天零点（UTC）刷新一条新矿道，通关有额外宝箱。',

  // --- draft
  'Start Dig': '开始下矿',
  'Go bare-handed': '徒手开工',
  'Equip up to': '最多装备',
  cards: '张卡牌',
  Pickaxe: '镐头',
  Target: '目标',
  '{n} swings': '{n} 镐击',
  '{n} of {max} equipped': '已装备 {n}/{max} 张',
  '{n} cards': '{n} 张卡牌',
  '{n} card': '1 张卡牌',

  // --- cards
  'Rich Veins': '富矿脉',
  'Loaded Crates': '满载货箱',
  Appraiser: '鉴定师',
  'Deep Pockets': '深度口袋',
  'Sturdy Grip': '稳固握把',
  'Soft Soil': '松软土层',
  'Big Blast': '大爆破',
  'Chain Bonus': '连锁加成',
  Veins: '矿脉',
  Cash: '收益',
  Gear: '装备',
  Blast: '爆破',
  Card: '卡牌',
  'Unknown card': '未知卡牌',
  'No effect yet.': '暂无效果。',
  Locked: '未解锁',
  'Find it in a crate': '开箱获得',
  'L{n}/{max}': '{n}/{max} 级',

  // --- hud
  '{n} m': '{n} 米',
  'of {n} m': '目标 {n} 米',
  'CHAIN x{n}!': '连锁 x{n}！',
  'Pause dig': '暂停挖掘',

  // --- hints & toasts
  'Bedrock — the pick cannot bite': '基岩坚硬——镐头啃不动',
  'The miner cannot reach that yet': '矿工还够不到那里',
  'No durability left': '镐头耐久耗尽了',
  'Clear the previous dig first': '先通关上一条矿道',
  'Find this card in a crate': '这张卡要开箱才能获得',
  'Only {n} cards per dig': '每次下矿最多带 {n} 张卡',
  'Pickaxe is maxed': '镐头已满级',
  'Not enough cash': '金币不足',
  'No crate to open': '没有可开的箱子',
  'Save reset': '存档已重置',
  'Save restored from backup': '已从备份恢复存档',
  'Save could not be read — starting fresh': '存档无法读取——已重新开始',
  'Storage unavailable: progress is session-only': '存储不可用：进度仅本次会话有效',
  '+{n} cash': '+{n} 金币',

  // --- tutorial
  'Tap a glowing block to dig. The miner walks there and swings.':
    '点击发光的方块进行挖掘。矿工会走过去挥镐。',
  'Blast crates chain for free, and long drops cost nothing. Use them.':
    '爆裂箱连锁不耗耐久，长距离坠落也免费。善用它们。',
  'Running low? Green supply crates restore durability.':
    '耐久告急？绿色补给箱可以恢复镐头耐久。',
  'Cash buys pickaxe upgrades and crates. Crates hold cards.':
    '金币可以升级镐头、购买宝箱。宝箱里藏着卡牌。',
  'Tap the soil to dig.': '点击矿土开始挖掘。',
  'Got it': '知道了',

  // --- result
  'Shaft cleared!': '矿道贯通！',
  'Boxed in!': '被围困了！',
  'Pickaxe worn out': '镐头耗尽',
  Cleared: '通关',
  'Run over': '本局结束',
  'Run cash': '矿道收益',
  'Win bonus': '通关奖励',
  'Depth bonus': '深度加成',
  Total: '总计',
  'Blocks mined': '挖掘方块',
  'Chain blocks': '连锁方块',
  'Longest fall': '最长坠落',
  'Ore mined': '开采矿石',
  'Picked up {n} in the shaft': '矿道中拾取 {n} 金币',
  'Nothing in the pockets': '口袋空空',
  'No crate this time': '本次没有宝箱',
  'Open it for cards and cash': '打开可获得卡牌与金币',
  'Clear the shaft to earn one': '通关矿道即可获得',
  Claim: '领取',
  Collect: '收下',
  '{names} waiting in the shop': '{names} 正在商店等你',
  'New dig unlocked — {name}': '解锁新矿道——{name}',
  'Dig again': '再来一局',
  Levels: '矿道',
  'The mine': '矿场',
  'Flawless clear!': '完美通关！',

  // --- shop
  Durability: '耐久',
  Cost: '费用',
  Upgrade: '升级',
  Crates: '宝箱',
  'Unopened crates': '待开宝箱',
  'Card collection': '卡牌收藏',
  Buy: '购买',
  'Rusty Crate': '锈蚀木箱',
  'Gilded Crate': '鎏金宝箱',
  'Royal Cache': '皇家秘藏',
  '{n} cards + cash': '{n} 张卡牌 + 金币',
  '{n} card + cash': '1 张卡牌 + 金币',
  'Open {name}': '打开{name}',
  'Open {name} x{n}': '打开{name} x{n}',
  'Lvl {n} — max': '{n} 级——已满级',
  'Lvl {a} → {b}': '{a} 级 → {b} 级',
  'Your pick cannot get any tougher.': '你的镐头已经无坚不摧。',
  '+{n} durability per run': '每局耐久 +{n}',
  'Need {n} more cash': '还差 {n} 金币',

  // --- settings
  Sound: '音效',
  'Mines are quiet by default.': '矿井默认寂静无声。',
  'Calm motion': '减弱动效',
  'Cuts screen shake and fades.': '减少屏幕震动与闪动。',
  Haptics: '震动反馈',
  'Buzz on big chains.': '大连锁时嗡嗡作响。',
  Language: '语言',
  'Reset save': '重置存档',
  'Tap again to erase': '再点一次确认清除',
  'Erasing your save removes cash, cards and level progress.':
    '清除存档将失去金币、卡牌与矿道进度。',
  'Save v{n} · Config {v}': '存档 v{n} · 配置 {v}',

  // --- chest reward toast (from game.ts announceReward)
  ' · ': ' · ',
  max: '满级',

  // --- storage
  'Digging the shaft…': '正在开凿矿道…',
};
