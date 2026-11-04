import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Sparkles,
  Settings2,
  RefreshCw,
  Check,
  AlertCircle,
  Wand2,
  CornerDownLeft,
} from 'lucide-react'
import { useStore } from '../store'
import { streamAi } from '../api'
import { getViewportCenter } from '../lib/viewport'
import type { Capability } from '../types'

const CAPS: { id: Capability; label: string; hint: string }[] = [
  {
    id: 'requirement2case',
    label: '需求转用例',
    hint: '把需求拆成「场景 → 用例」两级结构，直接铺到画布上。',
  },
  {
    id: 'diverge',
    label: '场景发散',
    hint: '围绕当前用例补漏：边界、异常、权限、并发、幂等。',
  },
  {
    id: 'normalize',
    label: '步骤规范化',
    hint: '把粗糙描述改写成可执行步骤与可判定的预期结果。',
  },
]

function formatCase(c: any) {
  const lines = [`标题：${c.title}`]
  if (c.preconditions) lines.push(`前置条件：${c.preconditions}`)
  if (c.steps?.length)
    lines.push(
      '步骤：' +
        c.steps
          .map((s: any, i: number) => `${i + 1}. ${s.action}${s.data ? `（${s.data}）` : ''}`)
          .join('；'),
    )
  if (c.expected) lines.push(`预期：${c.expected}`)
  return lines.join('\n')
}

