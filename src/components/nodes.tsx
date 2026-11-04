import { Handle, Position } from '@xyflow/react'
import { Sparkles, FileText } from 'lucide-react'
import type { CaseRecord } from '../types'

type LooseProps = { data: any; selected?: boolean; id: string }

export const PRIO_COLOR: Record<string, string> = {
  P0: 'var(--p0-fg)',
  P1: 'var(--p1-fg)',
  P2: 'var(--p2-fg)',
  P3: 'var(--p3-fg)',
}

const STATUS_LABEL: Record<string, string> = {
  reviewing: '评审中',
  approved: '已通过',
  deprecated: '已废弃',
}

export function CaseNode({ data }: LooseProps) {
  const c: CaseRecord | undefined = data.case
  const p = c?.priority || 'P2'
  const status = c?.status && c.status !== 'draft' ? c.status : null
  const no = typeof data.index === 'number' ? String(data.index + 1).padStart(2, '0') : null
  return (
    <div className={`rf-node case-node p-${p} ${data.fresh ? 'fresh' : ''}`}>
      <span className="bar" style={{ background: PRIO_COLOR[p], color: PRIO_COLOR[p] }} />
      <div className="row1">
        {no && <span className="cid">#{no}</span>}
        <span className={`prio ${p}`}>{p}</span>
        {status && <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>}
      </div>
      <div className="title">{c?.title || (data.missing ? '用例已删除' : '未命名用例')}</div>
      <div className="meta">
        <span>{c?.steps?.length || 0} 步</span>
        <span className="type">{c?.type || '功能'}</span>
        {c?.aiMeta?.generated && (
          <span className="ai-flag">
            <Sparkles size={9} /> AI
          </span>
        )}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function ScenarioNode({ data }: LooseProps) {
  const teal = data.accent === 'teal'
  return (
    <div className={`rf-node scenario-node ${teal ? 'teal' : ''}`}>
      <span className="dot" />
      <span className="label">{data.label || '未命名场景'}</span>
      {typeof data.caseCount === 'number' && <span className="n">{data.caseCount}</span>}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function RequirementNode({ data }: LooseProps) {
  return (
    <div className="rf-node req-node">
      <span className="tag">
        <FileText size={9} /> 需求
        <span style={{ opacity: 0.6 }}>· REQ</span>
      </span>
      <div className="text">{data.text || '在这里贴一段需求…'}</div>
      {data.source ? <div className="src">{data.source}</div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function NoteNode({ data }: LooseProps) {
  return (
    <div className="rf-node note-node">
      <div className="note-head">
        <span>便签</span>
        <span>NOTE</span>
      </div>
      <div>{data.text || '记点什么…'}</div>
    </div>
  )
}

export function GhostNode({ data }: LooseProps) {
  const item = data.item
  return (
    <div
      className={`ghost-node ${item.type === 'scenario' ? 'scenario' : ''} ${data.checked ? '' : 'off'}`}
    >
      <span className="gtag">AI 建议</span>
      {item.type === 'scenario' ? (
        <div className="gtitle">{item.title}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className={`prio ${item.priority || 'P2'}`}>{item.priority || 'P2'}</span>
            <span className="gtitle">{item.title}</span>
          </div>
          <div
            className="mono"
            style={{ marginTop: 6, fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.02em' }}
          >
            {item.steps?.length || 0} 步 · {item.caseType || '功能'}
          </div>
        </>
      )}
    </div>
  )
}
