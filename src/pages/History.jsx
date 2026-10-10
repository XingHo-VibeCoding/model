import { VIEW_STATE } from '../lib/constants.js'
import EmptyState from '../components/EmptyState.jsx'
import ViewState from '../components/ViewState.jsx'

/* 页面 4 · 历史记录（打破对称布局版）
   ─────────────────────────────────────────────────────────────────────
   抛弃传统的"垂直列表"模式，改为波浪形时间流：
   · 页面左侧垂直大标题
   · 记录项呈波浪形左右交替分布，形成视觉韵律
   · 最新的记录最大最亮，越往下逐渐缩小变淡
   · 时间线用一条弯曲的虚线串联
   · 大量负空间，打破所有居中对称规则
   ═══════════════════════════════════════════════════════════════════════ */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function formatTime(at) {
  const d = new Date(at)
  const p = (n) => String(n).padStart(2, '0')
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]} ${hm}`
}

export default function History({ entries, stateOverride, errorActions, errorText, onRetry }) {
  const state =
    stateOverride ?? (entries.length === 0 ? VIEW_STATE.empty : VIEW_STATE.success)

  if (state === VIEW_STATE.loading || state === VIEW_STATE.error) {
    return (
      <ViewState
        state={state}
        errorActions={errorActions}
        errorText={errorText}
        onRetry={onRetry}
      />
    )
  }

  if (state === VIEW_STATE.empty) {
    return (
      <EmptyState title="还没有记录" text="去首页看一眼，推荐过什么就会记在这儿。">
        <a className="btn" href="#/">
          去首页
        </a>
      </EmptyState>
    )
  }

  return (
    <div className="history-universe">
      {/* 左侧垂直大标题 */}
      <div className="history-header">
        <h1 className="history-title">历史</h1>
        <p className="history-sub">{entries.length} 条记录</p>
        <p className="history-hint">最多保留 20 条</p>
      </div>

      {/* 波浪形时间流 */}
      <div className="history-wave">
        {/* 弯曲的时间线 */}
        <div className="history-wave-line" aria-hidden="true" />

        {entries.map((entry, index) => {
          const isLeft = index % 2 === 0
          const scale = Math.max(0.75, 1 - index * 0.04)
          const opacity = Math.max(0.5, 1 - index * 0.03)

          return (
            <div
              key={entry.id}
              className={`history-wave-item ${isLeft ? 'wave-left' : 'wave-right'}`}
              style={{
                animationDelay: `${index * 80}ms`,
                opacity,
              }}
            >
              <div className="history-wave-card" style={{ transform: `scale(${scale})` }}>
                <span className="history-wave-name">{entry.name}</span>
                <span className="history-wave-time">
                  {index === 0 && <span className="badge newest">最新</span>}
                  {formatTime(entry.at)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="history-note">
        这里记的是「发生过的事」—— 把某个条目从清单里删掉，它在这一页仍然留着。
      </p>
    </div>
  )
}
