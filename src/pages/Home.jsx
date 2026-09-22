import { SPICY_LABEL, TYPE_LABEL } from '../lib/constants.js'

/* 页面 1 · 首页（PRD §5）
   - 打开就显示一个具体的推荐结果，不需要任何输入（A1、A3）
   - 结果旁显示「类型 · 辣度」（J1）
   - 一个大的「换一个」按钮：点一下立刻给出下一个结果（B1、B2）
   - 底部一行小字入口，跳到「添加」页（K1）
   - 候选为 0 / 恰好 1 两种特殊情况，按 PRD §5.2 给提示（H3、B4）
   这个组件只负责显示；抽什么是 App 那边算好传进来的。 */

export default function Home({ rec, onDraw, onRestore }) {
  /* 候选为 0：不抽取、给引导，**不得回退到被过滤掉的条目**（H3）。
     分两种情况给不同的引导：
       · 清单里有东西、但被过滤条件筛没了 → 该去放宽过滤
       · 清单本身就是空的 → 该去添加，或恢复默认库
     两种情况下「去添加」和「恢复默认库」都要在，这是 F1 要求的。 */
  if (rec.status === 'empty') {
    const filteredOut = rec.itemCount > 0
    return (
      <>
        <div className="empty-state">
          <p className="empty-title">
            {filteredOut ? '条件太严了，要不要放宽' : '清单还是空的'}
          </p>
          <p className="empty-text">
            {filteredOut
              ? `清单里有 ${rec.itemCount} 条，但都被当前的过滤条件排除了。`
              : '还没有任何候选，先加几个常吃的进来吧。'}
          </p>
          <div className="empty-actions">
            <a className="btn" href="#/add">
              去添加
            </a>
            {filteredOut && (
              <a className="btn ghost" href="#/list">
                去放宽过滤
              </a>
            )}
            <button className="btn ghost" type="button" onClick={onRestore}>
              恢复默认库
            </button>
          </div>
        </div>

        <p className="entry-link">
          <a href="#/add">我常吃的那几家也加进去</a>
        </p>
      </>
    )
  }

  if (rec.status !== 'ok' || !rec.item) {
    return <p className="hint">正在准备……</p>
  }

  const { item, candidateCount } = rec

  return (
    <>
      <div className="result">
        <p className="result-label">今天中午</p>
        <p className="result-name">{item.name}</p>
        <p className="result-meta">
          {TYPE_LABEL[item.type] ?? item.type} · {SPICY_LABEL[item.spicy] ?? item.spicy}
        </p>

        <button className="draw-btn" type="button" onClick={onDraw}>
          换一个
        </button>

        {/* 候选恰好 1 个时说明一下，免得用户以为"换一个"坏了（B4） */}
        {candidateCount === 1 && <p className="result-tip">现在只有 1 个可选</p>}
      </div>

      <p className="entry-link">
        <a href="#/add">我常吃的那几家也加进去</a>
        <span className="dim">　当前候选 {candidateCount} 个</span>
      </p>
    </>
  )
}
