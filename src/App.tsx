import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Loader2, ArrowRight, Sparkles } from 'lucide-react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import CanvasView from './components/CanvasView'
import TableView from './components/TableView'
import Inspector from './components/Inspector'
import AiDrawer from './components/AiDrawer'
import SettingsModal from './components/SettingsModal'
import { StatusBar, PatchBar, HelpModal } from './components/Chrome'
import { getViewportCenter } from './lib/viewport'

function Welcome() {
  const [name, setName] = useState('')
  const createProject = useStore((s) => s.createProject)
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <span className="kicker">endless_testcase · 单机模式</span>
        <h1>
          用一张画布，
          <br />
          把用例想清楚
        </h1>
        <p>
          画布负责发散与推演，表格负责规范与交付，二者共用同一份数据。
          先建一个项目，剩下的边画边长出来。
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            autoFocus
            placeholder="项目名称，例如「支付中心」"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && name.trim() && !loading) {
                await createProject(name.trim())
              }
            }}
            style={{ height: 32 }}
          />
          <button
            className="primary-btn"
            style={{ height: 32, padding: '0 12px' }}
            disabled={!name.trim() || loading}
            onClick={() => name.trim() && createProject(name.trim())}
          >
            创建 <ArrowRight size={13} />
          </button>
        </div>
        <div className="note">
          <Sparkles size={12} color="var(--accent)" style={{ flex: 'none', marginTop: 3 }} />
          <span>
            AI 辅助需要 DeepSeek API Key。创建项目后在左侧「AI 配置」填入，密钥只存本机，不含在备份里。
          </span>
        </div>
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <button
            className="hint"
            onClick={() => init()}
            style={{ color: 'var(--text-3)', textDecoration: 'underline', fontSize: 11 }}
          >
            重新加载项目列表
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const init = useStore((s) => s.init)
  const booted = useStore((s) => s.booted)
  const project = useStore((s) => s.project)
  const view = useStore((s) => s.view)
  const aiOpen = useStore((s) => s.aiOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const pending = useStore((s) => s.pending)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const selectedCaseId = useStore((s) => s.selectedCaseId)
  const toast = useStore((s) => s.toast)
  const clearToast = useStore((s) => s.clearToast)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && e.key === '/') {
        e.preventDefault()
        setHelp((v) => !v)
        return
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.setAiOpen(true)
        return
      }
      if (mod && e.key === 'Enter') {
        if (s.aiOpen) {
          e.preventDefault()
          window.dispatchEvent(new Event('et:ai-run'))
        }
        return
      }
      if (e.key === 'Escape') {
        s.setAiOpen(false)
        s.setSettingsOpen(false)
        setHelp(false)
        s.selectNode(null)
        s.selectCase(null)
        return
      }
      if (typing || mod) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!s.selectedNodeId) return
        const node = s.canvas?.nodes.find((n) => n.id === s.selectedNodeId)
        if (!node) return
        e.preventDefault()
        if (node.type === 'case') {
          const c = s.cases.find((x) => x.id === node.data.caseId)
          if (confirm(`删除用例「${(c?.title || '').slice(0, 20)}」？`)) {
            s.deleteCases([node.data.caseId])
          }
        } else {
          s.deleteNodes([node.id])
        }
        return
      }

      const k = e.key.toLowerCase()
      if (e.key === 'Tab') {
        e.preventDefault()
        s.addChild()
      } else if (k === 'n') {
        e.preventDefault()
        s.addCase(getViewportCenter())
      } else if (k === 's') {
        e.preventDefault()
        s.addScenario(getViewportCenter())
      } else if (k === 'r') {
        e.preventDefault()
        s.addRequirement(getViewportCenter())
      } else if (k === 'b') {
        e.preventDefault()
        s.addNote(getViewportCenter())
      } else if (k === 'l') {
        e.preventDefault()
        s.autoLayout()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!booted) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={18} className="spin" />
      </div>
    )
  }

  if (!project) {
    return <Welcome />
  }

  return (
    <div className="app">
      <Sidebar onHelp={() => setHelp(true)} />
      <main className="main">
        <TopBar />
        <div className="workspace">
          {view === 'canvas' ? (
            <ReactFlowProvider>
              <CanvasView />
            </ReactFlowProvider>
          ) : (
            <TableView />
          )}
          {(selectedNodeId || selectedCaseId) && <Inspector />}
          {aiOpen && <AiDrawer />}
        </div>
        <StatusBar />
      </main>
      {settingsOpen && <SettingsModal />}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {pending && !aiOpen && <PatchBar />}
      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          {toast.actionLabel && (
            <button
              onClick={() => {
                toast.action?.()
                clearToast()
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
