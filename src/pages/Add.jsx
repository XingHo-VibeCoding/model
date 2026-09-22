import { useState } from 'react'
import { charLength } from '../lib/storage.js'
import { NAME_MAX, SPICY_LABEL, SPICY_LEVELS, TYPE_LABEL } from '../lib/constants.js'

/* 把数据层返回的 reason 翻译成人话（PRD D1 / D2 / D3 要求给出提示） */
const REASON_TEXT = {
  empty: '名称不能为空（也不能只输空格）',
  'too-long': `名称最多 ${NAME_MAX} 个字`,
  'no-type': '请先选类型：菜 还是 店',
  duplicate: '清单里已经有这个了',
}

/* 页面 3 · 添加（PRD §5）
   - 必填：名称（1–20 字）+ 类型；可选填：辣度（默认不限）、忌口标签（默认空）
   - 判重：先去首尾空格（含全角）再判重，同名不新增（D3）
   - 保存后立刻进候选池，能回首页也能回清单（K1）
   名称里带 emoji 或 <script> 之类的字符时，React 默认会转义成纯文本，
   不会执行、不会破版（D5）。所以这里**不能用 dangerouslySetInnerHTML**。 */
export default function Add({ tagOptions, onAdd }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [spicy, setSpicy] = useState('any')
  const [tags, setTags] = useState([])
  const [customTag, setCustomTag] = useState('')
  const [error, setError] = useState('')
  const [savedName, setSavedName] = useState('')

  /* 用 charLength 按「字符数」算，不用 name.length。
     因为 emoji 在 JS 里占 2 个码元 —— 用 .length 会把一个 19 字的名字算成 20+，
     直接违反 D5（含 emoji 的名字必须能保存）。 */
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

  function submit(event) {
    event.preventDefault()
    setSavedName('')
    const result = onAdd({ name, type, spicy, tags })

    if (result.ok) {
      // 保存成功：清空表单，留个提示，并把「下一步去哪」摆出来（K1 要求两条路都通）
      setError('')
      setSavedName(result.item.name)
      setName('')
      setType('')
      setSpicy('any')
      setTags([])
      setCustomTag('')
    } else {
      setError(REASON_TEXT[result.reason] ?? '没能保存，检查一下再试')
    }
  }

  return (
    <form className="form" onSubmit={submit}>
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

      <label className="field">
        <span className="field-label">
          辣度 <span className="opt">可选，不填就是「不限」</span>
        </span>
        <select className="select" value={spicy} onChange={(e) => setSpicy(e.target.value)}>
          {SPICY_LEVELS.map((v) => (
            <option key={v} value={v}>
              {SPICY_LABEL[v]}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="field-label">
          忌口标签 <span className="opt">可选，不填就永远不会被过滤掉</span>
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

      {error && <p className="form-error">{error}</p>}

      <button className="btn wide" type="submit">
        保存
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
    </form>
  )
}
