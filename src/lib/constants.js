/* 全局常量 —— 所有「魔法值」集中在这一个文件，改一处就够。
   对应 TECH_DESIGN.md §6.1 的取值定义。 */

/* 辣度：数据里实际存的 5 个取值。
   'any' 表示「不限」，过滤时视为通过任何辣度上限（PRD §5.1）。 */
export const SPICY_LEVELS = ['none', 'mild', 'medium', 'hot', 'any']

export const SPICY_LABEL = {
  none: '不辣',
  mild: '微辣',
  medium: '中辣',
  hot: '特辣',
  any: '不限',
}

/* 辣度上限的可选值（顺序 = 由宽到严，界面上按这个顺序排）。
   第一个是 'any'，也就是「过滤默认不生效」——对应 PRD 的 H1。 */
export const SPICY_MAX_OPTIONS = ['any', 'none', 'mild', 'medium', 'hot']

export const SPICY_ANY = 'any'

/* 条目类型：菜 / 店（PRD §5.1） */
export const TYPE_LABEL = { dish: '菜', shop: '店' }

/* 忌口标签的**预设**选项（PRD §5 页面 2：预设 + 可自己输入）。
   预设只是给个起点 —— 用户自己输的标签会另外从清单里收上来（见 filter.js 的 collectTags）。 */
export const TAG_PRESETS = [
  '香菜',
  '葱',
  '蒜',
  '牛肉',
  '羊肉',
  '海鲜',
  '虾',
  '花生',
  '内脏',
]

/* 名称长度：1–20 字（PRD §5.1）。
   注意这里说的是「字符数」，不是 JS 的 .length ——
   storage.js 里的 charLength() 负责按字符数算。 */
export const NAME_MIN = 1
export const NAME_MAX = 20

/* 历史记录上限（PRD J2） */
export const HISTORY_LIMIT = 20

/* 本地存储的键名。全部加 chisha: 前缀，避免和别的网站撞车。 */
export const STORAGE_KEYS = {
  items: 'chisha:items',
  filter: 'chisha:filter',
  history: 'chisha:history',
  meta: 'chisha:meta',
}

/* 数据结构版本号。以后给条目加字段时，靠它判断要不要做数据迁移。
   v2（Day 8）：条目新增 platform 字段。
   旧数据里没有这个字段时，读取端一律按「不限」处理（见 filter.js 的 passesPlatform）——
   和 PRD §5.1「用户自己加的东西默认永远不会被过滤掉」是同一条原则。 */
export const SCHEMA_VERSION = 2

/* ── 平台（Day 8 新增）────────────────────────────────────────────────
   这一条数据表示「这个东西在哪个外卖平台上点得到」。
   为什么要有它：爸爸拍板——推荐结果要能落到**一家找得到的店**，
   而"去哪个平台找"是这句话里缺的那半句。

   'any' = 不限。用户自己加的条目默认就是它，语义与辣度的 'any' 完全一致：
   过滤时**视为通过任何平台筛选**（守住 PRD §5.1「用户自己加的东西默认永远不会被过滤掉」）。 */
export const PLATFORMS = ['mt', 'tb', 'any']

export const PLATFORM_LABEL = {
  mt: '美团',
  tb: '淘宝闪购',
  any: '不限',
}

/* 平台筛选器的选项。
   ⚠️ 'all'（全部）**不是**条目的 platform 取值，它只说"这一维不筛"，
   所以它单独列出来，不要混进 PLATFORMS。 */
export const PLATFORM_FILTER_ALL = 'all'
export const PLATFORM_FILTER_OPTIONS = [PLATFORM_FILTER_ALL, 'mt', 'tb']
export const PLATFORM_FILTER_LABEL = { all: '全部', mt: '美团', tb: '淘宝闪购' }

/* ── 类别（= PRD §5.1 的「类型」：菜 / 店）────────────────────────────
   爸爸拍板：**类别与平台是两个平级的维度**，不是一个包着另一个。
   所以两行筛选器的结构、取值方式、默认值都对称。 */
export const TYPE_FILTER_ALL = 'all'
export const TYPE_FILTER_OPTIONS = [TYPE_FILTER_ALL, 'dish', 'shop']
export const TYPE_FILTER_LABEL = { all: '全部', dish: '菜', shop: '店' }

/* ── 页面状态 ───────────────────────────────────────────────────────
   ⚠️ 重要（今天那道掌握题的答案就在这里）：
   **loading 和 error 在本期架构下触发不到。**
   数据全部来自 localStorage，是**同步读取、不联网**的——没有等待，也没有请求失败。
   它们是为第 3 周接真实 API 预留的，靠地址参数人工触发（见 README）。
   **真正能自然发生的只有 success 和 empty 两种。**

   最容易忽略的是 empty：开发时手上永远有 50 条内置数据，永远看不到空；
   但真实的新用户第一次打开、或者把清单删光时，它就是空的。 */
export const VIEW_STATE = {
  loading: 'loading',
  success: 'success',
  empty: 'empty',
  error: 'error',
}

export const VIEW_STATE_LABEL = {
  loading: '加载中',
  success: '成功',
  empty: '空',
  error: '错误',
}
