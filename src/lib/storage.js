/* 数据层 · 全项目唯一读写浏览器本地存储的地方
 * 对应 TECH_DESIGN.md §5（项目结构）、§7.1（数据层接口）、§9（错误处理）
 *
 * 为什么整个项目只有这一个文件碰 localStorage：
 *   PRD 的 E3 要求「本地存储不可用时降级为内存态 + 提示一次」。
 *   如果到处直接调 localStorage，这个分支要写十几遍；集中在这里只写一遍。
 *   将来换成云端，也只改这一个文件，页面代码一行不动。
 */

import menu from '../data/menu.json'
import {
  HISTORY_LIMIT,
  NAME_MAX,
  SCHEMA_VERSION,
  SPICY_ANY,
  SPICY_LEVELS,
  STORAGE_KEYS,
} from './constants.js'

/* ── 内部状态 ─────────────────────────────────────────────────────── */

let persistent = null // true / false；null = 还没探测过
let memory = null // 降级用的内存态容器
let noticeGiven = false // 「数据将无法保存」每次会话只提示一次

function emptyState() {
  return {
    items: [],
    filter: { spicyMax: SPICY_ANY, excludeTags: [] },
    history: [],
    meta: { schemaVersion: SCHEMA_VERSION, seededBuiltin: false },
  }
}

function builtinItems() {
  // 每次都返回副本，避免调用方改到 menu.json 的原始对象
  return menu.map((item) => ({ ...item, tags: [...item.tags] }))
}

/* ── 可用性探测与降级 ─────────────────────────────────────────────── */

function available() {
  if (persistent !== null) return persistent
  try {
    const probe = '__chisha_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    persistent = true
  } catch {
    // 无痕窗口、被禁用、配额满 —— 都走这里（PRD §5.3 / E3）
    switchToMemory()
  }
  return persistent
}

function switchToMemory() {
  if (persistent === false && memory) return
  const snapshot = emptyState()
  try {
    // 能读多少读多少，读不到就用默认值
    for (const name of Object.keys(STORAGE_KEYS)) {
      const raw = window.localStorage.getItem(STORAGE_KEYS[name])
      if (raw != null) snapshot[name] = JSON.parse(raw)
    }
  } catch {
    /* 忽略：降级本来就意味着拿不到历史数据 */
  }
  memory = snapshot
  persistent = false
}

/* ── 底层读写：所有存储访问都必须经过这两个函数 ───────────────────── */

function readRaw(name) {
  if (!available()) return memory ? memory[name] : undefined
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[name])
    return raw == null ? undefined : JSON.parse(raw)
  } catch {
    // 数据损坏（解析失败）：把这一项重置掉，不要白屏、不要报红（错误处理表第 2 行）
    try {
      window.localStorage.removeItem(STORAGE_KEYS[name])
    } catch {
      /* 忽略 */
    }
    return undefined
  }
}

function writeRaw(name, value) {
  if (!available()) {
    memory[name] = value
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEYS[name], JSON.stringify(value))
  } catch {
    // 写入失败：转为内存态，本次会话功能照常可用（PRD §5.3）
    switchToMemory()
    memory[name] = value
  }
}

/* ── 首次运行：播种内置库 ─────────────────────────────────────────── */

/* 只在「从未初始化过」时播种一次。
   用户把清单删空后刷新，不会自动补回来 —— 因为 PRD 的 F1 和 H3
   都需要「候选为空」这个状态能够被构造出来。想恢复，用「恢复默认库」。 */
function ensureReady() {
  available()
  const meta = readRaw('meta')
  if (meta && meta.seededBuiltin === true) return

  const items = readRaw('items')
  if (!Array.isArray(items) || items.length === 0) {
    writeRaw('items', builtinItems())
  }
  writeRaw('filter', { spicyMax: SPICY_ANY, excludeTags: [] })
  writeRaw('history', [])
  writeRaw('meta', { schemaVersion: SCHEMA_VERSION, seededBuiltin: true })
}

/* ── 小工具 ───────────────────────────────────────────────────────── */

/* 去首尾空格，包含全角空格 U+3000（PRD §5.1） */
export function normalizeName(name) {
  return String(name ?? '').replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
}

/* 按「字符数」计数，不是 JS 的 .length（UTF-16 码元数）。
   原因：emoji 在 JS 里占 2 个码元。用 .length 会把
   「19 个字符里含 1 个 emoji」误判成超长，直接违反 PRD 的 D5。
   对应 TECH_DESIGN.md 附一第 4 条。 */
export function charLength(text) {
  return [...String(text ?? '')].length
}

function makeId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* ── 清单 ─────────────────────────────────────────────────────────── */

export function loadItems() {
  ensureReady()
  const items = readRaw('items')
  return Array.isArray(items) ? items : []
}

