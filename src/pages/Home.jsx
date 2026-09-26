import { useMemo } from 'react'
import {
  PLATFORM_FILTER_ALL,
  PLATFORM_FILTER_LABEL,
  PLATFORM_FILTER_OPTIONS,
  SPICY_ANY,
  SPICY_LABEL,
  SPICY_MAX_OPTIONS,
  TYPE_FILTER_ALL,
  TYPE_FILTER_LABEL,
  TYPE_FILTER_OPTIONS,
} from '../lib/constants.js'
import PageHeader from '../components/PageHeader.jsx'
import FoodCard from '../components/FoodCard.jsx'
import CardGrid from '../components/CardGrid.jsx'
import ViewState from '../components/ViewState.jsx'

/* 页面 1 · 首页（Day 8 重写版）

   从下往上三层，顺序就是用户看东西的顺序：
     ① 页头   —— 标题 + 「清单更新于 …」
     ② 主推荐 —— 一张 hero 卡片，打开就有一个具体结果（PRD A1、A3）
     ③ 浏览区 —— **三行平级的筛选（类别 / 平台 / 口味）** + 统一的卡片网格

   ⚠️ 两行筛选是「浏览筛选」，**不进抽签池**：
      主页那张推荐卡是从**全部候选**里抽的（跨类别、跨平台），
      而下面网格是你按类别/平台翻清单。
      这样做的好处是抽取逻辑（PRD §5.2 洗牌袋）一个字都不用改，B/I 两组验收标准不受影响。
      代价：推荐卡可能不在你当前筛出来的那一组里 —— 如果你希望两者联动，改一行即可（见 README）。

   主推荐卡**保留在网格上方**（不是替换掉）—— 加法不做减法，B1–B5 那五条验收标准测的就是它。 */

/* 辣度浓淡的等级 —— 只表示顺序，用来算「离你的口味有多近」（Day 10 · 甲）。
   ⚠️ 数据里还有第 5 种辣度 'any'（不限，比如奶茶、水果捞）—— 它不在这张表里，
      排序时会被当成「与口味无关」，排到最后。 */
const SPICY_ORDER = { none: 0, mild: 1, medium: 2, hot: 3 }

