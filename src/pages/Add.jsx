import { useRef, useState } from 'react'
import { charLength } from '../lib/storage.js'
import {
  NAME_MAX,
  PLATFORM_LABEL,
  PLATFORMS,
  SPICY_LABEL,
  SPICY_LEVELS,
  TYPE_LABEL,
} from '../lib/constants.js'

/* 把数据层返回的 reason 翻译成人话（PRD D1 / D2 / D3 要求给出提示）。
   ⚠️ 「重名」现在由**后端**判（数据库的唯一约束才是权威），
      后端会回一句写好的中文，界面优先用那句（见 submit 里 result.message 那条分支）。
      这里的 duplicate 只作为兜底留着。 */
const REASON_TEXT = {
  empty: '名称不能为空（也不能只输空格）',
  'too-long': `名称最多 ${NAME_MAX} 个字`,
  'no-type': '请先选类型：菜 还是 店',
  duplicate: '清单里已经有这个了',
}

/* 页面 3 · 添加（打破对称布局版）
   ─────────────────────────────────────────────────────────────────────
   抛弃传统的"垂直堆叠表单"模式，改为分散式布局：
   · 页面中央大面积留白
   · 表单元素铺在网格里：名称左上、类型右上、平台中左、辣度中右、标签整行
   · 保存按钮在正下方，超大尺寸
   · 整体像一张散落的星座图

   ⚠️ Day 18：提交**真的写到云端**了（POST /api/items）——
      所以多了「保存中」这个状态（网络不像本地写盘那样瞬间完成），
      也多了防连点（慢网下连点会发两次 POST，第二次必被后端挡回 409）。
   ═══════════════════════════════════════════════════════════════════════ */

export default function Add({ tagOptions, onAdd }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [platform, setPlatform] = useState('any')
  const [spicy, setSpicy] = useState('any')
  const [tags, setTags] = useState([])
  const [customTag, setCustomTag] = useState('')
  const [error, setError] = useState('')
  const [savedName, setSavedName] = useState('')
  const [saving, setSaving] = useState(false)

  /* 防连点：用的是 **ref** 而不是看 saving 状态 ——
     setState 是异步的，同一帧里连点两次时 saving 还是 false，拦不住。
     按钮上的 aria-disabled 是给用户看的（灰掉 + 文案变「保存中…」），
     这个 ref 是逻辑层的兜底。两道都要有。 */
  const savingRef = useRef(false)

  const used = charLength(name)

  function toggleTag(tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function addCustomTag() {
    const tag = customTag.trim()
    if (!tag) return
    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))
    setCustomTag('')
  }

  async function submit(event) {
    event.preventDefault()

    if (savingRef.current) return // 防连点（逻辑层兜底）
    savingRef.current = true
    setSaving(true)
    setSavedName('')
    setError('')

    try {
      const result = await onAdd({ name, type, platform, spicy, tags })

      if (result.ok) {
        setSavedName(result.item.name)
        // 存成功了才清空 —— 失败时保留内容，用户改一个字就能重试
        setName('')
        setType('')
        setPlatform('any')
        setSpicy('any')
        setTags([])
        setCustomTag('')
      } else {
        /* 服务端给的中文提示优先（它比我编的准）；本地校验的 reason 走 REASON_TEXT 兜底 */
        setError(result.message || REASON_TEXT[result.reason] || '没能保存，检查一下再试')
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <form className="form-scattered" onSubmit={submit}>
      {/* 中央大标题 */}
      <div className="add-hero">
        <h1 className="add-title">加上你爱吃的</h1>
        <p className="add-sub">把它放进候选池，下次抽签就有它</p>
      </div>

      {/* 分散式表单网格 */}
      <div className="add-grid">
        {/* 左上：名称 */}
        <div className="add-cell add-cell-tl">
          <label className="field">
            <span className="field-label">
              名称 <span className="req">必填</span>
              <span className={used > NAME_MAX ? 'counter over' : 'counter'}>
                {used}/{NAME_MAX}
              </span>
            </span>
            <input
              className="input"
              value={name}
              placeholder="比如 麻辣烫，或者 沙县小吃"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>

        {/* 右上：类型 */}
        <div className="add-cell add-cell-tr">
          <div className="field">
            <span className="field-label">
              类型 <span className="req">必填</span>
            </span>
            <div className="radio-row">
              {['dish', 'shop'].map((t) => (
                <label key={t} className={type === t ? 'radio-chip on' : 'radio-chip'}>
                  <input
                    type="radio"
                    name="type"
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  {TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 中左：平台 */}
        <div className="add-cell add-cell-ml">
          <div className="field">
            <span className="field-label">
              平台 <span className="opt">可选</span>
            </span>
            <div className="radio-row">
              {PLATFORMS.map((p) => (
                <label key={p} className={platform === p ? 'radio-chip on' : 'radio-chip'}>
                  <input
                    type="radio"
                    name="platform"
                    checked={platform === p}
                    onChange={() => setPlatform(p)}
                  />
                  {PLATFORM_LABEL[p]}
                </label>
              ))}
            </div>
            <p className="field-note">选了它，卡片上就能「去这个平台搜」</p>
          </div>
        </div>

        {/* 中右：辣度 */}
        <div className="add-cell add-cell-mr">
          <label className="field">
            <span className="field-label">
              辣度 <span className="opt">可选</span>
            </span>
            <select className="select" value={spicy} onChange={(e) => setSpicy(e.target.value)}>
              {SPICY_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {SPICY_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 整行：忌口标签 */}
        <div className="add-cell add-cell-full">
          <div className="field">
            <span className="field-label">
              忌口标签 <span className="opt">可选</span>
            </span>
            <div className="tag-grid">
              {tagOptions.map((tag) => {
                const on = tags.includes(tag)
                return (
                  <label key={tag} className={on ? 'tag-chip on' : 'tag-chip'}>
                    <input type="checkbox" checked={on} onChange={() => toggleTag(tag)} />
                    {tag}
                  </label>
                )
              })}
            </div>
            <div className="inline-add">
              <input
                className="input"
                value={customTag}
                placeholder="自己输一个，比如 折耳根"
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomTag()
                  }
                }}
              />
              <button className="btn ghost" type="button" onClick={addCustomTag}>
                加上
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 底部：错误提示 + 保存按钮 */}
      <div className="add-footer">
        {error && <p className="form-error">{error}</p>}

        {/* ⚠️ 「保存中」用 aria-disabled，不用原生 disabled ——
            给已聚焦的按钮加 disabled 会把焦点丢到 BODY 且不还回来，键盘就打不到了。 */}
        <button
          className="btn add-save"
          type="submit"
          aria-disabled={saving || undefined}
          aria-busy={saving || undefined}
        >
          {saving ? '保存中…' : '✨ 保存'}
        </button>

        {savedName && (
          <div className="form-saved">
            <p>
              已加入：「<b>{savedName}</b>」
            </p>
            <div className="empty-actions">
              <a className="btn" href="#/">
                去首页看看
              </a>
              <a className="btn ghost" href="#/list">
                去我的清单
              </a>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
