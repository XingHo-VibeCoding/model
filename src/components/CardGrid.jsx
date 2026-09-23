import { Fragment } from 'react'

/* 卡片网格。
   布局本身交给 CSS（.card-grid 用 grid + auto-fill），这里只管"排" ——
   组件不掺样式细节，换布局只改 CSS 一个地方。

   桌面多栏并排、手机纵向堆叠且不横向溢出，是 Day 8 爸爸提的视觉要求；
   用 auto-fill + minmax 就能同时满足两边，不需要写两套断点。

   items 为空时渲染 empty（传进来的是空状态元素），
   这样"有卡片 / 没卡片"两件事在同一个地方收口。 */
export default function CardGrid({ items = [], renderItem, empty = null }) {
  if (!items.length) return empty

  return (
    <div className="card-grid">
      {items.map((item) => (
        <Fragment key={item.id}>{renderItem(item)}</Fragment>
      ))}
    </div>
  )
}
