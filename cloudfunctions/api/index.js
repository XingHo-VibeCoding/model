'use strict'

/* 云函数：api（**HTTP 云函数**）
 * 触发路径：GET /api/health
 *
 * ── 它是什么 ──────────────────────────────────────────────────────
 * HTTP 云函数本质是一个「跑在云上的 Web 服务」，不是事件函数。
 * 所以这里不能用 exports.main(event, context) —— 那是普通云函数的契约。
 * 这里要自己起一个 HTTP 服务，并且**必须监听 9000 端口**（平台硬性要求）。
 *
 * ── 为什么用 Node 原生 http，而不是 Express ────────────────────────
 * HTTP 云函数**不会自动帮你装依赖**（node_modules 要自己带）。
 * 原生模块零依赖 → 打包体积最小、冷启动最快，也不需要上传 node_modules。
 * 第 3 周接口变多了，再考虑引框架。
 *
 * ── 它只做一件事 ─────────────────────────────────────────────────
 * 回答"后端还活着吗"。不连数据库、不读环境变量、不做业务。
 * 目的是先单独跑通「公网 → 云函数 → 返回 JSON」这条链路，
 * 这样链路的问题和以后业务的问题不会混在一起、查不清是谁的错。
 * ─────────────────────────────────────────────────────────────────
 */

const http = require('http')

const PORT = 9000 // ⚠️ 平台硬性要求，改成别的跑不起来
const HOST = '0.0.0.0' // 必须绑 0.0.0.0，绑 127.0.0.1 外面访问不到

/* 响应内容单独提出来，方便对照"返回的到底是不是它" */
const BODY = Object.freeze({
  ok: true,
  service: 'model',
})

/* 这两个路径都返回同一个结果 —— 这是**故意留的容错**：
 * 在控制台给函数配了访问路径 /api/health 之后，网关有两种可能的行为：
 *   ① 把完整路径 /api/health 原样传给函数
 *   ② 把路径前缀剥掉，只传 "/"
 * 到底哪种，各环境配置不同、官方也没写死。
 * 与其猜，不如两个都认 —— 这样不管走哪条分支，这个接口都通。 */
const OK_PATHS = new Set(['/', '/api/health'])

/** 统一的 JSON 响应：显式设置 Content-Type，避免被当成纯文本 */
function sendJson(res, statusCode, data) {
  const text = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')

  // 日志：在控制台「日志」里能看到，用来确认这次请求真的打进来了、路径是什么
  console.log('[api]', req.method, url.pathname)

  if (req.method === 'GET' && OK_PATHS.has(url.pathname)) {
    sendJson(res, 200, BODY)
    return
  }

  // 其余一律 404 —— 今天只有 health 一个接口，不做多余的事
  sendJson(res, 404, { error: 'Not Found', path: url.pathname })
})

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`)
})
