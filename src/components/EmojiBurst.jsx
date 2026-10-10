import { useEffect, useRef } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   EmojiBurst · 粒子爆炸效果
   ─────────────────────────────────────────────────────────────────────
   从原型 HTML 中提取的 emoji burst 效果：
   点击元素时，从元素中心迸发出 12 个 emoji，向四周飞散并旋转消失。

   用法：
     const burst = useEmojiBurst()
     <button onClick={(e) => burst(e.currentTarget)}>点我</button>
   ═══════════════════════════════════════════════════════════════════════ */

const EMOJIS = ['✨', '🌟', '💫', '⭐', '🔥', '🎉', '🍜', '🥢', '🌶️', '🥟', '🍗', '🦐']

export function useEmojiBurst() {
  const containerRef = useRef(null)

  useEffect(() => {
    // 创建全局容器（只执行一次）
    if (!containerRef.current && typeof document !== 'undefined') {
      const el = document.createElement('div')
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:visible;'
      document.body.appendChild(el)
      containerRef.current = el
    }
    return () => {
      if (containerRef.current) {
        containerRef.current.remove()
        containerRef.current = null
      }
    }
  }, [])

  return (targetElement) => {
    if (!containerRef.current || !targetElement) return
    const rect = targetElement.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    for (let i = 0; i < 12; i++) {
      const el = document.createElement('span')
      el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
      el.style.cssText = `
        position: fixed;
        left: ${centerX}px;
        top: ${centerY}px;
        font-size: 22px;
        pointer-events: none;
        z-index: 9999;
        will-change: transform, opacity;
      `
      const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.5
      const dist = 60 + Math.random() * 100
      const tx = Math.cos(angle) * dist
      const ty = Math.sin(angle) * dist
      const tr = (Math.random() - 0.5) * 360

      const anim = el.animate(
        [
          { opacity: 1, transform: 'translate(0,0) scale(1) rotate(0deg)' },
          { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(0.3) rotate(${tr}deg)` },
        ],
        {
          duration: 900 + Math.random() * 300,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
          fill: 'forwards',
        }
      )
      containerRef.current.appendChild(el)
      anim.onfinish = () => el.remove()
    }
  }
}
