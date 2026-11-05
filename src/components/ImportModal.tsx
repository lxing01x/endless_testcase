import { useEffect, useRef, useState } from 'react'
import { Upload, X, Loader2, Download, AlertTriangle, Check } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store'
import type { ImportPreviewRow, ImportStats } from '../types'

type Mode = 'merge' | 'replace'

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const suite = useStore((s) => s.suite)
  const importCases = useStore((s) => s.importCases)

  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<Mode>('merge')
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 内容或模式一变就试算一次，让用户在落库前看到会发生什么
  useEffect(() => {
    if (!suite || !csv.trim()) {
      setStats(null)
      setRows([])
      return
    }
    let alive = true
    setChecking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await api.importCsv(suite.id, { csv, mode, dryRun: true })
        if (!alive) return
        setStats(res.stats)
        setRows(res.preview)
        setHasHeader(res.hasHeader)
        setError(null)
      } catch (err: any) {
        if (!alive) return
        setStats(null)
        setRows([])
        setError(err.message)
      } finally {
        if (alive) setChecking(false)
      }
    }, 320)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [csv, mode, suite])

  const readFile = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      setError('文件超过 4MB，建议拆分后再导入')
      return
    }
    const text = await file.text()
    setFileName(file.name.replace(/\.(csv|txt)$/i, ''))
    setCsv(text)
    if (text.includes('\uFFFD')) {
      setError('文件里出现了乱码字符，多半是 GBK 编码。用 Excel「另存为 → CSV UTF-8」再导入即可')
    }
  }

  const downloadTemplate = () => {
    const tpl = [
      '场景,标题,优先级,类型,前置条件,步骤,预期结果,标签,状态',
      '支付中心,券叠加时取最优一张,P0,功能,账号已登录,"1. 打开收银台\n2. 勾选两张券",按最优券抵扣,"券,支付",草稿',
    ].join('\n')
    const blob = new Blob(['\uFEFF' + tpl], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '用例导入模板.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const submit = async () => {
    if (!csv.trim() || !stats) return
    setRunning(true)
    try {
      await importCases(csv, mode)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const total = stats ? stats.created + stats.updated : 0

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} title="关闭">
          <X size={15} />
        </button>
        <h2>导入用例</h2>
        <div className="sub">
          导出的 CSV 可以直接回填，也认 Excel 另存的 CSV。表头支持中英文，
          <br />
          按「场景 + 标题」判断同一条用例：命中则更新，没命中就新建。
        </div>

        <div
          className={`dropzone ${dragOver ? 'over' : ''} ${csv ? 'filled' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) readFile(file)
          }}
        >
          <span className="dz-icon">
            {csv ? <Check size={15} /> : <Upload size={15} />}
          </span>
          <span className="dz-text">
            <b>{fileName || (csv ? '已载入表格内容' : '拖入 CSV 文件，或点击选择')}</b>
            <i>
              {csv
                ? `${stats ? `${stats.total} 条用例` : '解析中'} · ${(csv.length / 1024).toFixed(1)} KB`
                : '也可以直接把表格内容粘贴到下面'}
            </i>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) readFile(file)
            }}
          />
        </div>

        <div className="field">
          <label>CSV 内容</label>
          <textarea
            className="input import-textarea"
            value={csv}
            spellCheck={false}
            onChange={(e) => {
              setCsv(e.target.value)
              setFileName('')
            }}
            placeholder={'场景,标题,优先级,类型,前置条件,步骤,预期结果,标签,状态\n支付中心,券叠加时取最优一张,P0,功能,,1. 打开收银台,按最优券抵扣,券,草稿'}
          />
        </div>

        <div className="seg" style={{ padding: 2, marginBottom: 10 }}>
          <button className={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')}>
            合并 · 按标题去重
          </button>
          <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>
            覆盖 · 先清空
          </button>
        </div>

        {mode === 'replace' && (
          <div className="import-warn">
            <AlertTriangle size={12} />
            覆盖会先删掉本用例集的全部用例与画布节点，只保留场景。操作可撤销，但建议先导出 CSV 备份。
          </div>
        )}

        {checking && (
          <div className="import-checking">
            <Loader2 size={12} className="spin" /> 正在校验…
          </div>
        )}

        {stats && !checking && (
          <div className="import-preview">
            <div className="imp-stats">
              <span>
                新增 <b>{stats.created}</b>
              </span>
              <span>
                更新 <b>{stats.updated}</b>
              </span>
              {stats.scenarios > 0 && (
                <span>
                  新建场景 <b>{stats.scenarios}</b>
                </span>
              )}
              {stats.skipped > 0 && (
                <span>
                  表格内重复 <b>{stats.skipped}</b>
                </span>
              )}
              {stats.removed > 0 && (
                <span className="danger">
                  先清除 <b>{stats.removed}</b>
                </span>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th>标题</th>
                  <th style={{ width: 92 }}>场景</th>
                  <th style={{ width: 46 }}>优先</th>
                  <th style={{ width: 52 }}>动作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td title={r.title}>{r.title}</td>
                    <td className="muted">{r.scenario}</td>
                    <td className="muted">{r.priority}</td>
                    <td>
                      <span className={`imp-tag ${r.action}`}>
                        {r.action === 'create' ? '新增' : '更新'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="imp-more">
              {stats.total > rows.length
                ? `仅预览前 ${rows.length} 条，共 ${stats.total} 条`
                : `共 ${stats.total} 条`}
              {!hasHeader && ' · 未识别到表头，按导出格式的列序解析'}
            </div>
          </div>
        )}

        {error && <div className="test-result err">{error}</div>}

        <div className="modal-actions">
          <button className="primary-btn ghost" onClick={downloadTemplate} style={{ marginRight: 'auto' }}>
            <Download size={13} /> 下载模板
          </button>
          <button className="primary-btn ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-btn"
            disabled={!stats || !total || running}
            onClick={submit}
            title={!stats ? '先载入 CSV' : ''}
          >
            {running ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
            {stats && total ? `导入 ${total} 条` : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
