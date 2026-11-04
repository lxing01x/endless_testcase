import { useEffect, useState } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'

export default function SettingsModal() {
  const ai = useStore((s) => s.ai)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const saveAi = useStore((s) => s.saveAi)

  const [baseUrl, setBaseUrl] = useState(ai?.baseUrl || 'https://api.deepseek.com')
  const [model, setModel] = useState(ai?.model || 'deepseek-chat')
  const [temperature, setTemperature] = useState(ai?.temperature ?? 0.3)
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ai) {
      setBaseUrl(ai.baseUrl)
      setModel(ai.model)
      setTemperature(ai.temperature)
    }
  }, [ai])

  const persist = async () => {
    await saveAi({ baseUrl, model, temperature, apiKey: apiKey || undefined })
  }

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      await persist()
      const r = await api.testAi()
      setResult({ ok: true, msg: `连接成功 · ${r.model} · ${r.latencyMs}ms · 返回「${r.reply}」` })
    } catch (err: any) {
      setResult({ ok: false, msg: err.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-mask" onClick={() => setSettingsOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>AI 配置</h2>
        <div className="sub">
          MVP 仅支持 DeepSeek（OpenAI 兼容协议）。API Key 使用 AES-256-GCM 加密后存于本机
          <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}> data/db.json</code>，不会回传到浏览器。
        </div>

        <div className="field">
          <label>Base URL</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
          />
        </div>

        <div className="field">
          <label>模型</label>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="deepseek-chat">deepseek-chat（快，推荐）</option>
            <option value="deepseek-reasoner">deepseek-reasoner（慢，复杂发散）</option>
          </select>
        </div>

        <div className="field">
          <label>Temperature · {temperature.toFixed(1)}</label>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div className="hint">生成用例建议 0.2–0.5；发散补漏可以到 0.7。</div>
        </div>

        <div className="field">
          <label>API Key</label>
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={ai?.configured ? `已配置 ${ai.keyHint}，留空则不修改` : 'sk-...'}
            autoComplete="off"
          />
          {ai?.configured && (
            <div className="hint" style={{ marginTop: 5 }}>
              <Check size={11} style={{ verticalAlign: -1 }} /> 已保存密钥 · 留空表示保持不变
            </div>
          )}
        </div>

        {result && <div className={`test-result ${result.ok ? 'ok' : 'err'}`}>{result.msg}</div>}

        <div className="modal-actions">
          <button className="primary-btn ghost" onClick={() => setSettingsOpen(false)}>
            取消
          </button>
          <button className="primary-btn ghost" onClick={test} disabled={testing}>
            {testing ? <Loader2 size={13} className="spin" /> : null} 保存并测试
          </button>
          <button
            className="primary-btn"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await persist()
                setSettingsOpen(false)
              } finally {
                setSaving(false)
              }
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
