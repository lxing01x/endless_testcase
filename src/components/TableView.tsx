import { useMemo, useState } from 'react'
import { Plus, Trash2, Sparkles, Download } from 'lucide-react'
import { useStore } from '../store'
import type { Priority } from '../types'

export default function TableView() {
  const canvas = useStore((s) => s.canvas)
  const cases = useStore((s) => s.cases)
  const search = useStore((s) => s.search)
  const updateCase = useStore((s) => s.updateCase)
  const deleteCases = useStore((s) => s.deleteCases)
  const addCase = useStore((s) => s.addCase)
  const selectCase = useStore((s) => s.selectCase)
  const selectedCaseId = useStore((s) => s.selectedCaseId)
  const setAiOpen = useStore((s) => s.setAiOpen)
  const suite = useStore((s) => s.suite)
  const [prio, setPrio] = useState<string>('all')

  const scenarios = useMemo(
    () => (canvas?.nodes || []).filter((n) => n.type === 'scenario'),
    [canvas],
  )
  const scenarioName = (id: string | null) =>
    scenarios.find((s) => s.id === id)?.data.label || '未分组'

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases
      .filter((c) => (prio === 'all' ? true : c.priority === prio))
      .filter((c) => {
        if (!q) return true
        return (
          c.title.toLowerCase().includes(q) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          c.expected.toLowerCase().includes(q)
        )
      })
  }, [cases, search, prio])

  return (
    <div className="table-wrap">
      <div className="table-bar">
        <span className="stat">
          共 <b style={{ color: 'var(--text)' }}>{cases.length}</b> 条用例 · 当前显示 {rows.length} 条
        </span>
        <div className="spacer" />
        <div className="seg" style={{ padding: 2 }}>
          {['all', 'P0', 'P1', 'P2', 'P3'].map((p) => (
            <button
              key={p}
              className={prio === p ? 'on' : ''}
              onClick={() => setPrio(p)}
              style={{ padding: '3px 8px', fontSize: 11.5 }}
            >
              {p === 'all' ? '全部' : p}
            </button>
          ))}
        </div>
        <button
          className="primary-btn ghost"
          onClick={() => {
            if (suite) window.open(`/api/suites/${suite.id}/export?format=csv`, '_blank')
          }}
        >
          <Download size={14} /> CSV
        </button>
        <button className="primary-btn ghost" onClick={() => setAiOpen(true)}>
          <Sparkles size={14} /> AI 生成
        </button>
        <button className="primary-btn" onClick={() => addCase()}>
          <Plus size={14} /> 新建用例
        </button>
      </div>

      <div className="table-scroll">
        {rows.length === 0 ? (
          <div className="empty-state">
            {cases.length === 0 ? (
              <>
                还没有用例。
                <br />
                切到画布，双击空白处就能开始画。
              </>
            ) : (
              '没有匹配的用例，试试清空搜索条件。'
            )}
          </div>
        ) : (
          <table className="cases">
            <thead>
              <tr>
                <th style={{ width: 38 }}>#</th>
                <th style={{ width: 138 }}>场景</th>
                <th style={{ minWidth: 250 }}>标题</th>
                <th style={{ width: 72 }}>优先级</th>
                <th style={{ width: 84 }}>类型</th>
                <th style={{ width: 76 }}>步骤</th>
                <th style={{ minWidth: 260 }}>预期结果</th>
                <th style={{ width: 88 }}>状态</th>
                <th style={{ width: 42 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id}
                  className={selectedCaseId === c.id ? 'active' : ''}
                  onClick={() => selectCase(c.id)}
                >
                  <td className="row-idx">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    <select
                      className="cell-select"
                      value={c.groupId || ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateCase(c.id, { groupId: e.target.value || null })}
                    >
                      <option value="">未分组</option>
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.data.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={c.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateCase(c.id, { title: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className={`cell-select prio-cell ${c.priority}`}
                      value={c.priority}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateCase(c.id, { priority: e.target.value as Priority })
                      }
                    >
                      {['P0', 'P1', 'P2', 'P3'].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={c.type}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateCase(c.id, { type: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="steps-pill"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectCase(c.id)
                      }}
                    >
                      {c.steps?.length || 0} 步
                    </button>
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={c.expected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateCase(c.id, { expected: e.target.value })}
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <select
                      className="cell-select"
                      value={c.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateCase(c.id, { status: e.target.value as any })}
                    >
                      <option value="draft">草稿</option>
                      <option value="reviewing">评审中</option>
                      <option value="approved">已通过</option>
                      <option value="deprecated">已废弃</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="row-del"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('删除这条用例？')) deleteCases([c.id])
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {void scenarioName}
    </div>
  )
}
