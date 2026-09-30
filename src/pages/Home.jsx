import { useEffect, useMemo, useState } from 'react'
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

  /* ── 一次「换一个」的反馈（Day 11）──────────────────────────────────
     三种状态在这里翻译成人能看懂的样子：
       loading → 按钮上写「加载中…」并标成不可用（不再补一句，避免重复）
       ok      → 「切换成功」，2.5 秒后自己淡出（**只在用户自己点的那一次出现** ——
                 首次自动抽取也是 ok，但那时用户什么都没做，弹提示会莫名其妙）
       error   → 失败原因 + 按钮变成「重试」，**不自动消失**
                 （它是"待处理"，用户要看着原因决定要不要重试）                */
  const isSwapping = rec.status === 'loading'

  /* 「切换成功」是**一瞬间的确认**，所以要自己收起来（Day 11 · 复盘修正）。

     原来的写法是"显示到下次点击为止，永不自动消失" —— 理由是截图不会错过。
     但爸爸一句话点破了代价：按过一次之后它就**一直挂在那儿**，
     再看到的人已经想不起"我刚才干了什么"，于是它不再像"刚刚生效了"，
     而像贴在卡片上的一个标签。确认类反馈必须是**短暂**的。

     ⚠️ 只有成功会收；**失败不收** —— 失败是"待处理"状态，
        用户要看着原因决定要不要「重试」，那行字就是操作的一部分。
     ⚠️ 淡出后**保留占位**（不做 display:none / 不卸载）：
        否则它下面那句「加上我常吃的」会往上一跳 —— 而"布局别跳"是硬要求。 */
  const OK_HIDE_MS = 2500
  const [okFading, setOkFading] = useState(false)

  const feedback = useMemo(() => {
    if (rec.status === 'error') {
      return { kind: 'err', text: rec.error ?? '切换失败，请再试一次。' }
    }
    if (rec.status === 'ok' && rec.viaUser) {
      return { kind: 'ok', text: '切换成功' }
    }
    return null
  }, [rec.status, rec.error, rec.viaUser])

  /* 每次"用户点出来的成功"都重新计时：先恢复可见，再 2.5 秒后淡出。
     依赖里带 rec.item —— 连点两次时结果变了，计时就重来。 */
  useEffect(() => {
    if (rec.status !== 'ok' || !rec.viaUser) {
      setOkFading(false)
      return undefined
    }
    setOkFading(false)
    const timer = setTimeout(() => setOkFading(true), OK_HIDE_MS)
    return () => clearTimeout(timer)
  }, [rec.status, rec.viaUser, rec.item])

  /* 结果换了 → 让整块轻轻闪一下。
     用 class 切换而不是 key：class 变不会重建 DOM，键盘焦点留得住。 */
  const [isFlash, setIsFlash] = useState(false)
  useEffect(() => {
    if (!rec.item) return undefined
    setIsFlash(true)
    const timer = setTimeout(() => setIsFlash(false), 320)
    return () => clearTimeout(timer)
  }, [rec.item])

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
          <section className={`hero-block result-swap${isFlash ? ' is-flash' : ''}`}>
            {/* Day 10：「今天就吃这家」这句原本在这里当小标签，
                已提到页头做大标题 —— 这里不再重复说一遍 */}
            <FoodCard
              item={rec.item}
              variant="hero"
              footer={
                <>
                  {/* 三态都在按钮上：正常「换一个」／加载中（不可用）／失败后变「重试」。
                      失败时按钮就是重试入口，不用再多一个按钮。

                      ⚠️ Day 11 · 甲：加载中**不用原生 `disabled`**。
                      给一个"正被聚焦"的按钮设 disabled，浏览器会**立刻把焦点丢到 BODY**，
                      而且设回 false 也**不会自己回来**（实测过，是 HTML 规范行为）。
                      后果：键盘用户按第 1 次 Enter 生效、**第 2 次 Enter 就打不到按钮了**。
                      改用 `aria-disabled` —— 读屏软件照样念得出"现在不可用"，
                      而按钮保持可聚焦、焦点环不丢。
                      "那连点会不会重复抽？" —— 不会：App.jsx 里的 drawingRef 就是干这个的
                      （当初特意留的第二道保险，正好在这里派上用场）。 */}
                  <button
                    className="draw-btn"
                    type="button"
                    onClick={() => onDraw({ viaUser: true })}
                    aria-disabled={isSwapping || undefined}
                    aria-busy={isSwapping || undefined}
                  >
                    {isSwapping ? '加载中…' : rec.status === 'error' ? '重试' : '换一个'}
                  </button>

                  {/* 结果反馈。role="status" 让屏幕阅读器也念出来 ——
                      "生效了"这件事，不该只有看得见的人知道。
                      三个类名都写成字面量（不用 `draw-feedback ${feedback.kind}` 那种拼法）：
                      这样类名能被静态检查查到，不会变成"查不到的动态类名"。 */}
                  {feedback && (
                    <p
                      className={
                        feedback.kind === 'ok'
                          ? okFading
                            ? 'draw-feedback ok is-fading'
                            : 'draw-feedback ok'
                          : 'draw-feedback err'
                      }
                      role="status"
                    >
                      {feedback.text}
                    </p>
                  )}

                  {/* 候选恰好 1 个时说一句，免得用户以为「换一个」坏了（B4）。
                      加载中不说这句 —— 那时按钮已经写着「加载中…」，两句话挤在一起太吵。 */}
                  {rec.candidateCount === 1 && !isSwapping && (
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

          {/* Day 12 · 余力加练：这一行加 role="status"，
              这样点完筛选，用读屏软件的人也能听到「当前显示 X 个」——
              以前只有看得见的人知道筛出了几条。

              为什么**只**加在这一行、不给下面那句空态提示也加：
              筛空时这一行会念「当前显示 0 个」，已经说清结果了；
              两处同时播报会念两遍，反而更吵。 */}
          <p className="count-line" role="status">
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
