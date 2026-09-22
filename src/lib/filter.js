/* 过滤逻辑（纯函数：不碰存储、不碰界面）
 * 对应 PRD §5「页面 2 · 我的清单」里的可选过滤，以及 H 组验收标准。
 *
 * 关键点：过滤**默认不生效**（H1）。上限是 'any' 时直接放行，
 * 这样「零门槛」那条最硬的约束（打开就能用、什么都不用填）才不会被破坏。
 */

import { SPICY_ANY } from './constants.js'

/* 辣度由宽到严的顺序，用来判断「有没有超过上限」。
   'any'（不限）不放进这个序列 —— 它在两个位置含义不同，必须分开处理：
     · 作为「上限」时：'any' = 过滤不生效（H1）
     · 作为「条目辣度」时：视为通过任何上限（PRD §5.1）
   rank() 对 'any' 返回 -1，两者都靠这个 -1 来区分。 */
const SPICY_ORDER = ['none', 'mild', 'medium', 'hot']

function rank(level) {
  const i = SPICY_ORDER.indexOf(level)
  return i === -1 ? -1 : i
}

/* 算出「当前候选条目」。顺序不能反：先按过滤条件筛，剩下的才是候选。 */
export function applyFilter(items, filter) {
  const spicyMax = filter?.spicyMax ?? SPICY_ANY
  const excludeTags = Array.isArray(filter?.excludeTags) ? filter.excludeTags : []

  return items.filter((item) => {
    // ① 辣度上限。上限是 'any' 就完全不过滤
    if (spicyMax !== SPICY_ANY) {
      const itemRank = rank(item.spicy)
      // itemRank === -1 → 该条目标的是「不限」，通过任何上限
      if (itemRank !== -1 && itemRank > rank(spicyMax)) return false
    }

    // ② 忌口标签：勾选即排除（只要命中任意一个就排除）
    if (excludeTags.length) {
      const tags = Array.isArray(item.tags) ? item.tags : []
      if (tags.some((t) => excludeTags.includes(t))) return false
    }

    return true
  })
}

/* 把清单里出现过的忌口标签全收上来（含用户自己输入的）。
   过滤选项 = 预设 ∪ 这个列表 —— H5 要求「自己输入的标签也要出现在过滤选项里」。
   比如用户加了一条带「折耳根」的，勾选列表里就得有「折耳根」这一项。 */
export function collectTags(items) {
  const set = new Set()
  for (const item of items) {
    for (const tag of item.tags ?? []) set.add(tag)
  }
  return [...set].sort()
}
