/* 外卖平台跳转链接（Day 17 余力加练）
 *
 * ── 先把边界说清楚，免得以后有人理解偏 ──────────────────────────────
 *   ✅ 这是一个**跳转**：给个可点的入口，用户自己点 → 跳到平台去搜这家店
 *   ❌ 不是**取数**：把平台的数据拉进我们的库
 *      （那条路 PRD §7.2 已经拍板不做：没有公开接口、也涉及合规问题 ——
 *        是**做不到**，不是"还没做"。爸爸 2026-10-09 也确认过他要的是跳转）
 *
 * 这正好是 `platform` 字段一直以来的用途：**「去哪个 App 搜这家店」**。
 *
 * ── 为什么跳「搜索页」，不跳「店铺页」 ──────────────────────────────
 * 我们库里存的是**品牌名**（"张亮麻辣烫"），不是某家分店的网址。
 * 所以能做的只有"用这个名字去搜一下"—— 搜出来第一条通常就是它。
 *
 * ── 为什么新窗口打开（target="_blank"）────────────────────────────────
 * 跳过去就是**出站**了。开新标签的话，用户想回来时我们的页面还在原地。
 * 不然他点一下就等于离开了产品，还得靠浏览器后退 —— 体验很差。
 */

/* 各平台的搜索地址。**只放品牌名，不带任何用户数据。** */
const SEARCH_URL = {
  // 美团网页版搜索。手机上它的网页版会自己引导「打开 App」。
  mt: (keyword) => `https://www.meituan.com/s/${encodeURIComponent(keyword)}`,
  // 淘宝搜索页（淘宝闪购是淘宝里的外卖业务，从搜索页进得去）
  tb: (keyword) => `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}`,
}

/**
 * 生成跳转地址。
 * @param {string} platform `mt` / `tb` / `any`
 * @param {string} name 店名或菜名
 * @returns {string|null} 有明确平台时返回 URL；`any`（没标平台）返回 **null** ——
 *   那是"用户自己加的、没指定平台"，没地方可跳，**不要瞎猜一个平台替他决定**。
 */
export function platformSearchUrl(platform, name) {
  const build = SEARCH_URL[platform]
  if (!build) return null
  const keyword = String(name ?? '').trim()
  if (!keyword) return null
  return build(keyword)
}

/**
 * 给读屏软件用的说明文字。
 * 链接文字只有「美团」两个字，读屏念出来不知道是要干什么 —— 所以补一句完整的。
 * 顺带说明"会打开新窗口"，这是外部链接的基本礼貌（WCAG 3.2.5）。
 */
export function platformSearchLabel(platform, name, platformText) {
  if (!platformSearchUrl(platform, name)) return null
  return `去${platformText}搜「${name}」（会打开新窗口）`
}
