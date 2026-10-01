import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addItem,
  appendHistory,
  getFilter,
  getHistory,
  getMeta,
  getStorageStatus,
  loadItems,
  removeItem,
  restoreBuiltin,
  setFilter,
} from './lib/storage.js'
import { applyFilter, collectTags } from './lib/filter.js'
import { describeError, fetchNextResult } from './lib/drawService.js'
import { SPICY_ANY, TAG_PRESETS, VIEW_STATE } from './lib/constants.js'
import Home from './pages/Home.jsx'
import List from './pages/List.jsx'
import Add from './pages/Add.jsx'
import History from './pages/History.jsx'

// 四个页面。路由方式见 TECH_DESIGN.md §8.2：
// 用 hash 路由，因为 PRD 的 J3 要求「不经过首页刷新直接进入历史记录页」
const PAGES = [
  { hash: '#/', title: '首页', hint: '' },
  { hash: '#/list', title: '我的清单', hint: '看看有哪些候选，也可以删掉不想吃的。' },
  { hash: '#/add', title: '添加', hint: '把常吃的那几家也加进来。' },
  { hash: '#/history', title: '历史记录', hint: '最近推荐过什么，都记在这儿。' },
]

function readHash() {
  const hash = window.location.hash || '#/'
  return PAGES.some((p) => p.hash === hash) ? hash : '#/'
}

/* ── 「状态演示」开关（Day 13）────────────────────────────────────────
   地址栏加 ?demo=normal ｜ empty ｜ loading ｜ error。

   为什么要留它：数据全部来自 localStorage，是同步读取、不联网的 ——
   「加载中」和「错误」这两种状态**本来就遇不到**。它们是给第 3 周接真实 API
   预留的位置；在那之前，只能手动把它们调出来看一眼，
   免得放几个月没人管、接上 API 那天才发现样式全不对。

   ⚠️ 它**只给验收和开发用，不给用户看**：
      页脚那个下拉只在地址里带了 `?demo=` 时才出现 ——
      客户打开产品时，页面上一个字都不会多出来。                        */
const DEMO_OPTIONS = [
  { value: VIEW_STATE.success, label: '正常' },
  { value: VIEW_STATE.empty, label: '空' },
  { value: VIEW_STATE.loading, label: '加载中' },
  { value: VIEW_STATE.error, label: '错误' },
]

/* 读地址栏里的 ?demo=。没有、或者值不认识 → 返回 null（= 正常产品状态） */
function readDemoState() {
  if (typeof window === 'undefined') return null
  const s = new URLSearchParams(window.location.search).get('demo')
  return DEMO_OPTIONS.some((o) => o.value === s) ? s : null
}

/* 数据说明 —— 放在页脚，所有页面都看得到。
   它同时顶掉了两件事：① 让人知道店名是真品牌、菜品是内置清单
   ② 说清"不涉及交易、不接平台数据"，免得用户以为这里能下单 */
const DATA_NOTE =
  '店名为真实连锁品牌，菜品为内置清单。本工具只帮你决定吃什么、去哪家 —— ' +
  '不涉及任何交易，也不接入任何平台数据。'

