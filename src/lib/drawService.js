/* 取下一个结果 —— 数据层与界面之间的那一层。

   ⚠️ 这个函数的签名是照着"将来要接真实 API"设计的：**异步、可取消、可失败**。
      而现在它的内部只是本地计算（微秒级），所以真实运行时「加载中」短到看不见。

      这是**故意的**，不是偷懒 —— PRD 的 B1 要求点「换一个」≤1 秒，
      如果为了"让加载中看得见"而人为加延迟，等于自己违反自己的验收标准。

   那「加载中」和「切换失败」怎么验收？留了两个人工开关
   （地址栏查询参数，跟页面级的 `?demo=` 是同一套写法）
   —— ⚠️ 这两个管的是**操作级**状态（「换一个」那一下）；
      页面级的整页骨架屏 / 错误页由 `?demo=` + 页脚的「状态演示」开关管，两层别混：

     ?slow=1   延迟 900ms 再返回   → 能看见「加载中」
     ?fail=1   直接抛错            → 能看见「切换失败」

   这两个开关的意义：现在数据在本地，**真实的失败路径不存在**
   （PRD §7.2 明确本期不接平台数据）。但 UI 和状态机必须先存在、必须被验过，
   否则第 3 周接上 API 那天，才发现那两个状态的样式和行为全是错的。

   第 3 周要改的只有这一个文件里的一行：
   把下面的本地取数换成真实请求。状态机、界面、测试步骤全都不用动。 */

import { drawNext } from './bag.js'

/* 人工开关下的延迟时长。默认路径是 0 —— 真实运行时几乎立刻完成。 */
export const SLOW_DELAY_MS = 900

function readFlag(name) {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(name) === '1'
}

/* 可取消的等待：如果中途被 abort，立刻 reject。
   这样连点多次时，被取消的那几次不会继续往下走。

   ⚠️ 两条容易漏的路径（Day 11 的机械测试揪出来的）：
   ① 进来时 signal 就已经被取消了 → 要立刻拒绝
   ② 不需要等待（ms=0）时，也要让出一次微任务、再检查一次取消状态
   两条都是为了跟真实 fetch 的行为对齐 —— 真实的 fetch 一旦被 abort 就立刻 reject，
   如果本地版本在被取消时还会返回结果，那第 3 周换成真请求时行为就变了。 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('已取消', 'AbortError'))
      return
    }
    if (!ms || ms <= 0) {
      queueMicrotask(() => {
        if (signal?.aborted) reject(new DOMException('已取消', 'AbortError'))
        else resolve()
      })
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 取下一个结果。
 *
 * @param {object}      p
 * @param {object}      p.bag           上一轮留下的洗牌袋（首次为 null）
 * @param {Array}       p.pool          当前候选
 * @param {string|null} p.lastResultId  上一次结果的 id，用于"跨轮不重复"的边界衔接
 * @param {AbortSignal} [p.signal]      用于取消（连点时取消掉前一次）
 * @returns {Promise<{ id: string, bag: object }>}
 * @throws {Error} 取数失败时抛出（人工开关 ?fail=1 可触发）
 */
export async function fetchNextResult({ bag, pool, lastResultId, signal }) {
  await delay(readFlag('slow') ? SLOW_DELAY_MS : 0, signal)

  if (readFlag('fail')) {
    throw new Error('网络连接失败')
  }

  return drawNext(bag, pool, lastResultId)
}

/* 界面上要显示的失败原因。抽成一个函数，是为了让"哪种错给哪句话"集中在一处，
   以后接 API 时会冒出各种错误码，都在这里翻译。 */
export function describeError(err) {
  if (!err) return '切换失败，请再试一次。'
  const msg = String(err.message || err)
  if (msg.includes('网络')) return '网络好像出问题了，没能切换成功。'
  return '切换失败，请再试一次。'
}