export default function AiDrawer() {
  const ai = useStore((s) => s.ai)
  const canvas = useStore((s) => s.canvas)
  const cases = useStore((s) => s.cases)
  const project = useStore((s) => s.project)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const selectedCaseId = useStore((s) => s.selectedCaseId)
  const pending = useStore((s) => s.pending)
  const setAiOpen = useStore((s) => s.setAiOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setPending = useStore((s) => s.setPending)
  const clearPending = useStore((s) => s.clearPending)
  const adoptPending = useStore((s) => s.adoptPending)
  const togglePendingItem = useStore((s) => s.togglePendingItem)

  const node = canvas?.nodes.find((n) => n.id === selectedNodeId) || null
  const caseId = node?.type === 'case' ? node.data.caseId : selectedCaseId
  const currentCase = cases.find((c) => c.id === caseId) || null
  const reqNode =
    node?.type === 'requirement'
      ? node
      : canvas?.nodes.find((n) => n.type === 'requirement') || null
  const scenarioNode = currentCase
    ? canvas?.nodes.find((n) => n.id === currentCase.groupId) || null
    : null

  const [capability, setCapability] = useState<Capability>(
    currentCase ? 'diverge' : 'requirement2case',
  )
  const [instruction, setInstruction] = useState('')
  const [stream, setStream] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setCapability(currentCase ? 'diverge' : 'requirement2case')
  }, [currentCase?.id, reqNode?.id])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const cap = CAPS.find((c) => c.id === capability)!

  const contextText = useMemo(() => {
    if (currentCase) {
      return (
        <>
          当前用例：<span className="strong">{currentCase.title}</span>
          {scenarioNode ? `（场景：${scenarioNode.data.label}）` : ''}
        </>
      )
    }
    if (reqNode?.data.text) {
      return (
        <>
          需求：<span className="strong">{String(reqNode.data.text).slice(0, 48)}…</span>
        </>
      )
    }
    return <span className="warn">未选中上下文，将基于整个用例集（{cases.length} 条）生成</span>
  }, [currentCase, reqNode, scenarioNode, cases.length])

  const calcAnchor = () => {
    const nodes = (canvas?.nodes || []).filter((n) => n.type !== 'note')
    if (!nodes.length) return getViewportCenter()
    const maxX = Math.max(...nodes.map((n) => n.position.x))
    const minY = Math.min(...nodes.map((n) => n.position.y))
    return { x: Math.round(maxX + 340), y: Math.round(Math.max(minY, 40)) }
  }

  const run = async () => {
    if (!ai?.configured) {
      setSettingsOpen(true)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus('running')
    setStream('')
    setError('')

    const input = {
      projectId: project?.id,
      requirement: reqNode?.data.text || '',
      scenario: scenarioNode?.data.label || '',
      caseTitle: currentCase?.title || '',
      detail: currentCase ? formatCase(currentCase) : '',
      siblingTitles: currentCase
        ? cases.filter((c) => c.groupId === currentCase.groupId && c.id !== currentCase.id).map((c) => c.title)
        : [],
      existingTitles: cases.map((c) => c.title),
      instruction,
    }

    await streamAi(
      capability,
      input,
      {
        onDelta: (t) => setStream((s) => s + t),
        onDone: (payload) => {
          setStatus('done')
          const items = (payload.patch?.nodes || []).map((n: any) => ({
            ...n,
            caseType: n.caseType || '功能',
          }))
          if (!items.length) {
            setError('模型没有返回可用节点，换个说法再试一次。')
            setStatus('error')
            return
          }
          setPending(
            {
              capability,
              items,
              edges: payload.patch?.edges || [],
              summary: payload.patch?.summary || '',
              targetCaseId: capability === 'normalize' ? caseId || undefined : undefined,
            },
            calcAnchor(),
          )
          setAiOpen(false)
        },
        onError: (msg, raw) => {
          setStatus('error')
          setError(msg)
          if (raw) setStream(raw)
        },
      },
      ctrl.signal,
    ).catch((err) => {
      if (err?.name !== 'AbortError') {
        setStatus('error')
        setError(err?.message || '生成失败')
      }
    })
  }

  useEffect(() => {
    const handler = () => {
      if (status !== 'running' && !pending) run()
    }
    window.addEventListener('et:ai-run', handler)
    return () => window.removeEventListener('et:ai-run', handler)
  })

  const checkedCount = pending?.items.filter((i) => i.checked).length || 0
  return (
    <>
      <div className="drawer-mask" onClick={() => setAiOpen(false)} />
      <aside className="drawer">
        <div className="drawer-head">
          <span className="t">
            <Sparkles size={15} color="var(--accent)" />
            AI 助手
            <span className="model">{ai?.model || 'deepseek-chat'}</span>
          </span>
          <button className="icon-btn" title="AI 设置" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} />
          </button>
          <button className="icon-btn" onClick={() => setAiOpen(false)}>
            <X size={15} />
          </button>
        </div>

        {pending ? (
          <>
            <div className="drawer-body">
              <div className="ctx-card accent">
                <Check size={12} color="var(--ok-fg)" style={{ verticalAlign: -1 }} /> 已生成{' '}
                <b>{pending.items.filter((i) => i.type === 'case').length}</b> 条候选用例
                {pending.items.some((i) => i.type === 'scenario')
                  ? ` · ${pending.items.filter((i) => i.type === 'scenario').length} 个场景`
                  : ''}
                {pending.summary ? <div style={{ marginTop: 6 }}>{pending.summary}</div> : null}
              </div>
              <div className="hint" style={{ marginBottom: 8 }}>
                画布上已用虚线标出这些建议，勾选你要保留的条目。
              </div>
              <div className="patch-list">
                {pending.items.map((it) =>
                  it.type === 'scenario' ? (
                    <div className="patch-scenario" key={it.tmpId}>
                      <i />
                      {it.title}
                    </div>
                  ) : (
                    <div
                      key={it.tmpId}
                      className={`patch-item ${it.checked ? '' : 'off'}`}
                      onClick={() => togglePendingItem(it.tmpId)}
                    >
                      <span className={`ck ${it.checked ? 'on' : ''}`}>
                        {it.checked ? <Check size={10} /> : null}
                      </span>
                      <div className="body">
                        <div className="ttl">{it.title}</div>
                        <div className="sub">
                          <span className={`prio ${it.priority || 'P2'}`}>
                            {it.priority || 'P2'}
                          </span>
                          <span>{it.steps?.length || 0} 步</span>
                          {it.expected ? <span>· {it.expected.slice(0, 22)}</span> : null}
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="drawer-foot">
              <button className="primary-btn" style={{ flex: 1 }} onClick={() => adoptPending()}>
                <Check size={14} />
                {pending.capability === 'normalize'
                  ? '应用到该用例'
                  : `采纳 ${checkedCount} 项到画布`}
              </button>
              <button
                className="primary-btn ghost"
                onClick={() => {
                  clearPending()
                  setStatus('idle')
                  setStream('')
                }}
              >
                丢弃
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="drawer-body">
              {!ai?.configured && (
                <div className="ctx-card warn">
                  <span>还没有配置 DeepSeek API Key。填充后即可使用 AI 辅助设计。</span>
                  <div style={{ marginTop: 8 }}>
                    <button className="primary-btn ghost" onClick={() => setSettingsOpen(true)}>
                      <Settings2 size={13} /> 去配置
                    </button>
                  </div>
                </div>
              )}

              <div className="cap-tabs">
                {CAPS.map((c) => (
                  <button
                    key={c.id}
                    className={capability === c.id ? 'on' : ''}
                    onClick={() => setCapability(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="ctx-card">{contextText}</div>
              <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {cap.hint}
              </div>

              <div className="field">
                <label>补充要求（选填）</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 76 }}
                  placeholder={
                    capability === 'requirement2case'
                      ? '例如：重点关注优惠券过期与并发核销，输出 8 条以内'
                      : capability === 'diverge'
                        ? '例如：补充弱网、重复提交、跨时区的情况'
                        : '例如：步骤按「页面-操作-结果」拆分'
                  }
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </div>

              {stream ? (
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      color: 'var(--text-3)',
                      display: 'block',
                      marginBottom: 5,
                    }}
                  >
                    模型输出
                  </label>
                  <div className={`ai-out ${status === 'running' ? 'streaming' : ''}`}>{stream}</div>
                </div>
              ) : null}

              {error ? (
                <div className="test-result err" style={{ display: 'flex', gap: 6 }}>
                  <AlertCircle size={13} style={{ flex: 'none', marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>

            <div className="drawer-foot">
              <button
                className="primary-btn"
                style={{ flex: 1 }}
                disabled={status === 'running' || !ai?.configured}
                onClick={run}
              >
                {status === 'running' ? (
                  <>
                    <RefreshCw size={13} className="spin" /> 生成中…
                  </>
                ) : status === 'error' ? (
                  <>
                    <RefreshCw size={13} /> 重试
                  </>
                ) : (
                  <>
                    <Wand2 size={14} /> 生成
                  </>
                )}
              </button>
              <span className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <CornerDownLeft size={11} /> ⌘↵
              </span>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
