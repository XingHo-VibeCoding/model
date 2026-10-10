'use strict'

/* 云函数：api（**HTTP 云函数**）
 *
 * ── 它是什么 ──────────────────────────────────────────────────────
 * 一个跑在云上的 Web 服务，自己监听 9000 端口（平台硬性要求）。
 * 不是事件函数 —— 所以不能用 exports.main(event, context)。
 *
 * ── 它提供什么 ─────────────────────────────────────────────────────
 *   GET  /api/health    后端活着吗（不查库）
 *   GET  /api/items     读全部候选条目           ← 首页候选池、清单页都用它
 *   POST /api/items     新增一个条目（Day 18）    ← 添加页提交
 *   GET  /api/history   读最近的历史记录（倒序）   ← 历史记录页
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

/* items 表对外暴露的列。**读**和**写完之后读回**都走它 ——
   抽成常量是为了让两处形状永远一致（契约里 items 的字段就是这 8 个）。 */
const ITEMS_COLS = 'id,name,type,platform,spicy,tags,source,created_at'

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

/* ── 写数据库 ─────────────────────────────────────────────────────── */

/**
 * 往一张表插一行（PostgREST 的 POST）。
 * @param {string} table  表名（**只允许代码里写死的字面量**）
 * @param {object} row    要插入的行，键 = 数据库列名
 * @returns {object} 插入后的那一行
 *
 * ── 为什么要 `Prefer: return=representation` ──────────────────────
 * 默认 PostgREST 插入成功后只回一个 `201` 空体。加上这个头，数据库会把
 * **刚插进去的那一行**一起回给我们 —— 前端就能立刻拿到 `id` / `created_at`
 * （这两个都是数据库生成的，只有拿到才知道）。
 *
 * ⚠️ 万一这个平台不支持该头（响应体是空的）→ 兜底：按 `name` 回读一次。
 *    名字有唯一约束，回读一定只命中那一行。
 *
 * ⚠️ 这里**不做**"什么算冲突"的业务判断 —— 冲突（比如重名）由调用方按
 *    `err.pgCode` 决定怎么回，因为那是业务规则，不该埋进工具函数。
 *    这里只负责把数据库的 SQLSTATE 原样带出来：
 *      · `23505` = 唯一约束冲突（我们 = 重名）
 *      · `23514` = CHECK 约束（字段取值不合法）
 */
