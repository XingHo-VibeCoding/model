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
import { drawNext } from './lib/bag.js'
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

/* 人工触发 loading / error 的开关（地址栏加 ?state=loading 或 ?state=error）。

   为什么要留这个开关：数据全部来自 localStorage，是同步读取、不联网的 ——
   这两种状态**本来就遇不到**。它们是给第 3 周接真实 API 预留的位置，
   真到那天，它们会自己出现；在那之前，只能这样手动把它们调出来看一眼，
   免得放几个月没人管、接上 API 那天才发现样式全不对。 */
function readForcedState() {
  if (typeof window === 'undefined') return null
  const s = new URLSearchParams(window.location.search).get('state')
  return s === VIEW_STATE.loading || s === VIEW_STATE.error ? s : null
}

export default function App() {
  const [hash, setHash] = useState(readHash)
  const [items, setItems] = useState([])
  const [filter, setFilterState] = useState({ spicyMax: SPICY_ANY, excludeTags: [] })
  const [history, setHistory] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [rec, setRec] = useState({ status: 'idle', item: null, candidateCount: 0, itemCount: 0 })
  const [storageIssue, setStorageIssue] = useState(false)

  // 洗牌袋只放内存，不写本地存储 —— PRD §5.2 规定「刷新就重新装袋」，
  // 所以它天生是个运行态。放进 useRef，切页面不丢，刷新才重置。
  const bagRef = useRef(null)
  const drawnForRef = useRef(null)

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

  useEffect(() => {
    sync()
    if (getStorageStatus().notify) setStorageIssue(true)
  }, [sync])

  /* 当前候选 = 全部条目过一遍辣度上限与忌口标签。
     ⚠️ 注意：首页那两行「类别 / 平台」筛选**不在这里** —— 它们是浏览用的展示筛选，
        不进抽签池。所以改它们不会影响抽签结果，PRD §5.2 的洗牌袋一个字不用改。 */
  const candidates = useMemo(() => applyFilter(items, filter), [items, filter])

  /* 抽一个结果。顺序严格按 PRD §5.2：算候选 → 装袋/取袋 → 写历史。 */
  const draw = useCallback(() => {
    const all = loadItems()
    const pool = applyFilter(all, getFilter())

    // 候选为 0 → 不抽取，只给提示；绝不回退到被过滤掉的条目（H3）
    if (pool.length === 0) {
      bagRef.current = null
      setRec({ status: 'empty', item: null, candidateCount: 0, itemCount: all.length })
      return
    }

    // 「上一次结果」= 历史记录里最新的一条（含刷新前产生的），靠 itemId 传递
    const lastResultId = getHistory()[0]?.itemId ?? null
    const { id, bag } = drawNext(bagRef.current, pool, lastResultId)
    bagRef.current = bag

    const item = pool.find((c) => c.id === id)
    if (!item) return

    appendHistory(item) // 取出的结果写入历史记录
    setRec({ status: 'ok', item, candidateCount: pool.length, itemCount: all.length })
    sync()
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

  /* 首页要显示的四种状态。
     forced（地址栏参数）优先；否则按真实数据判断 ——
     能自然发生的只有 success 和 empty 两种。 */
  const viewState = useMemo(() => {
    const forced = readForcedState()
    if (forced) return forced
    return rec.status === 'empty' ? VIEW_STATE.empty : VIEW_STATE.success
  }, [rec.status])

  const page = PAGES.find((p) => p.hash === hash) ?? PAGES[0]

  let content
  if (page.hash === '#/') {
    // 首帧 rec 还是 idle（抽取在 effect 里跑，差一帧）。这里直接不渲染，
    // 而不是把它当成「加载中」—— 那会让「loading 在本期触发不到」这句话变成假的。
    content =
      rec.status === 'idle' ? null : (
        <Home
          rec={rec}
          viewState={viewState}
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
        onRemove={handleRemove}
        onRestore={handleRestore}
        onFilterChange={handleFilterChange}
      />
    )
  } else if (page.hash === '#/add') {
    content = <Add tagOptions={addTagOptions} onAdd={handleAdd} />
  } else {
    content = <History entries={history} />
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
              <h1>{page.title}</h1>
              {page.hint && <p className="hint">{page.hint}</p>}
            </>
          )}
          {content}
        </section>

        <p className="footer">当前页面地址：{page.hash}</p>
      </main>
    </div>
  )
}
