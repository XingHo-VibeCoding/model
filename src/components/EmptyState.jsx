/* 空状态引导。PRD 有两处要求「不要给空白页、要给引导」：
   · F1 —— 候选池为空时，首页和「我的清单」页都要给引导（去添加 / 恢复默认库）
   · J3 —— 历史记录为空时要显示「还没有记录」
   所以抽成一个组件，三处共用。 */
export default function EmptyState({ title, text, children }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  )
}