async function insertRow(table, row) {
  const apiKey = process.env.TCB_API_KEY
  if (!apiKey) {
    const err = new Error('没有配置 TCB_API_KEY（云函数环境变量里缺这个）')
    err.code = 'NO_API_KEY'
    throw err
  }

  const res = await fetch(`${REST_BASE}/${table}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // 让数据库把插入结果回给我们（见上面的说明）
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })

  const text = await res.text()

  if (!res.ok) {
    // 错误体是 JSON：{ code, message, requestId }
    // `code` 是 SQLSTATE，但 **CloudBase 网关会包一层** → `DATABASE_23505`
    // （剥前缀再判是调用方的事，见 handleCreateItem —— 这里只原样带出去）
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch {
      /* 不是 JSON —— 保持 null，下面报原文 */
    }
    const err = new Error(`写 ${table} 失败：HTTP ${res.status} ${text.slice(0, 300)}`)
    err.code = 'DB_WRITE_FAILED'
    err.httpStatus = res.status
    err.pgCode = payload?.code || null
    throw err
  }

  // 正常：PostgREST 回一个数组，里面是插入的行
  try {
    const rows = JSON.parse(text)
    if (Array.isArray(rows) && rows.length > 0) return rows[0]
  } catch {
    /* 落到下面的兜底 */
  }

  // 兜底：没拿到插入结果 → 按 name 回读（name 有唯一约束，只会命中一行）
  const found = await queryTable(table, {
    select: ITEMS_COLS,
    name: `eq.${row.name}`,
    limit: '1',
  })
  if (Array.isArray(found) && found.length > 0) return found[0]

  const err = new Error(`写 ${table} 之后没能读回那一行（name=${row.name}）`)
  err.code = 'DB_WRITE_READBACK_FAILED'
  throw err
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
    select: ITEMS_COLS,
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

/* POST /api/items —— 新增一个条目
 *
 * 依据：api-contract.md 第四节「2. POST /api/items」。
 *
 * ── 为什么校验要在应用层再做一遍（数据库明明已经有 CHECK / UNIQUE）──
 * 因为**数据库报的错是英文 SQLSTATE**（如 `23505 duplicate key value ...`），
 * 直接透给前端用户看到的是一串看不懂的东西。契约要求提示是**中文**，
 * 所以应用层先把能判的都判掉、给出人话；数据库那层退化成最后一道保险。
 *
 * ── source 为什么由服务端定死 ──────────────────────────────────────
 * 契约写 `source` 固定 `user`，**前端不用传也不能传** —— 否则有人能提交
 * `source:'builtin'` 冒充内置条目，混进"永远不会被筛掉"的那一类。
 */

/* 三个枚举字段的合法取值 —— 与 db/schema.sql 的 CHECK 约束一一对应。
   在这里再列一遍，只为了能把错误翻成中文。 */
const VALID_TYPES = ['dish', 'shop']
const VALID_PLATFORMS = ['mt', 'tb', 'any']
const VALID_SPICY = ['none', 'mild', 'medium', 'hot', 'any']

/* 名称长度（契约、数据库 char_length BETWEEN 1 AND 20，三处保持一致） */
const NAME_MIN = 1
const NAME_MAX = 20

/** 按**字符**算长度：中文一个字算一个。
    用 `[...s]` 而不是 `s.length` —— 后者算的是 UTF-16 码元，
    对 emoji 之类会算成 2，跟数据库的 char_length 对不上。 */
function charLength(s) {
  return [...s].length
}

/**
 * 把请求体读完。
 * ⚠️ HTTP 云函数里 `req` 是**流**，不是现成的对象 —— 得一截一截收再拼成字符串。
 *    没有 `req.body`（那是 Express 才有的）。
 */
function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      // 我们最大的请求也就几百字节；给个天花板，防止有人灌垃圾把内存占满
      if (size > maxBytes) {
        req.destroy()
        reject(Object.assign(new Error('请求体超过 64KB'), { code: 'BODY_TOO_LARGE' }))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handleCreateItem(req, res) {
  /* ① 读请求体、解析 JSON */
  let raw = ''
  try {
    raw = await readBody(req)
  } catch {
    return sendErr(res, 400, 'INVALID_BODY', '请求体读取失败，请重试')
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return sendErr(res, 400, 'INVALID_BODY', '请求体必须是 JSON 格式')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return sendErr(res, 400, 'INVALID_BODY', '请求体必须是一个 JSON 对象')
  }

  /* ② name —— 必填；去空白后 1–20 字；**不允许首尾带空白** */
  if (payload.name === undefined || payload.name === null) {
    return sendErr(res, 400, 'INVALID_NAME', '缺少必填字段：name（名称）')
  }
  if (typeof payload.name !== 'string') {
    return sendErr(res, 400, 'INVALID_NAME', '名称必须是文字')
  }
  // JS 正则里的 \s 已包含全角空格 U+3000，所以 trim() 就够
  const name = payload.name.trim()
  if (name === '') {
    return sendErr(res, 400, 'INVALID_NAME', '名称不能为空')
  }
  if (name !== payload.name) {
    return sendErr(res, 400, 'INVALID_NAME', '名称首尾不能有空白，去掉后再试一次')
  }
  const len = charLength(name)
  if (len < NAME_MIN || len > NAME_MAX) {
    return sendErr(res, 400, 'INVALID_NAME', `名称长度需要在 1–20 字之间（现在 ${len} 字）`)
  }

  /* ③ type —— 必填，只能是菜或店 */
  if (payload.type === undefined || payload.type === null) {
    return sendErr(res, 400, 'INVALID_TYPE', '缺少必填字段：type（类别）')
  }
  const type = String(payload.type).trim()
  if (!VALID_TYPES.includes(type)) {
    return sendErr(res, 400, 'INVALID_TYPE', '类别只能是「菜」(dish) 或「店」(shop)')
  }

  /* ④ platform —— 必填，只能是三个平台之一 */
  if (payload.platform === undefined || payload.platform === null) {
    return sendErr(res, 400, 'INVALID_PLATFORM', '缺少必填字段：platform（平台）')
  }
  const platform = String(payload.platform).trim()
  if (!VALID_PLATFORMS.includes(platform)) {
    return sendErr(
      res,
      400,
      'INVALID_PLATFORM',
      '平台只能是 mt（美团）/ tb（淘宝闪购）/ any（不限）'
    )
  }

  /* ⑤ spicy —— 可选，不传即 any */
  const spicyRaw = payload.spicy
  const spicy =
    spicyRaw === undefined || spicyRaw === null || spicyRaw === ''
      ? 'any'
      : String(spicyRaw).trim()
  if (!VALID_SPICY.includes(spicy)) {
    return sendErr(res, 400, 'INVALID_SPICY', '辣度只能是 none / mild / medium / hot / any')
  }

  /* ⑥ tags —— 可选，不传即空数组 */
  let tags = []
  if (payload.tags !== undefined && payload.tags !== null) {
    if (!Array.isArray(payload.tags)) {
      return sendErr(res, 400, 'INVALID_TAGS', '忌口标签必须是一个数组')
    }
    tags = payload.tags.map((t) => String(t).trim()).filter((t) => t !== '')
  }

  /* ⑦ 写库。source 由**服务端**定死为 user（见上面注释） */
  try {
    const item = await insertRow('items', { name, type, platform, spicy, tags, source: 'user' })
    // 余力加练：成功留一条日志 —— 以后查"这条是什么时候谁加进去的"有据可循
    console.log(
      '[api] POST /api/items 成功',
      JSON.stringify({ id: item?.id, name, type, platform })
    )
    return sendOk(res, { item }, 201)
  } catch (err) {
    /* ⚠️ CloudBase 网关会把 PostgreSQL 的 SQLSTATE **包一层**，给的是 `DATABASE_23505`；
       而原生 PostgREST 给的是裸的 `23505`。**两种都得认**。
       Day 18 实测踩到：第一版只判裸值，结果重名没被认出来，当成 500 报出去了。 */
    const pg = String(err.pgCode || '').replace(/^DATABASE_/, '')

    // 唯一约束冲突 = 重名 → 契约要求翻成 409，**不能让它变成 500**
    if (pg === '23505') {
      console.log('[api] POST /api/items 被拒（重名）', JSON.stringify({ name }))
      return sendErr(res, 409, 'DUPLICATE_NAME', `已经有叫「${name}」的条目了，换个名字吧`)
    }
    // CHECK 约束 —— 应用层理论上已挡住，兜底也给中文
    if (pg === '23514') {
      console.log(
        '[api] POST /api/items 被拒（字段不合法）',
        JSON.stringify({ name, detail: err.message })
      )
      return sendErr(res, 400, 'INVALID_FIELD', '有字段的取值不合法，检查一下类别/平台/辣度')
    }
    console.log('[api] POST /api/items 失败', JSON.stringify({ name, detail: err.message }))
    throw err // 交给最外层统一报 500
  }
}

/* ── 路由 ─────────────────────────────────────────────────────────── */

/* 每条路径都认"带 /api 前缀"和"不带"两种写法 —— 网关是否把前缀透传给函数
   各环境配置不同，两个都认就不用担心这个问题。 */
const ROUTES = [
  { path: ['/', '/api/health'],          method: 'GET',  fn: (res) => handleHealth(res) },
  { path: ['/api/items', '/items'],      method: 'GET',  fn: (res, url) => handleItems(res, url) },
  // 同一个路径、不同方法：读是 GET，写是 POST（Day 18 加的）
  // ⚠️ 路由按 method 匹配，所以两条不会打架
  { path: ['/api/items', '/items'],      method: 'POST', fn: (res, url, req) => handleCreateItem(req, res) },
  { path: ['/api/history', '/history'],  method: 'GET',  fn: (res, url) => handleHistory(res, url) },
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
    await hit.fn(res, url, req)
  } catch (err) {
    console.error('[api] 处理失败', err)
    const detail = err && err.message ? err.message : '未知错误'
    return sendErr(res, 500, 'INTERNAL_ERROR', `服务端出错：${detail}`)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`)
})
