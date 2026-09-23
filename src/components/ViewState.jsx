import { VIEW_STATE } from '../lib/constants.js'

/* 四种页面状态的统一外壳。

   ⚠️ 先说清楚哪两种**真能触发**（这正是今天那道掌握题的答案）：
     · success —— 有候选、正常显示            ✅ 自然发生
     · empty   —— 候选为 0（清单空 / 过滤太严）✅ 自然发生
     · loading —— 数据从 localStorage **同步**读，根本没有等待
                                                 ⚠️ 现在只在地址栏加 ?state=loading 才出现
     · error   —— 不联网，也就没有"请求失败"   ⚠️ 现在只在地址栏加 ?state=error 才出现

   loading / error 是给**第 3 周接真实 API 预留的位置**：那天数据要过网络，
   这两个状态才会真的发生。现在把它们做出来、并且能人工触发，是为了那时候不用回头补。

   最容易被忽略的是 empty：开发时手上永远有 50 条内置数据，永远看不到空；
   可真实的新用户第一次打开、或者把清单删光时，它就是空的。 */

export default function ViewState({
  state,
  children,
  emptyTitle = '这里还是空的',
  emptyText,
  emptyActions,
  onRetry,
  errorText = '没能取到数据。等会儿再试一次。',
}) {
  // 成功：直接把内容放出来
  if (state === VIEW_STATE.success) return children

  if (state === VIEW_STATE.loading) {
    return (
      <div className="view-state" aria-busy="true" aria-live="polite">
        <p className="state-text">正在加载……</p>
        {/* 骨架屏：先占住位置，避免内容出现时页面跳动 */}
        <div className="skeleton-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton-card" key={i}>
              <span className="skeleton-line w60" />
              <span className="skeleton-line w40" />
              <span className="skeleton-line w80" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (state === VIEW_STATE.error) {
    return (
      <div className="view-state" role="alert">
        <p className="state-title">没能取到数据</p>
        <p className="state-text">{errorText}</p>
        {onRetry && (
          <div className="state-actions">
            <button className="btn" type="button" onClick={onRetry}>
              重试
            </button>
          </div>
        )}
      </div>
    )
  }

  // empty —— 顺手也当兜底：state 是没见过的值时走这里，总比白屏好
  return (
    <div className="view-state">
      <p className="state-title">{emptyTitle}</p>
      {emptyText && <p className="state-text">{emptyText}</p>}
      {emptyActions && <div className="state-actions">{emptyActions}</div>}
    </div>
  )
}
