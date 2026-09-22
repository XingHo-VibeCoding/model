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

/* 数据结构版本号。以后给条目加字段时，靠它判断要不要做数据迁移。 */
export const SCHEMA_VERSION = 1