export default function Home({
  rec, // { status, item, candidateCount, itemCount }
  viewState, // success / empty / loading / error
  candidates, // 当前候选（已过辣度与忌口）
  filter,
  updatedAt,
  onDraw,
  onRestore,
  onFilterChange,
}) {
  const platformFilter = filter?.platformFilter ?? PLATFORM_FILTER_ALL
  const typeFilter = filter?.typeFilter ?? TYPE_FILTER_ALL

  /* 网格里显示什么：候选 → 套一层「类别 / 平台」筛选 → 再按**口味偏好**排序。
     注意 platform === 'any'（用户自己加的、没标平台）在选了某个平台时**照样显示** ——
     和辣度 'any' 是同一条原则，守住 PRD §5.1「用户自己加的东西默认永远不会被过滤掉」。 */
  const gridItems = useMemo(() => {
    const shown = candidates.filter((item) => {
      const platform = item.platform ?? 'any'
      if (platformFilter !== PLATFORM_FILTER_ALL && platform !== 'any' && platform !== platformFilter) {
        return false
      }
      if (typeFilter !== TYPE_FILTER_ALL && item.type !== typeFilter) return false
      return true
    })

    /* Day 10 · 甲：按口味偏好排序。

       你表达口味的唯一地方，就是「我的清单」里那个**辣度上限** ——
       设成「中辣」，说明你的口味落在中辣那一档。于是：
         · 越接近那个辣度的越靠前（设「中辣」→ 中辣打头，再是微辣、不辣）
         · 辣度标着「不限」的条目（奶茶、水果捞这类）跟口味无关 → 排最后

       没设上限（= 不限）时说明你还没表达过口味 —— **保持原顺序**，
       不假装知道你喜欢什么。所以这一条要生效，得先去「我的清单」设一次。

       ⚠️ 它只影响**列表的显示顺序**，不碰主推荐卡的抽取 —— PRD §5.2 的洗牌袋一个字没动。 */
    const target = SPICY_ORDER[filter?.spicyMax]
    if (target === undefined) return shown

    const distance = (item) => {
      const rank = SPICY_ORDER[item.spicy]
      return rank === undefined ? 99 : Math.abs(rank - target)
    }
    return [...shown].sort((a, b) => distance(a) - distance(b))
  }, [candidates, platformFilter, typeFilter, filter?.spicyMax])

  const filteredOut = rec.itemCount > 0

  return (
    <>
      {/* Day 10：「加上我常吃的」原来挂在页头右侧（窄屏下会占满整行、
          看起来像个主按钮，把标题和推荐切开）。已挪到推荐结果之后 —— 见下面 hero-block。 */}
      <PageHeader
        title="今天就吃这家"
        subtitle="今天中午吃什么？不用填任何东西"
        updatedAt={updatedAt}
      />

      <ViewState
        state={viewState}
        onRetry={onDraw}
        emptyTitle={filteredOut ? '条件太严了，要不要放宽' : '清单还是空的'}
        emptyText={
          filteredOut
            ? `清单里有 ${rec.itemCount} 条，但都被当前的过滤条件排除了。`
            : '还没有任何候选，先加几个常吃的进来吧。'
        }
        emptyActions={
          <>
            <a className="btn" href="#/add">
              去添加
            </a>
            {filteredOut && (
              <a className="btn ghost" href="#/list">
                去放宽过滤
              </a>
            )}
            <button className="btn ghost" type="button" onClick={onRestore}>
              恢复默认库
            </button>
          </>
        }
      >
        {/* ② 主推荐卡 */}
        {rec.item && (
          <section className="hero-block">
            {/* Day 10：「今天就吃这家」这句原本在这里当小标签，
                已提到页头做大标题 —— 这里不再重复说一遍 */}
            <FoodCard
              item={rec.item}
              variant="hero"
              footer={
                <>
                  <button className="draw-btn" type="button" onClick={onDraw}>
                    换一个
                  </button>
                  {/* 候选恰好 1 个时说一句，免得用户以为「换一个」坏了（B4） */}
                  {rec.candidateCount === 1 && (
                    <p className="result-tip">现在只有 1 个可选</p>
                  )}
                </>
              }
            />

            {/* Day 10 从页头挪过来，放在推荐结果之后 ——
                顺序上才讲得通：先看到推荐，再想「这个我常吃，加上它」 */}
            <p className="hero-action">
              <a className="btn ghost small" href="#/add">
                加上我常吃的
              </a>
            </p>
          </section>
        )}

        {/* ③ 浏览区：三行平级维度（类别 / 平台 / 口味）+ 卡片网格 */}
        <section className="browse-block">
          <div className="axis-rows">
            <AxisRow
              label="类别"
              options={TYPE_FILTER_OPTIONS}
              labels={TYPE_FILTER_LABEL}
              value={typeFilter}
              onPick={(v) => onFilterChange({ typeFilter: v })}
            />
            <AxisRow
              label="平台"
              options={PLATFORM_FILTER_OPTIONS}
              labels={PLATFORM_FILTER_LABEL}
              value={platformFilter}
              onPick={(v) => onFilterChange({ platformFilter: v })}
            />
            {/* Day 10：口味原来只在「我的清单」页里，得跳过去才能设。
                现在摆到候选列表**正前面** —— 想换口味当场点，列表立刻跟着重排。

                ⚠️ 它和上面两行性质不同（给以后的自己看）：
                   类别 / 平台 = 只是"挑哪些给你看"；
                   口味 = 还决定"按什么顺序排"（越接近你选的越靠前，
                          标着「不限」的条目排在最后）。 */}
            <AxisRow
              label="口味"
              options={SPICY_MAX_OPTIONS}
              labels={SPICY_LABEL}
              value={filter?.spicyMax ?? SPICY_ANY}
              onPick={(v) => onFilterChange({ spicyMax: v })}
            />
          </div>

          <p className="count-line">
            共 <b>{candidates.length}</b> 个候选，当前显示 <b>{gridItems.length}</b> 个
          </p>

          <CardGrid
            items={gridItems}
            renderItem={(item) => <FoodCard item={item} />}
            empty={<p className="hint">这一组没有符合条件的条目，换个类别或平台看看。</p>}
          />

          {/* 有了这句，就不用去改 PRD §7.2「不接真实外卖平台数据」 */}
          <p className="demo-note">
            演示数据：店名都是真实连锁品牌。这个工具只帮你决定吃什么、去哪家，
            不涉及任何交易，也不接任何平台数据。
          </p>
        </section>
      </ViewState>

      <p className="entry-link">
        <a href="#/add">我常吃的那几家也加进去</a>
      </p>
    </>
  )
}

/* 一行筛选器。类别和平台**共用这一个组件** ——
   因为爸爸要求这两个维度是平级的：结构一样、取值方式一样、默认值一样，
   只有选项内容不同。共用一个组件，就不会出现"一个包着另一个"的形态。 */
function AxisRow({ label, options, labels, value, onPick }) {
  return (
    <div className="axis-row">
      <span className="axis-label">{label}</span>
      <div className="axis-opts">
        {options.map((v) => (
          <button
            key={v}
            type="button"
            className={v === value ? 'axis-opt is-on' : 'axis-opt'}
            aria-pressed={v === value}
            onClick={() => onPick(v)}
          >
            {labels[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