/* 返回 { ok, reason? , item? }，让界面自己决定怎么提示 */
export function addItem(input = {}) {
  ensureReady()

  const name = normalizeName(input.name)
  if (!name) return { ok: false, reason: 'empty' } // D1：空 / 全空格
  if (charLength(name) > NAME_MAX) return { ok: false, reason: 'too-long' } // D2

  const { type } = input
  if (type !== 'dish' && type !== 'shop') return { ok: false, reason: 'no-type' } // D1

  const items = loadItems()
  if (items.some((it) => normalizeName(it.name) === name)) {
    return { ok: false, reason: 'duplicate' } // D3：去空格后同名
  }

  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : []

  const item = {
    id: makeId('u'),
    name,
    type,
    // 不填就是「不限」→ 这类条目永远不会被过滤掉（PRD §5.1）
    spicy: SPICY_LEVELS.includes(input.spicy) ? input.spicy : SPICY_ANY,
    tags,
    source: 'user',
  }

  writeRaw('items', [...items, item])
  return { ok: true, item }
}

/* 删条目。注意：不碰历史记录 —— 历史是「发生过的事」（PRD J4） */
export function removeItem(id) {
  ensureReady()
  const items = loadItems()
  const next = items.filter((it) => it.id !== id)
  if (next.length === items.length) return false
  writeRaw('items', next)
  return true
}

/* 把内置库补进清单：已有的（去空格后同名）不重复添加，也不删用户自己的条目 */
export function restoreBuiltin() {
  ensureReady()
  const items = loadItems()
  const existing = new Set(items.map((it) => normalizeName(it.name)))
  const additions = builtinItems().filter((b) => !existing.has(normalizeName(b.name)))
  if (additions.length) writeRaw('items', [...items, ...additions])
  return additions.length
}

/* ── 过滤条件 ─────────────────────────────────────────────────────── */

export function getFilter() {
  ensureReady()
  const f = readRaw('filter')
  if (!f || typeof f !== 'object') return { spicyMax: SPICY_ANY, excludeTags: [] }
  return {
    spicyMax: SPICY_LEVELS.includes(f.spicyMax) ? f.spicyMax : SPICY_ANY,
    excludeTags: Array.isArray(f.excludeTags) ? f.excludeTags : [],
  }
}

export function setFilter(patch) {
  ensureReady()
  const merged = { ...getFilter(), ...patch }
  writeRaw('filter', merged)
  return merged
}

/* ── 历史记录 ─────────────────────────────────────────────────────── */

/* 每条历史存两样：
   · name   —— 名称快照。**显示只读它**，所以条目被删掉之后历史照样显示得出来（PRD J4）。
   · itemId —— 只给洗牌袋的「边界衔接」用：PRD §5.2 要求判断"新袋首项是不是上一次结果"，
               而"上一次结果"被定义为"历史记录里最新的一条（含刷新前产生的）"，
               所以要能被持久化下来，光有名称不够。
               条目被删后这个 id 会悬空，但那正好 —— 它比对不上任何袋内条目，行为也是对的。
   存储顺序 = 新的放最前面，所以读出来直接就是倒序（PRD J2）。 */

export function appendHistory(item) {
  ensureReady()
  const entry = {
    id: makeId('h'),
    itemId: item?.id ?? null,
    name: String(item?.name ?? ''),
    at: Date.now(),
  }
  const next = [entry, ...getHistory()].slice(0, HISTORY_LIMIT) // J2：最多 20 条
  writeRaw('history', next)
  return entry
}

export function getHistory() {
  ensureReady()
  const list = readRaw('history')
  return Array.isArray(list) ? list : []
}

/* ── 存储状态与统计 ───────────────────────────────────────────────── */

/* 返回存储是否可用，以及「这次会话该不该提示」。
   标志位只能放内存 —— 存储不可用时本来也写不进去（TECH_DESIGN.md 附一第 3 条）。 */
export function getStorageStatus() {
  const ok = available()
  let notify = false
  if (!ok && !noticeGiven) {
    noticeGiven = true
    notify = true
  }
  return { persistent: ok, notify }
}

/* 给页面上的「数据层自检」卡片用，也用于验收标准核对 */
export function getStats() {
  const items = loadItems()
  const userCount = items.filter((it) => it.source === 'user').length
  const history = getHistory()
  return {
    total: items.length,
    userCount,
    builtinCount: items.length - userCount,
    historyCount: history.length,
    historyLimit: HISTORY_LIMIT,
    persistent: available(),
    keys: Object.keys(STORAGE_KEYS).filter((name) => readRaw(name) != null),
  }
}

/* 清空本产品的全部数据。供验收标准里「全新状态」这个测试前提使用。 */
export function resetAll() {
  try {
    if (available()) {
      for (const key of Object.values(STORAGE_KEYS)) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    /* 忽略 */
  }
  persistent = null
  memory = null
  noticeGiven = false
  available()
  ensureReady()
}
