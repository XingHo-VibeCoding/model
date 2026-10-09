import { VIEW_STATE } from '../lib/constants.js'

/* 四种页面状态的统一外壳。

   ⚠️ 四种**现在全都真能触发**了（Day 17 接上接口之后）：
     · success —— 有候选、正常显示                      ✅ 自然发生
     · empty   —— 候选为 0（清单空 / 过滤太严）          ✅ 自然发生
     · loading —— 打开页面时正在向服务器取数             ✅ 自然发生（约几百毫秒）
     · error   —— 取不到（断网 / 接口挂了 / 超时）        ✅ 自然发生

   ⭐ 这就是 Day 13 那句话的兑现：当时数据全在浏览器本地、同步读，
      loading 和 error **物理上不可能发生**，只能靠 ?demo= 人工调出来看。
      那时写下「loading / error 是给第 3 周接真实 API 预留的位置」——
      今天接口接上了，这两个状态就自己长出来了，**样式和文案一个字没改**。

   最容易被忽略的是 empty：开发时手上永远有 50 条内置数据，永远看不到空；
   可真实的新用户第一次打开、或者把清单删光时，它就是空的。 */

export default function ViewState({
  state,
  children,
  emptyTitle = '这里还是空的',
  emptyText,
  emptyActions,
  onRetry,
  errorTitle = '没能取到数据',
  errorText = '等会儿再试一次。',
  errorActions,
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
        <p className="state-title">{errorTitle}</p>
        <p className="state-text">{errorText}</p>
        {/* errorActions 优先：启动失败时那里放两个按钮（重试 / 先用缓存看），
            比只有「重试」多一条出路 —— 断网时用户至少还能翻自己的清单。 */}
        {(errorActions || onRetry) && (
          <div className="state-actions">
            {errorActions ?? (
              <button className="btn" type="button" onClick={onRetry}>
                重试
              </button>
            )}
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
