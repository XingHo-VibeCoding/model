import { useEffect, useRef, useState } from 'react'
import { resolveFoodImage } from '../lib/foodImages.js'

/* ═══════════════════════════════════════════════════════════════════════
   FoodImage · 美食图片组件（真实图片 + 程序化占位图双轨）
   ─────────────────────────────────────────────────────────────────────
   优先加载真实美食摄影图（按名称关键词匹配），没有匹配时回退到
   Canvas 2D 程序化生成的暗调抽象艺术图。

   每张程序化图由菜品名称哈希驱动（同名同图），确保重新渲染时不会跳动。
   生成过程放在 useEffect + requestAnimationFrame 中异步执行，避免阻塞首屏。
   ═══════════════════════════════════════════════════════════════════════ */

function makeRng(seed) {
  let s = seed | 0
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function stringHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return h
}

function generateFoodImage(name, type, width = 360, height = 220) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const seed = stringHash(name)
  const rng = makeRng(seed)
  const baseHue = type === 'dish' ? 38 : 330

  ctx.fillStyle = `hsl(${baseHue}, 25%, 5%)`
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < 4; i++) {
    const bx = rng() * width
    const by = rng() * height
    const br = 60 + rng() * 120
    const bh = baseHue + (rng() - 0.5) * 50
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br)
    grad.addColorStop(0, `hsla(${bh}, ${55 + rng() * 25}%, ${18 + rng() * 12}%, ${0.12 + rng() * 0.15})`)
    grad.addColorStop(1, `hsla(${bh}, ${55 + rng() * 25}%, ${18 + rng() * 12}%, 0)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }

  for (let i = 0; i < 3; i++) {
    const cx = width * (0.2 + rng() * 0.6)
    const cy = height * (0.2 + rng() * 0.6)
    const r = 30 + rng() * 60
    const h = baseHue + (rng() - 0.5) * 40
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    grad.addColorStop(0, `hsla(${h}, ${60 + rng() * 30}%, ${30 + rng() * 20}%, ${0.2 + rng() * 0.2})`)
    grad.addColorStop(1, `hsla(${h}, ${60 + rng() * 30}%, ${30 + rng() * 20}%, 0)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }

  const gx = width * (0.4 + rng() * 0.2)
  const gy = height * (0.35 + rng() * 0.3)
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 80 + rng() * 50)
  const glowHue = baseHue + (rng() - 0.5) * 20
  glow.addColorStop(0, `hsla(${glowHue}, 80%, 45%, 0.25)`)
  glow.addColorStop(0.5, `hsla(${glowHue}, 70%, 30%, 0.1)`)
  glow.addColorStop(1, `hsla(${glowHue}, 70%, 30%, 0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < 400; i++) {
    const x = rng() * width
    const y = rng() * height
    const s = rng() < 0.8 ? 1 : 1 + rng() * 2
    const light = 30 + rng() * 50
    const alpha = 0.04 + rng() * 0.1
    ctx.fillStyle = `hsla(${baseHue + (rng() - 0.5) * 30}, 30%, ${light}%, ${alpha})`
    ctx.fillRect(x, y, s, s)
  }

  const streakY = height * (0.3 + rng() * 0.4)
  const streakGrad = ctx.createLinearGradient(0, streakY - 20, 0, streakY + 20)
  streakGrad.addColorStop(0, `hsla(${baseHue}, 60%, 50%, 0)`)
  streakGrad.addColorStop(0.5, `hsla(${baseHue}, 60%, 50%, 0.08)`)
  streakGrad.addColorStop(1, `hsla(${baseHue}, 60%, 50%, 0)`)
  ctx.fillStyle = streakGrad
  ctx.fillRect(0, streakY - 20, width, 40)

  return canvas.toDataURL('image/png')
}

export default function FoodImage({ name, type, className = '' }) {
  const [src, setSrc] = useState('')
  const [isReal, setIsReal] = useState(false)
  const rafRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. 尝试查找真实图片
    const realPath = resolveFoodImage(name)
    if (realPath) {
      setIsReal(true)
      setSrc(realPath)
      return
    }

    // 2. 没有真实图片 → 异步生成程序化占位图
    setIsReal(false)
    rafRef.current = requestAnimationFrame(() => {
      try {
        const dataUrl = generateFoodImage(name, type)
        setSrc(dataUrl)
      } catch (e) {
        console.warn('[FoodImage] generate failed:', e)
      }
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [name, type])

  if (!src) {
    return (
      <div
        className={className}
        style={{
          background: type === 'dish'
            ? 'linear-gradient(135deg, hsl(38,25%,8%) 0%, hsl(38,25%,5%) 100%)'
            : 'linear-gradient(135deg, hsl(330,25%,8%) 0%, hsl(330,25%,5%) 100%)',
        }}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={src}
      alt={isReal ? name : ''}
      className={`${className}${isReal ? ' is-real' : ''}`}
      loading="lazy"
      aria-hidden={!isReal}
    />
  )
}
