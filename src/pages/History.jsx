import EmptyState from '../components/EmptyState.jsx'

/* 页面 4 · 历史记录（PRD §5）
   - 按时间倒序，最新的在最上面；每条显示**名称与时间**（J4）
   - 最多 20 条，超出后最早的被移除 —— 这个「裁剪」在数据层做（storage.js），
     界面这里只管显示，不重复实现一遍规则
   - 没有记录时显示「还没有记录」，不是空白（J3）
   - **删除条目不影响这里**：历史存的是当时的名称快照，从来不去回查条目（J4） */

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

export default function History({ entries }) {
  if (!entries.length) {
    return (
      <EmptyState title="还没有记录" text="去首页看一眼，推荐过什么就会记在这儿。">
        <a className="btn" href="#/">
          去首页
        </a>
      </EmptyState>
    )
  }

  return (
    <>
      <div className="count-line">
        共 <b>{entries.length}</b> 条 <span className="dim">（最多保留 20 条）</span>
      </div>

      <ul className="history-list">
        {entries.map((entry, index) => (
          <li className="history-row" key={entry.id}>
            <span className="history-name">{entry.name}</span>
            <span className="history-time">
              {index === 0 && <span className="badge newest">最新</span>}
              {formatTime(entry.at)}
            </span>
          </li>
        ))}
      </ul>

      <p className="dim center">
        这里记的是「发生过的事」—— 把某个条目从清单里删掉，它在这一页仍然留着。
      </p>
    </>
  )
}
