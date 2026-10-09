/* 接口层 · 前端与云端之间**唯一**的通道（Day 17 新增）
 *
 * 为什么单独一个文件：跟 storage.js 是同一个道理 ——
 *   调用接口要处理超时、要解析统一外壳、要把错误翻成人话。
 *   散在页面里写，每页都要重写一遍；集中在这里只写一次。
 *
 * ── 它负责三件事 ───────────────────────────────────────────────────
 *   ① 拼地址、发请求、设超时（网络这层的事）
 *   ② 拆 `{ ok, data, error }` 外壳（契约规定的统一格式）
 *   ③ **把服务端的字段形状翻译成本地的**（见下面的说明）
 *
 * ── ③ 为什么必须做 ─────────────────────────────────────────────────
 * 服务端给的是数据库列名（snake_case），本地存储用的是自己的命名：
 *     history 表     →  本地存储
 *     item_id        →  itemId   （可能为 null：那条记录对应的条目被删过）
 *     item_name      →  name
 *     drawn_at(ISO)  →  at       （毫秒时间戳，本地一律存数字）
 * 这层翻译放在这里，**页面和存储层就完全不用知道云端长什么样** ——
 * 以后接口改名、换实现，只有这个文件要动。
 *
 * 依据：仓库根目录 api-contract.md（第四节接口定义、第二节字段说明）
 */

/* 接口根地址。
   默认值写死是为了"clone 下来就能跑"—— 用 Vite 的 VITE_API_BASE
   可以在不同环境覆盖它（比如本地起一个后端调试）。 */
const BASE = (
  import.meta.env?.VITE_API_BASE ||
  'https://model-d5gisaem106ad6a18-1500042790.ap-shanghai.app.tcloudbase.com'
).replace(/\/+$/, '')

export const API_BASE = BASE

/* 取数超时。定 8 秒：比"用户会觉得卡死"短，比冷启动长
   （云函数冷启动实测约 1.2 秒，留足余量）。 */
const TIMEOUT_MS = 8000

/**
 * 发一个 GET 请求并拆掉统一外壳。
 * @returns 成功时返回 `data` 里的内容；失败时 **抛出 Error**（带 `.code`）
 *
 * 为什么失败要抛而不是返回 {ok:false}：
 *   调用方几乎都是 `try { ... } catch` 的写法（首页抽取本来就是异步的），
 *   抛出去能直接落进已有的 catch —— 不用为接口这层再写一套分支。
 */
async function getJson(path, { signal, timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController()
  let timedOut = false

  // 调用方给的取消信号（离开页面、连点顶掉）要能穿透进来
  const forwardAbort = () => ctrl.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)

  let res
  try {
    res = await fetch(BASE + path, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    // 调用方主动取消 → 原样抛出，让上层认出来（它不该被当成"失败"）
    if (signal?.aborted) throw err
    if (timedOut) {
      const e = new Error(`请求超时（超过 ${Math.round(timeoutMs / 1000)} 秒没回应）`)
      e.code = 'TIMEOUT'
      throw e
    }
    const e = new Error('连不上服务器，检查一下网络。')
    e.code = 'NETWORK'
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }

  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    /* 不是 JSON —— 保持 body 为 null，下面统一报错 */
  }

  if (!body || typeof body.ok !== 'boolean') {
    const e = new Error(`服务器返回了预期之外的内容（HTTP ${res.status}）`)
    e.code = 'BAD_RESPONSE'
    throw e
  }

  if (body.ok !== true) {
    // 服务端自己报的错：它给的消息比我编的准，直接用
    const e = new Error(body.error?.message || `请求失败（HTTP ${res.status}）`)
    e.code = body.error?.code || `HTTP_${res.status}`
    throw e
  }

  return body.data
}

/* ── 接口 ①：读候选条目 ───────────────────────────────────────────── */ 

/**
 * 读全部候选条目（首页候选池 + 清单页共用）。
 * @returns `{ items: [...], total: number }`
 *
 * items 的字段和本地**完全一致**（表就是照本地建的），不用翻译：
 *   { id, name, type, platform, spicy, tags, source, created_at }
 */
export async function fetchItems({ signal } = {}) {
  const data = await getJson('/api/items', { signal })
  const items = Array.isArray(data?.items) ? data.items : []

  // tags 兜底成数组：接口理论上一定给数组，但真为 null 时页面会崩
  return {
    items: items.map((it) => ({ ...it, tags: Array.isArray(it.tags) ? it.tags : [] })),
    total: typeof data?.total === 'number' ? data.total : items.length,
  }
}

/* ── 接口 ②：读历史记录 ───────────────────────────────────────────── */

/**
 * 读最近的历史记录（服务端已按时间倒序）。
 * @returns `{ entries: [...], total: number }`
 *
 * ⚠️ 这里做了字段翻译（服务端列名 → 本地命名）。
 *    `itemId` 可能是 **null** —— 那条记录对应的条目后来被删了。
 *    显示历史**只读 `name`**（名称快照），所以照样显示得出来（PRD J4）。
 */
export async function fetchHistory({ signal } = {}) {
  const data = await getJson('/api/history', { signal })
  const rows = Array.isArray(data?.entries) ? data.entries : []

  const entries = rows.map((row) => {
    const at = Date.parse(row?.drawn_at)
    return {
      id: String(row?.id ?? ''),
      itemId: row?.item_id ?? null,
      name: String(row?.item_name ?? ''),
      // 时间戳解析不出来就退到 0：宁可排序差一点，也不要 NaN 让页面上出现「NaN 分钟前」
      at: Number.isFinite(at) ? at : 0,
    }
  })

  return { entries, total: typeof data?.total === 'number' ? data.total : entries.length }
}
