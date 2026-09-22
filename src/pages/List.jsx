import { useMemo, useState } from 'react'
import { SPICY_LABEL, SPICY_MAX_OPTIONS, TAG_PRESETS } from '../lib/constants.js'
import { collectTags } from '../lib/filter.js'
import ItemRow from '../components/ItemRow.jsx'
import EmptyState from '../components/EmptyState.jsx'

/* 页面 2 · 我的清单（PRD §5）
   - 列出全部条目，每条显示名称 / 类型 / 辣度 / 忌口标签（C4）
   - 每条可删除（C2），删除后数量立即更新（C3）
   - 计数区分来源：「共 N 个 · 其中你自己加了 M 个」（C1）
   - 可选过滤，**默认不生效**（H1）；过滤条件会持久化（H4）
   - 「恢复默认库」把内置条目补回来，已有的不重复添加（C3）
   - 清单为空时给引导，不是空白（F1）
   这个组件只负责显示和收集操作，数据都由 App 传进来。 */
export default function List({ items, filter, onRemove, onRestore, onFilterChange }) {
  const [customTag, setCustomTag] = useState('')

  const userCount = items.filter((it) => it.source === 'user').length

  /* 过滤选项 = 预设 ∪ 清单里出现过的标签。
     用 Set 去重，再排序；H5 要求用户在「添加」页自己输的标签也能出现在这里。 */
  const tagOptions = useMemo(() => {
    return [...new Set([...TAG_PRESETS, ...collectTags(items)])]
  }, [items])

  const excludeTags = Array.isArray(filter?.excludeTags) ? filter.excludeTags : []

  function toggleTag(tag) {
    const next = excludeTags.includes(tag)
      ? excludeTags.filter((t) => t !== tag)
      : [...excludeTags, tag]
    onFilterChange({ excludeTags: next })
  }

  /* 在过滤区直接手输一个标签（H5：自己输的标签要能出现在过滤选项里并被勾上）*/
  function addCustomTag() {
    const tag = customTag.trim()
    if (!tag) return
    if (!excludeTags.includes(tag)) onFilterChange({ excludeTags: [...excludeTags, tag] })
    setCustomTag('')
  }

  return (
    <>
      <div className="count-line">
        共 <b>{items.length}</b> 个 · 其中你自己加了 <b>{userCount}</b> 个
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="清单还是空的"
          text="加几个常吃的进来，或者把默认库补回来。"
        >
          <a className="btn" href="#/add">
            去添加
          </a>
          <button className="btn ghost" type="button" onClick={onRestore}>
            恢复默认库
          </button>
        </EmptyState>
      ) : (
        <>
          <ul className="item-list">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onRemove={onRemove} />
            ))}
          </ul>
          <button className="btn ghost wide" type="button" onClick={onRestore}>
            恢复默认库
          </button>
        </>
      )}

      {/* ── 可选过滤。默认不生效，这是 PRD 里最硬的一条约束（H1） */}
      <div className="filter-box">
        <div className="filter-head">
          过滤条件 <span className="dim">（默认不生效，想设才设）</span>
        </div>

        <label className="field">
          <span className="field-label">辣度上限</span>
          <select
            className="select"
            value={filter?.spicyMax ?? 'any'}
            onChange={(e) => onFilterChange({ spicyMax: e.target.value })}
          >
            {SPICY_MAX_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {SPICY_LABEL[v]}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label">忌口（勾上的会被排除）</span>
          <div className="tag-grid">
            {tagOptions.map((tag) => {
              const on = excludeTags.includes(tag)
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
    </>
  )
}
