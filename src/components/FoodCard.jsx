import { useRef, useState } from 'react'
import { PLATFORM_LABEL, SPICY_LABEL, TYPE_LABEL } from '../lib/constants.js'
import { platformSearchLabel, platformSearchUrl } from '../lib/platformLink.js'
import FoodImage from './FoodImage.jsx'
import { useEmojiBurst } from './EmojiBurst.jsx'

/* 一张卡片 = 一个条目（店 / 菜）。
   升级后每张卡片顶部带程序化生成的暗调抽象美食图，
   支持 3D 鼠标跟随倾斜（全息玻璃质感）。 */
export default function FoodCard({ item, variant = 'default', footer, onClick }) {
  const cardRef = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)
  const burst = useEmojiBurst()

  const tags = Array.isArray(item.tags) ? item.tags : []
  const platform = item.platform ?? 'any'
  const platformText = PLATFORM_LABEL[platform] ?? PLATFORM_LABEL.any
  const searchUrl = platformSearchUrl(platform, item.name)
  const searchLabel = platformSearchLabel(platform, item.name, platformText)
  const isHero = variant === 'hero'

  function handleMove(e) {
    if (isHero || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setTilt({ x: (y - 0.5) * -10, y: (x - 0.5) * 10 })
  }

  function handleLeave() {
    setTilt({ x: 0, y: 0 })
    setHovered(false)
  }

  const transform = hovered
    ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-6px) translateZ(12px)`
    : `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`

  function handleClick(e) {
    // 点击卡片触发 emoji burst 粒子爆炸
    if (cardRef.current) {
      burst(cardRef.current)
    }
    // 如果有外部传入的 onClick，也触发（如首页网格中点击卡片切换 Hero）
    onClick?.(e)
  }

  return (
    <article
      ref={cardRef}
      className={isHero ? 'food-card hero' : 'food-card'}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={{
        transform,
        transition: hovered && (tilt.x !== 0 || tilt.y !== 0) ? 'none' : 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <FoodImage name={item.name} type={item.type} className="food-card-img" />

      <div className="food-card-body">
        <div className="food-card-head">
          <h3 className="food-card-name">{item.name}</h3>
          {searchUrl ? (
            <a
              className="food-card-platform"
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={searchLabel}
              title={searchLabel}
            >
              {platformText}
              <span className="platform-go" aria-hidden="true">↗</span>
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
      </div>
    </article>
  )
}
