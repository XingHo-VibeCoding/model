import { SPICY_LABEL, TYPE_LABEL } from '../lib/constants.js'

/* 清单里的一行。对应 PRD 的 C4：
   每条上都要能看到「类型、辣度、忌口标签」三个字段，且与录入时一致。
   另外把「我加的」标出来，方便对上 C1 那个「其中你自己加了 M 个」。 */
export default function ItemRow({ item, onRemove }) {
  const tags = Array.isArray(item.tags) ? item.tags : []

  return (
    <li className="item-row">
      <div className="item-main">
        <span className="item-name">{item.name}</span>
        <span className="item-badges">
          <span className="badge">{TYPE_LABEL[item.type] ?? item.type}</span>
          <span className="badge">{SPICY_LABEL[item.spicy] ?? item.spicy}</span>
          {item.source === 'user' && <span className="badge mine">我加的</span>}
          {tags.map((tag) => (
            <span className="badge tag" key={tag}>
              {tag}
            </span>
          ))}
        </span>
      </div>

      <button
        className="link-btn danger"
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`删除 ${item.name}`}
      >
        删除
      </button>
    </li>
  )
}
