import { useMemo, useState } from 'react'
import {
  SPICY_LABEL,
  SPICY_MAX_OPTIONS,
  TAG_PRESETS,
  TYPE_LABEL,
  VIEW_STATE,
} from '../lib/constants.js'
import { collectTags } from '../lib/filter.js'
import { platformSearchLabel, platformSearchUrl } from '../lib/platformLink.js'
import EmptyState from '../components/EmptyState.jsx'
import FoodImage from '../components/FoodImage.jsx'
import ViewState from '../components/ViewState.jsx'

/* 页面 2 · 我的清单（杂志交替大图卡片版）
   ─────────────────────────────────────────────────────────────────────
   抛弃传统的"垂直列表"和之前"左右偏移"的不稳定感，改为：
   · 顶部：大标题 + 水平滚动过滤 pills
   · 主体：全宽交替大图卡片流
     - 奇数项：左图（42%）右文，图片左侧大圆角
     - 偶数项：左文右图（42%），图片右侧大圆角
   · 卡片有真实美食图、玻璃态背景、hover 抬起发光
   · 移动端自动改为上图下文垂直堆叠
   ═══════════════════════════════════════════════════════════════════════ */

export default function List({
  items,
  filter,
  stateOverride,
  errorActions,
  errorText,
  onRetry,
  onRemove,
  onRestore,
  onFilterChange,
}) {
  const [customTag, setCustomTag] = useState('')

  const state =
    stateOverride ?? (items.length === 0 ? VIEW_STATE.empty : VIEW_STATE.success)
  const isBusy = state === VIEW_STATE.loading || state === VIEW_STATE.error

  const userCount = items.filter((it) => it.source === 'user').length

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

  function addCustomTag() {
    const tag = customTag.trim()
    if (!tag) return
    if (!excludeTags.includes(tag)) onFilterChange({ excludeTags: [...excludeTags, tag] })
    setCustomTag('')
  }

  if (isBusy) {
    return (
      <ViewState
        state={state}
        errorActions={errorActions}
        errorText={errorText}
        onRetry={onRetry}
      />
    )
  }

  const isEmpty = state === VIEW_STATE.empty

  return (
    <div className="list-magazine">
      {/* 标题区 */}
      <header className="list-magazine-header">
        <div className="list-magazine-headline">
          <h1 className="list-magazine-title">我的清单</h1>
          {items.length > 0 && (
            <span className="list-magazine-count">{items.length}</span>
          )}
        </div>
        <p className="list-magazine-sub">
          {isEmpty
            ? '还没添加任何美食'
            : `${items.length} 个候选 · ${userCount} 个自己添加`}
        </p>

        {/* 过滤条 */}
        {!isEmpty && (
          <div className="list-magazine-filters">
            <div className="filter-group">
              <span className="filter-label">辣度</span>
              <select
                className="select filter-select"
                value={filter?.spicyMax ?? 'any'}
                onChange={(e) => onFilterChange({ spicyMax: e.target.value })}
              >
                {SPICY_MAX_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {SPICY_LABEL[v]}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-pill-scroll">
              {tagOptions.map((tag) => {
                const on = excludeTags.includes(tag)
                return (
                  <button
                    key={tag}
                    className={`filter-pill ${on ? 'on' : ''}`}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={on}
                  >
                    {on ? '✕ ' : ''}
                    {tag}
                  </button>
                )
              })}
            </div>

            <div className="filter-custom">
              <input
                className="input filter-input"
                value={customTag}
                placeholder="自定义忌口…"
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomTag()
                  }
                }}
              />
              <button
                className="btn ghost filter-add"
                type="button"
                onClick={addCustomTag}
              >
                加
              </button>
            </div>
          </div>
        )}
      </header>

      {isEmpty ? (
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
          <div className="list-magazine-flow">
            {items.map((item, index) => {
              const tags = Array.isArray(item.tags) ? item.tags : []
              const searchUrl = platformSearchUrl(item.platform, item.name)
              const searchLbl = platformSearchLabel(
                item.platform,
                item.name,
                item.platform === 'tb' ? '淘宝' : '美团'
              )
              const isFlipped = index % 2 === 1

              return (
                <article
                  key={item.id}
                  className={`magazine-card ${isFlipped ? 'flipped' : ''}`}
                  style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
                >
                  <div className="magazine-card-visual">
                    <FoodImage
                      name={item.name}
                      type={item.type}
                      className="magazine-card-img"
                    />
                    <div className="magazine-card-img-overlay" />
                  </div>

                  <div className="magazine-card-body">
                    <div className="magazine-card-meta">
                      <span
                        className={`magazine-card-type ${item.type}`}
                      >
                        {TYPE_LABEL[item.type]}
                      </span>
                      {item.source === 'user' && (
                        <span className="magazine-card-source">我加的</span>
                      )}
                    </div>

                    <h3 className="magazine-card-name">{item.name}</h3>

                    <div className="magazine-card-tags">
                      <span className="badge">{SPICY_LABEL[item.spicy]}</span>
                      {tags.map((tag) => (
                        <span className="badge tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="magazine-card-actions">
                      {searchUrl ? (
                        <a
                          className="magazine-card-link"
                          href={searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={searchLbl}
                        >
                          去{item.platform === 'tb' ? '淘宝' : '美团'}搜 →
                        </a>
                      ) : (
                        <span className="magazine-card-link disabled">
                          未指定平台
                        </span>
                      )}
                      <button
                        className="magazine-card-delete"
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={`删除 ${item.name}`}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="list-magazine-footer">
            <button
              className="btn ghost wide"
              type="button"
              onClick={onRestore}
            >
              恢复默认库
            </button>
          </div>
        </>
      )}
    </div>
  )
}
