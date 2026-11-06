import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Plus,
  Check,
  Sparkles,
  Download,
  Keyboard,
  FolderPlus,
} from 'lucide-react'
import { useStore } from '../store'

export default function Sidebar({ onHelp }: { onHelp: () => void }) {
  const project = useStore((s) => s.project)
  const projects = useStore((s) => s.projects)
  const suites = useStore((s) => s.suites)
  const suite = useStore((s) => s.suite)
  const cases = useStore((s) => s.cases)
  const ai = useStore((s) => s.ai)
  const openProject = useStore((s) => s.openProject)
  const openSuite = useStore((s) => s.openSuite)
  const createProject = useStore((s) => s.createProject)
  const createSuite = useStore((s) => s.createSuite)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const [menu, setMenu] = useState(false)
  const [addingSuite, setAddingSuite] = useState(false)
  const [addingProject, setAddingProject] = useState(false)
  const [suiteName, setSuiteName] = useState('')
  const [projectName, setProjectName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) setMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">✦</div>
        <div>
          <div className="brand-name">用例星图</div>
          <div className="brand-sub">无限画布用例设计</div>
        </div>
      </div>

      <div className="side-body">
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="project-pick" onClick={() => setMenu((v) => !v)}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 600,
                flex: 'none',
              }}
            >
              {(project?.name || 'P').slice(0, 1)}
            </div>
            <div className="grow">
              <span className="pname">{project?.name || '选择项目'}</span>
              <span className="pmeta">{projects.length} 个项目 · 单机模式</span>
            </div>
            <ChevronDown size={14} color="var(--text-3)" />
          </button>

          {menu && (
            <div
              style={{
                position: 'absolute',
                top: 46,
                left: 0,
                right: 0,
                background: 'var(--panel)',
                border: '1px solid var(--line-strong)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-2)',
                padding: 5,
                zIndex: 30,
              }}
            >
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    setMenu(false)
                    await openProject(p.id)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: 6,
                    textAlign: 'left',
                    color: p.id === project?.id ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: p.id === project?.id ? 500 : 400,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </span>
                  {p.id === project?.id && <Check size={13} color="var(--accent)" />}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--line)', margin: '4px 2px' }} />
              {addingProject ? (
                <input
                  autoFocus
                  className="input"
                  placeholder="项目名称，回车创建"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && projectName.trim()) {
                      await createProject(projectName.trim())
                      setProjectName('')
                      setAddingProject(false)
                      setMenu(false)
                    }
                    if (e.key === 'Escape') setAddingProject(false)
                  }}
                />
              ) : (
                <button
                  onClick={() => setAddingProject(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: 6,
                    color: 'var(--text-2)',
                  }}
                >
                  <FolderPlus size={13} /> 新建项目
                </button>
              )}
            </div>
          )}
        </div>

        <div className="side-label">
          <span>用例集</span>
          <button onClick={() => setAddingSuite(true)} title="新建用例集">
            <Plus size={14} />
          </button>
        </div>

        {suites.map((s) => (
          <button
            key={s.id}
            className={`suite-item ${suite?.id === s.id ? 'active' : ''}`}
            onClick={() => openSuite(s.id)}
          >
            <span className="grow">{s.name}</span>
            <span className="count">
              {suite?.id === s.id ? cases.length : (s.caseCount ?? '')}
            </span>
          </button>
        ))}

        {addingSuite && (
          <input
            autoFocus
            className="input"
            style={{ marginTop: 6 }}
            placeholder="用例集名称，回车创建"
            value={suiteName}
            onChange={(e) => setSuiteName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && suiteName.trim()) {
                await createSuite(suiteName.trim())
                setSuiteName('')
                setAddingSuite(false)
              }
              if (e.key === 'Escape') setAddingSuite(false)
            }}
            onBlur={() => setAddingSuite(false)}
          />
        )}
      </div>

      <div className="side-foot">
        <button className="side-link" onClick={() => setSettingsOpen(true)}>
          <Sparkles size={14} />
          <span style={{ flex: 1 }}>AI 配置</span>
          <span className={`dot ${ai?.configured ? 'on' : ''}`} />
        </button>
        <button
          className="side-link"
          onClick={() => {
            if (suite) window.open(`/api/suites/${suite.id}/export?format=md`, '_blank')
          }}
        >
          <Download size={14} />
          <span style={{ flex: 1 }}>导出 Markdown</span>
        </button>
        <button className="side-link" onClick={onHelp}>
          <Keyboard size={14} />
          <span style={{ flex: 1 }}>快捷键</span>
          <kbd>⌘/</kbd>
        </button>
      </div>
    </aside>
  )
}
