import { Table2, Workflow, Undo2, Redo2, Check, X, Sparkles, Eye } from 'lucide-react'
import { useStore } from '../store'

export function StatusBar() {
  const canvas = useStore((s) => s.canvas)
  const cases = useStore((s) => s.cases)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const zoom = canvas?.viewport?.zoom ?? 0.9
  const scenarios = (canvas?.nodes || []).filter((n) => n.type === 'scenario').length
  const p0 = cases.filter((c) => c.priority === 'P0').length
  const p0Ratio = cases.length ? Math.round((p0 / cases.length) * 100) : 0

  return (
    <footer className="statusbar">
      <span>
        用例 <span className="k">{cases.length}</span>
      </span>
      <span className="sep" />
      <span>
        场景 <span className="k">{scenarios}</span>
      </span>
      <span className="sep" />
      <span>
        P0 <span className="k">{p0}</span>
        {cases.length ? ` / ${p0Ratio}%` : ''}
      </span>
      <div className="grow" />
      <button
        onClick={undo}
        disabled={!past.length}
        title="撤销 ⌘Z"
        style={{ opacity: past.length ? 1 : 0.35 }}
      >
        <Undo2 size={11} />
      </button>
      <button
        onClick={redo}
        disabled={!future.length}
        title="重做 ⇧⌘Z"
        style={{ opacity: future.length ? 1 : 0.35 }}
      >
        <Redo2 size={11} />
      </button>
      <span className="sep" />
      <button onClick={() => setView('canvas')}>
        <Workflow size={11} color={view === 'canvas' ? 'var(--accent)' : undefined} />
        {view === 'canvas' ? `${Math.round(zoom * 100)}%` : '画布'}
      </button>
      <button onClick={() => setView('table')}>
        <Table2 size={11} color={view === 'table' ? 'var(--accent)' : undefined} />
        表格
      </button>
      <span className="sep" />
      <span className="hint-keys">
        <kbd>N</kbd> 用例 <kbd>S</kbd> 场景 <kbd>B</kbd> 便签 <kbd>L</kbd> 布局
      </span>
    </footer>
  )
}

export function PatchBar() {
  const pending = useStore((s) => s.pending)
  const adoptPending = useStore((s) => s.adoptPending)
  const clearPending = useStore((s) => s.clearPending)
  const setAiOpen = useStore((s) => s.setAiOpen)
  if (!pending) return null
  const count = pending.items.filter((i) => i.type === 'case').length
  const checked = pending.items.filter((i) => i.checked && i.type === 'case').length
  return (
    <div className="patchbar">
      <span className="lead">
        <Sparkles size={12} />
        AI 建议 <b>{count}</b> 条已铺到画布
        {checked !== count ? <span style={{ opacity: 0.6 }}>（已选 {checked}）</span> : null}
      </span>
      <button className="adopt" onClick={() => adoptPending()}>
        <Check size={11} /> 采纳
      </button>
      <button className="ghost" onClick={() => setAiOpen(true)}>
        <Eye size={11} /> 明细
      </button>
      <button className="close" onClick={() => clearPending()}>
        <X size={13} />
      </button>
    </div>
  )
}

const KEYS: [string, string][] = [
  ['N', '新建用例'],
  ['S', '新建场景'],
  ['R', '新建需求'],
  ['B', '新建便签'],
  ['L', '自动布局（场景流）'],
  ['Tab', '新建并连线子节点'],
  ['双击空白', '就地新建用例'],
  ['⌘K', '唤起 AI 助手'],
  ['⌘Z / ⇧⌘Z', '撤销 / 重做（跨视图）'],
  ['Delete', '删除选中节点'],
  ['⌘/', '打开快捷键'],
  ['Esc', '关闭面板 / 取消选中'],
]

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 424 }} onClick={(e) => e.stopPropagation()}>
        <h2>快捷键</h2>
        <div className="sub">画布和表格共用同一个历史栈，撤销是一致的。</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 16px' }}>
          {KEYS.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <kbd style={{ minWidth: 62, textAlign: 'center' }}>{k}</kbd>
              <span style={{ color: 'var(--text-2)' }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
