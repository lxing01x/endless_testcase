import { Search, Sparkles, Settings2, Table2, Workflow, Plus, Sun, Moon } from 'lucide-react'
import { useStore } from '../store'

export default function TopBar() {
  const project = useStore((s) => s.project)
  const suite = useStore((s) => s.suite)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const setAiOpen = useStore((s) => s.setAiOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const ai = useStore((s) => s.ai)
  const addCase = useStore((s) => s.addCase)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  return (
    <header className="topbar">
      <div className="crumb">
        <span>{project?.name || '—'}</span>
        <span className="sep">/</span>
        <span className="cur">{suite?.name || '未选用例集'}</span>
      </div>

      <div className="spacer" />

      <div className="seg">
        <button className={view === 'canvas' ? 'on' : ''} onClick={() => setView('canvas')}>
          <Workflow size={13} /> 画布
        </button>
        <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>
          <Table2 size={13} /> 表格
        </button>
      </div>

      <div className="search">
        <Search size={13} />
        <input
          placeholder="搜索用例"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => view === 'canvas' && setView('table')}
        />
      </div>

      {view === 'canvas' && (
        <button className="icon-btn" title="新建用例（N）" onClick={() => addCase()}>
          <Plus size={16} />
        </button>
      )}

      <button
        className="primary-btn ai-btn"
        onClick={() => setAiOpen(true)}
        title="AI 助手 ⌘K"
        style={{ position: 'relative' }}
      >
        <Sparkles size={14} /> AI
        {!ai?.configured && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--warn-fg)',
              border: '1px solid var(--panel)',
            }}
          />
        )}
      </button>

      <button
        className="icon-btn theme-toggle"
        title={theme === 'light' ? '切换到深色' : '切换到浅色'}
        aria-label="切换主题"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>

      <button className="icon-btn" title="AI 配置" onClick={() => setSettingsOpen(true)}>
        <Settings2 size={16} />
      </button>
    </header>
  )
}