export default function App() {
  const [hash, setHash] = useState(readHash)
  const [items, setItems] = useState([])
  const [filter, setFilterState] = useState({ spicyMax: SPICY_ANY, excludeTags: [] })
  const [history, setHistory] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [rec, setRec] = useState({
    status: 'idle',
    item: null,
    candidateCount: 0,
    itemCount: 0,
    error: null,
  })
  const [storageIssue, setStorageIssue] = useState(false)

  /* 演示状态（地址栏 ?demo=）。放成 state 而不是每次读地址栏 ——
     这样页脚那个下拉一改，界面立刻跟着变。 */
  const [demoState, setDemoState] = useState(readDemoState)

  /* 「返回上一页」用：记住上一个页面是哪一个。
     ⚠️ 不用 history.back() —— 用户直接打开 #/list（没有上一页）时，
        history.back() 会把他**带出站外**，那就成了 bug。
        自己记一个"上一个页面"，没有记录就退回首页，行为可控。 */
  const prevHashRef = useRef(null)
  const lastHashRef = useRef(hash)

  // 洗牌袋只放内存，不写本地存储 —— PRD §5.2 规定「刷新就重新装袋」，
  // 所以它天生是个运行态。放进 useRef，切页面不丢，刷新才重置。
  const bagRef = useRef(null)
  const drawnForRef = useRef(null)
  /* 防连点：正在取数时又点就忽略。按钮也会被禁用 ——
     按钮禁用是给用户看的，这个 ref 是给逻辑兜底的（万一将来有人把 disabled 拿掉）。 */
  const drawingRef = useRef(false)
  /* 用来取消上一轮取数：连点多次时，只有最后一次的结果会生效 */
  const drawAbortRef = useRef(null)

  /* 把数据层的真实状态同步到界面。
     存储才是唯一真相，界面不自己造一份 —— 这样任何时候显示的都是存储里的东西。 */
  const sync = useCallback(() => {
    setItems(loadItems())
    setFilterState(getFilter())
    setHistory(getHistory())
    setUpdatedAt(getMeta().updatedAt)
  }, [])

  useEffect(() => {
    const onChange = () => setHash(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  /* 页面变了 → 把"刚才那一页"记下来，给页头的「返回」按钮用 */
  useEffect(() => {
    if (lastHashRef.current !== hash) {
      prevHashRef.current = lastHashRef.current
      lastHashRef.current = hash
    }
  }, [hash])

  useEffect(() => {
    sync()
    if (getStorageStatus().notify) setStorageIssue(true)
  }, [sync])

  /* 当前候选 = 全部条目过一遍辣度上限与忌口标签。
     ⚠️ 注意：首页那两行「类别 / 平台」筛选**不在这里** —— 它们是浏览用的展示筛选，
        不进抽签池。所以改它们不会影响抽签结果，PRD §5.2 的洗牌袋一个字不用改。 */
  const candidates = useMemo(() => applyFilter(items, filter), [items, filter])

  /* 抽一个结果。顺序严格按 PRD §5.2：算候选 → 装袋/取袋 → 写历史。

     ⚠️ Day 11 改成了**异步**。为什么：取数这件事将来要跨网络，而"跨网络"
        必然带来两件现在没有的事 —— ① 有等待期（loading）② 会失败（error）。
        现在数据在本地，这两态都不会真发生，但状态机必须先建起来。
        取数的实现在 lib/drawService.js，那里有两个人工开关能把这两态调出来看。 */
  const draw = useCallback(async (opts) => {
    /* viaUser = 这次是**用户点出来的**（不是页面自动抽的）。
       界面靠它决定要不要说「切换成功」——
       首次自动抽取也是 ok，但那时用户没做任何操作，弹提示会莫名其妙。 */
    const viaUser = opts?.viaUser === true

    // 正在取数时又点了一次 → 忽略（按钮同时会被禁用，这里是第二道保险）
    if (drawingRef.current) return

    const all = loadItems()
    const pool = applyFilter(all, getFilter())

    // 候选为 0 → 不抽取，只给提示；绝不回退到被过滤掉的条目（H3）
    if (pool.length === 0) {
      bagRef.current = null
      setRec({ status: 'empty', item: null, candidateCount: 0, itemCount: all.length, error: null })
      return
    }

    // 「上一次结果」= 历史记录里最新的一条（含刷新前产生的），靠 itemId 传递
    const lastResultId = getHistory()[0]?.itemId ?? null

    // 取消上一轮还没结束的取数（连点场景），然后进入「加载中」
    drawAbortRef.current?.abort()
    const controller = new AbortController()
    drawAbortRef.current = controller

    drawingRef.current = true
    /* 注意：这里**保留当前 item**，只把状态切成 loading。
       结果卡片因此不会消失、布局不会跳 —— 对应的要求是「保持现有卡片布局」。 */
    setRec((r) => ({ ...r, status: 'loading', error: null }))

    try {
      const { id, bag } = await fetchNextResult({
        bag: bagRef.current,
        pool,
        lastResultId,
        signal: controller.signal,
      })
      // 被取消的这一轮：什么都不做（不算失败，也不动界面）
      if (controller.signal.aborted) return

      bagRef.current = bag
      const item = pool.find((c) => c.id === id)
      if (!item) throw new Error('取到的结果不在候选里')

      appendHistory(item) // 取出的结果写入历史记录
      setRec({
        status: 'ok',
        item,
        candidateCount: pool.length,
        itemCount: all.length,
        error: null,
        viaUser,
      })
      sync()
    } catch (err) {
      // 主动取消 / 被新一轮顶掉 → 不算失败，界面上什么都不该变
      if (controller.signal.aborted || err?.name === 'AbortError') return
      setRec((r) => ({ ...r, status: 'error', error: describeError(err) }))
    } finally {
      drawingRef.current = false
    }
  }, [sync])

  /* 每次「进入首页」都重新抽一次。
     为什么不是"只在刷新时抽一次"：
       在清单页删掉一个条目再回首页，如果沿用旧结果，显示的可能是已经被删掉的东西 ——
       而 I2 / C2 那两条验收标准要求「删掉的那条不再出现」。重抽一次就对齐了。
     闸门 drawnForRef 记住「这次进入首页已经抽过了」：
       · 离开首页时清空 → 下次回来会重抽
       · 同一个 hash 内不重复抽 → 顺便挡住 React StrictMode 把 effect 跑两遍 */
  useEffect(() => {
    if (hash !== '#/') {
      drawnForRef.current = null
      return
    }
    if (drawnForRef.current === hash) return
    drawnForRef.current = hash
    draw()
  }, [hash, draw])

  // ── 四个操作。改完数据立刻 sync，界面马上跟着变（C3 要求删除后数量立即更新）──
  const handleRemove = useCallback(
    (id) => {
      removeItem(id)
      sync()
    },
    [sync],
  )

  /* 清单页的「恢复默认库」：只补条目，**不抽** —— 在这一页抽会平白多写一条历史 */
  const handleRestore = useCallback(() => {
    restoreBuiltin()
    sync()
  }, [sync])

  /* 首页空状态里的「恢复默认库」：补完要立刻给一个结果，不然还是空页面 */
  const handleRestoreHome = useCallback(() => {
    restoreBuiltin()
    sync()
    draw()
  }, [sync, draw])

  const handleFilterChange = useCallback(
    (patch) => {
      setFilter(patch)
      sync()
    },
    [sync],
  )

  const handleAdd = useCallback(
    (input) => {
      const result = addItem(input)
      if (result.ok) sync()
      return result
    },
    [sync],
  )

  /* 「添加」页的标签选项 = 预设 ∪ 清单里已出现的标签。
     这样用户上次自己输的标签，下次添加时就在手边了。 */
  const addTagOptions = useMemo(
    () => [...new Set([...TAG_PRESETS, ...collectTags(items)])],
    [items],
  )

  /* ⚠️ 这里**不再**统一算四种状态，只把「演示覆盖值」往下传。
     为什么：每个页面该看自己的数据 —— 首页看推荐抽取的结果，清单页看条目数量，
     历史页看记录条数。拿首页的状态去套别的页面，会出现
     "首页候选为 0 → 清单页也跟着显示空态"这种张冠李戴的错。
     所以规则是：`页面自己算状态`，演示参数来了就覆盖掉。 */
  const demoOverride = demoState

  /* 换演示状态：改 React 状态（界面立刻变）+ 同步地址栏（刷新后保持同一个状态）。
     用 replaceState 而不是改 location.search —— 后者会**刷新页面**，一闪一闪的不好看。 */
  const handleDemoChange = useCallback((value) => {
    setDemoState(value)
    const url = new URL(window.location.href)
    url.searchParams.set('demo', value)
    window.history.replaceState({}, '', url)
  }, [])

  /* 退出演示：把 ?demo= 从地址里删掉，下拉也跟着收起来 */
  const handleDemoExit = useCallback(() => {
    setDemoState(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('demo')
    window.history.replaceState({}, '', url)
  }, [])

  /* 「返回上一页」：有记录就回上一页，没有（比如直接输地址进来的）就回首页 */
  const handleBack = useCallback(() => {
    window.location.hash = prevHashRef.current ?? '#/'
  }, [])

  const page = PAGES.find((p) => p.hash === hash) ?? PAGES[0]

  let content
  if (page.hash === '#/') {
    // 首帧 rec 还是 idle（抽取在 effect 里跑，差一帧）。这里直接不渲染，
    // 而不是把它当成「加载中」—— 那会让「loading 在本期触发不到」这句话变成假的。
    content =
      rec.status === 'idle' ? null : (
        <Home
          rec={rec}
          demoOverride={demoOverride}
          candidates={candidates}
          filter={filter}
          updatedAt={updatedAt}
          onDraw={draw}
          onRestore={handleRestoreHome}
          onFilterChange={handleFilterChange}
        />
      )
  } else if (page.hash === '#/list') {
    content = (
      <List
        items={items}
        filter={filter}
        demoOverride={demoOverride}
        onRemove={handleRemove}
        onRestore={handleRestore}
        onFilterChange={handleFilterChange}
      />
    )
  } else if (page.hash === '#/add') {
    content = <Add tagOptions={addTagOptions} onAdd={handleAdd} />
  } else {
    content = <History entries={history} demoOverride={demoOverride} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">想吃啥</span>
        <span className="brand-sub">中午不知道吃啥，问我</span>
        <nav className="nav">
          {PAGES.map((p) => (
            <a
              key={p.hash}
              href={p.hash}
              className={p.hash === page.hash ? 'nav-item active' : 'nav-item'}
              /* aria-current="page" —— 让读屏软件也知道"你现在在哪一页"。
                 只有它，光靠一个 active 类名，屏幕阅读器是读不出来的。 */
              aria-current={p.hash === page.hash ? 'page' : undefined}
            >
              {p.title}
            </a>
          ))}
        </nav>
      </header>

      {storageIssue && (
        <div className="banner">
          数据将无法保存（浏览器的本地存储不可用）。这次打开期间功能照常用，只是关掉页面后不会保留。
        </div>
      )}

      <main className="main">
        {/* 首页要摆卡片网格，撑满容器才排得下多栏；其余三页保持 760px 的好读宽度 */}
        <section className={page.hash === '#/' ? 'panel panel-wide' : 'panel'}>
          {page.hash !== '#/' && (
            <>
              {/* 返回上一页。首页是入口，不需要这个按钮，所以只在其余三页出现。
                  ⚠️ 没走 history.back()（直接输地址进来时会把人带出站外），
                     而是回到"刚才那一页"，没有记录就回首页 —— 见 handleBack。 */}
              <button className="back-btn" type="button" onClick={handleBack}>
                ← 返回
              </button>
              <h1>{page.title}</h1>
              {page.hint && <p className="hint">{page.hint}</p>}
            </>
          )}
          {content}
        </section>

        <footer className="footer">
          {/* 数据说明：原来挂在首页网格下面，Day 13 挪到页脚 ——
              它讲的是整个产品（数据从哪来、不涉及什么），放页脚所有页面都看得到。
              顺便顶掉了原来页脚那行「当前页面地址」，那是开发时看的，不该给用户看到。 */}
          <p className="data-note">{DATA_NOTE}</p>

          {/* 「状态演示」开关：**只有地址里带了 ?demo= 才出现** ——
              客户打开产品时页面上一个字都不会多出来。 */}
          {demoState && (
            <p className="demo-bar">
              <span className="demo-label">状态演示</span>
              <select
                className="select demo-select"
                value={demoState}
                onChange={(e) => handleDemoChange(e.target.value)}
                aria-label="切换演示状态"
              >
                {DEMO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button className="demo-exit" type="button" onClick={handleDemoExit}>
                退出演示
              </button>
            </p>
          )}
        </footer>
      </main>
    </div>
  )
}
