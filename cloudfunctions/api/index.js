'use strict'

/* 云函数：api（**HTTP 云函数**）
 *
 * ── 它是什么 ──────────────────────────────────────────────────────
 * 一个跑在云上的 Web 服务，自己监听 9000 端口（平台硬性要求）。
 * 不是事件函数 —— 所以不能用 exports.main(event, context)。
 *
 * ── 它提供什么 ─────────────────────────────────────────────────────
 *   GET /api/health    后端活着吗（不查库）
 *   GET /api/items     读全部候选条目          ← 首页候选池、清单页都用它
 *   GET /api/history   读最近的历史记录（倒序）  ← 历史记录页
 *
 * 依据：仓库根目录 api-contract.md 第四节。
 *
 * ── 统一响应外壳（契约规定，所有接口一致）──────────────────────────
 *   成功：{ "ok": true,  "data": { ... }, "error": null }
 *   失败：{ "ok": false, "data": null, "error": { "code": "...", "message": "..." } }
 *
 * ── ⚠️ 怎么连数据库（Day 17 定的方案，跟最初设想不同）──────────────
 * **不走 PostgreSQL 直连，走 CloudBase 的 HTTP API（PostgREST）**。
 *
 * 为什么改：直连要「主机 + 端口 + 账号 + 密码」四样东西，而新版控制台
 * **不展示数据库连接串**（密码属于凭据，平台设计上就不通过 API 外露），
 * 加上 HTTP 云函数不会自动注入连接信息 —— 这条路在控制台拿不到入口。
 *
 * 现在走的路：控制台给它建一个**服务端 API Key**，云函数拿这个 Key
 * 调 PostgREST 接口读写数据。好处：
 *   · 不需要数据库密码，也不用手抄主机地址
 *   · **零依赖**（用 Node 20 内置的 fetch）—— 部署包很小，冷启动快
 *   · Key 可随时撤销、可设有效期
 *
 * ⚠️ 唯一的凭据是环境变量 **TCB_API_KEY**，配在云函数的环境变量里，
 *    **不写在代码里、不进仓库**。
 * ─────────────────────────────────────────────────────────────────
 */

const http = require('http')

const PORT = 9000 // ⚠️ 平台硬性要求，改了跑不起来
const HOST = '0.0.0.0'

/* 环境 ID：不是秘密（它只是个标识），给个默认值方便本地调试；
   换环境时可以用环境变量覆盖。 */
const ENV_ID = process.env.TCB_ENV_ID || 'model-d5gisaem106ad6a18'

/* 数据库 HTTP API 的根地址（PostgREST 风格：/v1/rdb/rest/<表名>） */
const REST_BASE = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`

/* 默认返回条数 */
const DEFAULT_ITEMS_LIMIT = 500
const MAX_ITEMS_LIMIT = 1000
const DEFAULT_HISTORY_LIMIT = 20
const MAX_HISTORY_LIMIT = 200

/* ── 读数据库 ─────────────────────────────────────────────────────── */

/**
 * 查一张表。
 * @param {string} table  表名（**只允许代码里写死的字面量**，绝不能用用户输入）
 * @param {object} params PostgREST 查询参数，如 { select, order, limit }
 *
 * ⚠️ 关于"参数化"：这里的参数是**用 URLSearchParams 拼的**，它会自动做
 *    URL 编码 —— 用户传进来的值（比如 ?limit=）不可能变成 SQL 片段。
 *    表名和列名都是代码里写死的字面量。所以不存在注入风险。
 */
async function queryTable(table, params) {
  const url = new URL(`${REST_BASE}/${table}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const apiKey = process.env.TCB_API_KEY
  if (!apiKey) {
    const err = new Error('没有配置 TCB_API_KEY（云函数环境变量里缺这个）')
    err.code = 'NO_API_KEY'
    throw err
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  })

  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`查 ${table} 失败：HTTP ${res.status} ${text.slice(0, 300)}`)
    err.code = 'DB_QUERY_FAILED'
    throw err
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`查 ${table} 返回的不是 JSON：${text.slice(0, 200)}`)
  }
}

/* ── 统一响应工具 ─────────────────────────────────────────────────── */

/** 成功：{ ok: true, data, error: null } */
function sendOk(res, data, status = 200) {
  send(res, status, { ok: true, data, error: null })
}

