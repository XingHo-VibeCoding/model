/* 洗牌袋（PRD §5.2）—— 纯函数：不碰存储、不碰界面。
   没有任何 import，所以可以直接在 Node 里跑测试。

规则原文取自 PRD §5.2：
  · 一轮 = 袋中每个条目恰好出现一次，按顺序逐个取出。一轮长度 = 当前候选条目数。
  · 装袋 = 把当前候选条目随机打乱，形成袋。
  · 取袋 = 按顺序取出下一个条目。
  · 袋取空 → 按当前候选重新装袋，下一次抽取从新袋开始。
  · 「不连续重复」是结构性保证：轮内天然相邻不同；
    边界衔接 = **任何一次装袋之后**，若新袋的第一个 == 上一次抽取产生的结果，
    就把第一个与第二个交换（候选 ≥ 2 时交换一定可行）。
  · 每次抽取之前先校验装袋条件（= 当前候选集合）：不一致 → 立即丢弃旧袋重装。
  · 袋子**不持久化**：刷新就重新装袋 —— 所以它天然是个运行态，不该进本地存储。
*/

/* 「装袋条件」的签名：把当前候选的 id 排序后拼成一串。
   只要这个签名没变，就可以沿用现有的袋子。 */
export function poolKey(candidates) {
  return candidates.map((c) => c.id).sort().join('|')
}

/* Fisher–Yates 洗牌。把 rand 做成参数，是为了测试时能塞一个确定的随机源。 */
function shuffled(ids, rand) {
  const arr = [...ids]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

export function makeBag(candidates, lastResultId, rand = Math.random) {
  const order = shuffled(candidates.map((c) => c.id), rand)

  // 边界衔接 —— 注意是「任何一次装袋之后」都要做，
  // 不只是跨轮：袋取空后重装、候选中途变了重装、刷新时装袋，全都算。
  if (order.length >= 2 && order[0] === lastResultId) {
    const t = order[0]
    order[0] = order[1]
    order[1] = t
  }

  return { poolKey: poolKey(candidates), order, cursor: 0 }
}

/* 现有的袋子还能不能用？
   不能用的情况有两种：① 候选集合变了（装袋条件不一致）
                      ② 袋子取空了（需要按当前候选重新装袋） */
export function isUsable(bag, candidates) {
  if (!bag) return false
  if (bag.poolKey !== poolKey(candidates)) return false
  if (bag.cursor >= bag.order.length) return false
  return true
}

/* 抽下一个。返回 { id, bag, refilled }
   refilled = true 表示这次抽取之前重新装了袋（测试和排查时有用）。 */
export function drawNext(bag, candidates, lastResultId, rand = Math.random) {
  const usable = isUsable(bag, candidates)
  const current = usable ? bag : makeBag(candidates, lastResultId, rand)
  const id = current.order[current.cursor]
  return {
    id,
    bag: { ...current, cursor: current.cursor + 1 },
    refilled: !usable,
  }
}
