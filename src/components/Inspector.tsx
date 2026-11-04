import { useState } from 'react'
import { X, Trash2, Plus, Sparkles, ArrowRight, FileText, StickyNote, LayoutTemplate } from 'lucide-react'
import { useStore } from '../store'
import type { CaseRecord, Priority } from '../types'

const TYPES = ['功能', '接口', '性能', '兼容', '安全', '异常', '边界']
const STATUS: { v: CaseRecord['status']; label: string }[] = [
  { v: 'draft', label: '草稿' },
  { v: 'reviewing', label: '评审中' },
  { v: 'approved', label: '已通过' },
  { v: 'deprecated', label: '已废弃' },
]

export default function Inspector() {
  const canvas = useStore((s) => s.canvas)
  const cases = useStore((s) => s.cases)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const selectedCaseId = useStore((s) => s.selectedCaseId)
  const selectNode = useStore((s) => s.selectNode)
  const selectCase = useStore((s) => s.selectCase)
  const updateCase = useStore((s) => s.updateCase)
  const updateNodeData = useStore((s) => s.updateNodeData)
  const deleteCases = useStore((s) => s.deleteCases)
  const deleteNodes = useStore((s) => s.deleteNodes)
  const addCase = useStore((s) => s.addCase)
  const setAiOpen = useStore((s) => s.setAiOpen)
  const showToast = useStore((s) => s.showToast)
  const [tagInput, setTagInput] = useState('')

  const node = canvas?.nodes.find((n) => n.id === selectedNodeId) || null
  const caseId = node?.type === 'case' ? node.data.caseId : selectedCaseId
  const current = cases.find((c) => c.id === caseId) || null

  if (!node && !current) return null

  const close = () => {
    selectNode(null)
    selectCase(null)
  }

  const header = (icon: React.ReactNode, title: string) => (
    <div className="insp-head">
      {icon}
      <span className="t">{title}</span>
      <button className="icon-btn" onClick={close} title="关闭">
        <X size={15} />
      </button>
    </div>
  )

  if (node && node.type !== 'case') {
    if (node.type === 'scenario') {
      const count = cases.filter((c) => c.groupId === node.id).length
      return (
        <aside className="inspector">
          {header(<LayoutTemplate size={15} color="var(--accent-ink)" />, '场景')}
          <div className="insp-body">
            <div className="field">
              <label>场景名称</label>
              <input
                className="input"
                value={node.data.label || ''}
                onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
              />
            </div>
            <div className="field">
              <label>场景内用例</label>
              <div className="hint">
                共 {count} 条用例。把用例节点拖到场景右侧任意位置即可，分组关系按所属场景记录。
              </div>
            </div>
          </div>
          <div className="insp-foot">
            <button
              className="primary-btn ghost"
              style={{ flex: 1 }}
              onClick={() =>
                addCase(
                  { x: node.position.x + 300, y: node.position.y + count * 116 },
                  node.id,
                )
              }
            >
              <Plus size={14} /> 在此场景新建用例
            </button>
            <button className="icon-btn" title="删除场景" onClick={() => deleteNodes([node.id])}>
              <Trash2 size={15} />
            </button>
          </div>
        </aside>
      )
    }

    if (node.type === 'requirement') {
      return (
        <aside className="inspector">
          {header(<FileText size={15} color="var(--req-mute)" />, '需求')}
          <div className="insp-body">
            <div className="field">
              <label>需求内容</label>
              <textarea
                className="textarea"
                style={{ minHeight: 160 }}
                value={node.data.text || ''}
                onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
              />
            </div>
            <div className="field">
              <label>来源 / 编号</label>
              <input
                className="input"
                placeholder="如 PRD-2024-0912"
                value={node.data.source || ''}
                onChange={(e) => updateNodeData(node.id, { source: e.target.value })}
              />
            </div>
          </div>
          <div className="insp-foot">
            <button className="primary-btn" style={{ flex: 1 }} onClick={() => setAiOpen(true)}>
              <Sparkles size={14} /> 用 AI 拆成用例
            </button>
            <button className="icon-btn" title="删除需求" onClick={() => deleteNodes([node.id])}>
              <Trash2 size={15} />
            </button>
          </div>
        </aside>
      )
    }

    // note
    return (
      <aside className="inspector">
        {header(<StickyNote size={15} color="var(--note-mute)" />, '便签')}
        <div className="insp-body">
          <div className="field">
            <label>内容</label>
            <textarea
              className="textarea"
              style={{ minHeight: 140 }}
              value={node.data.text || ''}
              onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
            />
          </div>
          <div className="hint">
            便签不参与导出，用来记录待确认问题、灵感或边界想法。想清楚了可以一键转成正式用例。
          </div>
        </div>
        <div className="insp-foot">
          <button
            className="primary-btn ghost"
            style={{ flex: 1 }}
            onClick={async () => {
              const text = (node.data.text || '').trim()
              if (!text) {
                showToast({ text: '便签内容为空' })
                return
              }
              const created = await addCase({ x: node.position.x + 300, y: node.position.y })
              if (created) updateCase(created.id, { title: text.slice(0, 80) })
              await deleteNodes([node.id])
              showToast({ text: '已把便签转为用例' })
            }}
          >
            <ArrowRight size={14} /> 转为用例
          </button>
          <button className="icon-btn" title="删除便签" onClick={() => deleteNodes([node.id])}>
            <Trash2 size={15} />
          </button>
        </div>
      </aside>
    )
  }

  if (!current) return null
  const c = current
  const steps = c.steps || []
  const steps2 = steps.map((s) => ({ ...s }))

  const patchSteps = (next: typeof steps) => updateCase(c.id, { steps: next })

  return (
    <aside className="inspector">
      <div className="insp-head">
        <span className={`prio ${c.priority}`} style={{ marginTop: 0 }}>
          {c.priority}
        </span>
        <span className="t">用例详情</span>
        <button className="icon-btn" onClick={close} title="关闭">
          <X size={15} />
        </button>
      </div>
      <div className="insp-body">
        <div className="field">
          <label>标题</label>
          <textarea
            className="textarea"
            style={{ minHeight: 56 }}
            value={c.title}
            onChange={(e) => updateCase(c.id, { title: e.target.value })}
          />
        </div>

        <div className="field">
          <label>优先级</label>
          <div className="seg-sm">
            {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map((p) => (
              <button
                key={p}
                className={c.priority === p ? 'on' : ''}
                onClick={() => updateCase(c.id, { priority: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>类型</label>
            <select
              className="select"
              value={c.type}
              onChange={(e) => updateCase(c.id, { type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>状态</label>
            <select
              className="select"
              value={c.status}
              onChange={(e) => updateCase(c.id, { status: e.target.value as any })}
            >
              {STATUS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>前置条件</label>
          <textarea
            className="textarea"
            style={{ minHeight: 52 }}
            placeholder="执行前的数据、账号、状态…"
            value={c.preconditions}
            onChange={(e) => updateCase(c.id, { preconditions: e.target.value })}
          />
        </div>

        <div className="field">
          <label>步骤</label>
          <div className="steps">
            {steps2.map((s, i) => (
              <div className="step-row" key={i}>
                <span className="idx">{i + 1}</span>
                <div className="cells">
                  <input
                    placeholder="操作"
                    value={s.action}
                    onChange={(e) => {
                      const next = steps2.map((x, xi) =>
                        xi === i ? { ...x, action: e.target.value } : x,
                      )
                      patchSteps(next)
                    }}
                  />
                  <input
                    className="data"
                    placeholder="测试数据（选填）"
                    value={s.data || ''}
                    onChange={(e) => {
                      const next = steps2.map((x, xi) =>
                        xi === i ? { ...x, data: e.target.value } : x,
                      )
                      patchSteps(next)
                    }}
                  />
                </div>
                <button
                  className="del"
                  title="删除该步骤"
                  onClick={() => patchSteps(steps2.filter((_, xi) => xi !== i))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              className="add-step"
              onClick={() => patchSteps([...steps2, { action: '', data: '' }])}
            >
              + 添加步骤
            </button>
          </div>
        </div>

        <div className="field">
          <label>预期结果</label>
          <textarea
            className="textarea"
            style={{ minHeight: 60 }}
            placeholder="可判定、可观察的结果"
            value={c.expected}
            onChange={(e) => updateCase(c.id, { expected: e.target.value })}
          />
        </div>

        <div className="field">
          <label>标签</label>
          <div className="chip-row">
            {(c.tags || []).map((t) => (
              <span className="chip x" key={t}>
                {t}
                <X
                  size={10}
                  onClick={() => updateCase(c.id, { tags: (c.tags || []).filter((x) => x !== t) })}
                />
              </span>
            ))}
            <input
              className="chip-input"
              placeholder="+ 标签"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  updateCase(c.id, { tags: [...(c.tags || []), tagInput.trim()] })
                  setTagInput('')
                }
              }}
            />
          </div>
        </div>

        {c.aiMeta?.generated && (
          <div className="hint" style={{ color: 'var(--accent)' }}>
            <Sparkles size={11} style={{ verticalAlign: -1 }} /> 此用例由 AI 生成 · {c.aiMeta.model}
          </div>
        )}
      </div>

      <div className="insp-foot">
        <button className="primary-btn ghost" style={{ flex: 1 }} onClick={() => setAiOpen(true)}>
          <Sparkles size={14} /> AI 辅助
        </button>
        <button
          className="icon-btn"
          title="删除用例"
          onClick={() => {
            if (confirm(`删除用例「${c.title.slice(0, 24)}」？`)) deleteCases([c.id])
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </aside>
  )
}