/** 失败：{ ok: false, data: null, error: { code, message } } */
function sendErr(res, status, code, message) {
  send(res, status, { ok: false, data: null, error: { code, message } })
}

/* ── 跨域（CORS）────────────────────────────────────────────────────
   前端在 `xxx.tcloudbaseapp.com`（静态托管），接口在
   `xxx.ap-shanghai.app.tcloudbase.com`（HTTP 网关）—— **不是同一个域名**，
   所以浏览器一定会先问"这个源允许吗"。

   ⚠️⚠️ 这件事**由网关负责，函数里千万不要自己加 Access-Control-Allow-Origin**。

   Day 17 实测踩到的坑：函数里写了一行 `Access-Control-Allow-Origin: *`，
   而网关自己也会加一个（回显请求的 Origin）。两边一拼，浏览器收到的是：

       access-control-allow-origin: https://xxx.tcloudbaseapp.com,*

   规范里这个头**只允许一个值或 `*`**，逗号列表会被判为无效 ——
   结果是"明明两个地方都配了跨域，反而跨不过去"，而且报错信息指不到真正的原因。

   所以：网关加，函数不加。删掉之后实测头就干净了。
   （下面那个 OPTIONS 分支保留着 —— 本地直接 `node index.js` 调试时用得到。） */
const NO_CORS_HERE = true // eslint-disable-line no-unused-vars —— 留个记号，别再往 send 里加跨域头

function send(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

/** 把 ?limit= 解析成一个安全的整数 */
function parseLimit(raw, fallback, max) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max) // 卡上限：防止有人传 999999
}

/* ── 各接口的实现 ─────────────────────────────────────────────────── */

/** GET /api/health —— 不查库，只回答"活着" */
function handleHealth(res) {
  sendOk(res, { service: 'model' })
}

/** GET /api/items —— 读全部候选条目 */
async function handleItems(res, url) {
  const limit = parseLimit(url.searchParams.get('limit'), DEFAULT_ITEMS_LIMIT, MAX_ITEMS_LIMIT)

  const rows = await queryTable('items', {
    select: 'id,name,type,platform,spicy,tags,source,created_at',
    order: 'id',
    limit: String(limit),
  })

  sendOk(res, { items: rows, total: rows.length })
}

/** GET /api/history —— 读历史记录，按时间倒序 */
async function handleHistory(res, url) {
  const limit = parseLimit(url.searchParams.get('limit'), DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT)

  const rows = await queryTable('history', {
    select: 'id,item_id,item_name,drawn_at',
    order: 'drawn_at.desc',
    limit: String(limit),
  })

  sendOk(res, { entries: rows, total: rows.length })
}

/* ── 路由 ─────────────────────────────────────────────────────────── */

/* 每条路径都认"带 /api 前缀"和"不带"两种写法 —— 网关是否把前缀透传给函数
   各环境配置不同，两个都认就不用担心这个问题。 */
const ROUTES = [
  { path: ['/', '/api/health'],          method: 'GET', fn: (res) => handleHealth(res) },
  { path: ['/api/items', '/items'],      method: 'GET', fn: (res, url) => handleItems(res, url) },
  { path: ['/api/history', '/history'],  method: 'GET', fn: (res, url) => handleHistory(res, url) },
]

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')

  // 日志：控制台「日志」里能看到，排查时是第一现场
  console.log('[api]', req.method, url.pathname, url.search || '')

  /* 浏览器跨域预检：不查库、不问业务，直接回「允许」。
     线上这一步网关会先拦下来（见上面 CORS 的说明），所以这个分支
     实际是给"本地直接 node index.js + 本地前端"这种调法兜底的。
     ⚠️ 跨域头**只在这个分支里写**，不要搬到 send() 里去。 */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    })
    return res.end()
  }

  try {
    const hit = ROUTES.find(
      (r) => r.method === req.method && r.path.includes(url.pathname)
    )
    if (!hit) {
      return sendErr(res, 404, 'NOT_FOUND', `没有这个接口：${req.method} ${url.pathname}`)
    }
    await hit.fn(res, url)
  } catch (err) {
    console.error('[api] 处理失败', err)
    const detail = err && err.message ? err.message : '未知错误'
    return sendErr(res, 500, 'INTERNAL_ERROR', `服务端出错：${detail}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`)
})
