import { PLATFORM_LABEL, SPICY_LABEL, TYPE_LABEL } from '../lib/constants.js'
import { platformSearchLabel, platformSearchUrl } from '../lib/platformLink.js'

/* 一张卡片 = 一个条目（店 / 菜）。
   这个组件对应 Day 8 清单里的「余力加练：可复用卡片组件」——
   首页的卡片网格用它；以后别的页面要展示条目，也是直接用它。

   卡片上必须能看到（对应 PRD 的 C4 与 J1）：
     · 名称
     · 类型（菜 / 店）
     · 辣度
     · 忌口标签
     · 平台（Day 8 新增）—— 它存在的意义是回答「去哪个 App 搜这家店」

   variant：
     · 'default' —— 网格里的一张普通卡片
     · 'hero'    —— 首页最上方那张「今天就吃这家」的主推荐卡

   安全性：名称直接用 {item.name} 渲染，React 默认做文本转义 ——
   所以含 emoji 或 <script> 的名称会原样显示，不会执行、不会破版（PRD D5）。 */
export default function FoodCard({ item, variant = 'default', footer }) {
  const tags = Array.isArray(item.tags) ? item.tags : []
  const platform = item.platform ?? 'any'
  const platformText = PLATFORM_LABEL[platform] ?? PLATFORM_LABEL.any

  /* 「去平台搜」的跳转入口（Day 17）。
     没标平台的（`any` = 用户自己加的、没指定）→ null → 保持原来的纯装饰徽标，
     **不瞎猜一个平台替他决定**。逻辑和理由见 lib/platformLink.js。 */
  const searchUrl = platformSearchUrl(platform, item.name)
  const searchLabel = platformSearchLabel(platform, item.name, platformText)

  return (
    <article className={variant === 'hero' ? 'food-card hero' : 'food-card'}>
      <div className="food-card-head">
        <h3 className="food-card-name">{item.name}</h3>
        {searchUrl ? (
          <a
            className="food-card-platform"
            href={searchUrl}
            /* 出站开新窗口 —— 用户想回来时我们的页面还在原地（见 platformLink.js） */
            target="_blank"
            rel="noopener noreferrer"
            aria-label={searchLabel}
            title={searchLabel}
          >
            {platformText}
            {/* 小箭头 = "点了会离开本页"。光靠颜色和文字，用户看不出来 */}
            <span className="platform-go" aria-hidden="true">
              ↗
            </span>
          </a>
        ) : (
          <span className="food-card-platform muted" title="没有标平台，两个平台都能找">
            {platformText}
          </span>
        )}
      </div>

      <div className="food-card-badges">
        <span className="badge">{TYPE_LABEL[item.type] ?? item.type}</span>
        <span className="badge">{SPICY_LABEL[item.spicy] ?? item.spicy}</span>
        {item.source === 'user' && <span className="badge mine">我加的</span>}
        {tags.map((tag) => (
          <span className="badge tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>

      {footer && <div className="food-card-foot">{footer}</div>}
    </article>
  )
}
