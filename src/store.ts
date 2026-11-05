import { create } from 'zustand'
import dagre from '@dagrejs/dagre'
import { api } from './api'
import { applyTheme, readTheme, type Theme } from './lib/theme'
import type {
  AiConfig,
  CanvasEdge,
  CanvasNode,
  CanvasState,
  CaseRecord,
  ImportStats,
  PatchItem,
  PendingPatch,
  Project,
  Suite,
} from './types'

const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 10)

const NODE_SIZE: Record<string, { w: number; h: number }> = {
  case: { w: 236, h: 104 },
  scenario: { w: 240, h: 62 },
  requirement: { w: 268, h: 116 },
  note: { w: 220, h: 130 },
}

function stripNode(n: CanvasNode): CanvasNode {
  const { selected, width, height, measured, ...rest } = n as any
  const data = { ...(rest.data || {}) }
  delete data.case
  delete data.fresh
  delete data.caseCount
  return { ...rest, data }
}

let canvasTimer: any = null
const caseTimers: Record<string, any> = {}

type Snapshot = { cases: CaseRecord[]; nodes: CanvasNode[]; edges: CanvasEdge[] }

interface Toast {
  id: number
  text: string
  actionLabel?: string
  action?: () => void
}

interface AppState {
  booted: boolean
  loading: boolean
  projects: Project[]
  project: Project | null
  suites: Suite[]
  suite: Suite | null
  cases: CaseRecord[]
  canvas: CanvasState | null
  view: 'canvas' | 'table'
  selectedNodeId: string | null
  selectedCaseId: string | null
  search: string
  aiOpen: boolean
  settingsOpen: boolean
  ai: AiConfig | null
  pending: PendingPatch | null
  past: Snapshot[]
  future: Snapshot[]
  toast: Toast | null
  theme: Theme

  init: () => Promise<void>
  openProject: (id: string) => Promise<void>
  openSuite: (id: string) => Promise<void>
  createProject: (name: string) => Promise<void>
  createSuite: (name: string) => Promise<void>
  deleteSuite: (id: string) => Promise<void>
  setView: (v: 'canvas' | 'table') => void
  setSearch: (s: string) => void
  selectNode: (id: string | null) => void
  selectCase: (id: string | null) => void
  setAiOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setTheme: (t: Theme) => void
  loadAi: () => Promise<void>
  saveAi: (p: { baseUrl: string; model: string; temperature: number; apiKey?: string }) => Promise<void>

  pushHistory: () => void
  undo: () => Promise<void>
  redo: () => Promise<void>

  addCase: (position?: { x: number; y: number }, groupId?: string | null) => Promise<CaseRecord | null>
  addScenario: (position?: { x: number; y: number }) => Promise<void>
  addRequirement: (position?: { x: number; y: number }) => Promise<void>
  addNote: (position?: { x: number; y: number }) => Promise<void>
  addChild: () => Promise<void>
  updateCase: (id: string, patch: Partial<CaseRecord>) => void
  deleteCases: (ids: string[]) => Promise<void>
  importCases: (csv: string, mode?: 'merge' | 'replace') => Promise<ImportStats | null>
  deleteNodes: (ids: string[]) => Promise<void>
  updateNodeData: (id: string, patch: Record<string, any>) => void
  applyNodeChanges: (changes: any[]) => void
  addEdge: (source: string, target: string) => void
  deleteEdge: (id: string) => void
  saveCanvasNow: () => Promise<void>
  setViewport: (vp: { x: number; y: number; zoom: number }) => void
  autoLayout: () => void

  setPending: (patch: Omit<PendingPatch, 'createdAt'> | null, anchor?: { x: number; y: number }) => void
  togglePendingItem: (tmpId: string) => void
  adoptPending: () => Promise<void>
  clearPending: () => void

  showToast: (t: Omit<Toast, 'id'>) => void
  clearToast: () => void
}

export const useStore = create<AppState>((set, get) => ({
  booted: false,
  loading: false,
  projects: [],
  project: null,
  suites: [],
  suite: null,
  cases: [],
  canvas: null,
  view: 'canvas',
  selectedNodeId: null,
  selectedCaseId: null,
  search: '',
  aiOpen: false,
  settingsOpen: false,
  ai: null,
  pending: null,
  past: [],
  future: [],
  toast: null,
  theme: readTheme(),

  setTheme(t) {
    applyTheme(t)
    set({ theme: t })
  },

  async init() {
    set({ loading: true })
    try {
      const [projects, ai] = await Promise.all([api.listProjects(), api.getAiSettings()])
      set({ projects, ai })
      if (projects.length) await get().openProject(projects[0].id)
    } catch (err: any) {
      get().showToast({ text: `初始化失败：${err.message}` })
    } finally {
      set({ booted: true, loading: false })
    }
  },

  async openProject(id) {
    set({ loading: true })
    try {
      const { project, suites } = await api.getProject(id)
      set({ project, suites, pending: null, past: [], future: [] })
      if (suites.length) await get().openSuite(suites[0].id)
      else set({ suite: null, cases: [], canvas: null })
    } finally {
      set({ loading: false })
    }
  },

  async openSuite(id) {
    set({ loading: true })
    try {
      const { suite, cases, canvas } = await api.getSuiteFull(id)
      set({
        suite,
        cases,
        canvas,
        selectedNodeId: null,
        selectedCaseId: null,
        pending: null,
        past: [],
        future: [],
      })
    } finally {
      set({ loading: false })
    }
  },

  async createProject(name) {
    const { project, suite } = await api.createProject(name)
    const projects = await api.listProjects()
    set({ projects })
    await get().openProject(project.id)
    get().showToast({ text: `项目「${project.name}」已创建` })
  },

  async createSuite(name) {
    const project = get().project
    if (!project) return
    const suite = await api.createSuite(project.id, name)
    const { suites } = await api.getProject(project.id)
    set({ suites })
    await get().openSuite(suite.id)
    get().showToast({ text: `用例集「${suite.name}」已创建` })
  },

  async deleteSuite(id) {
    await api.deleteSuite(id)
    const project = get().project
    if (!project) return
    const { suites } = await api.getProject(project.id)
    set({ suites })
    if (get().suite?.id === id) {
      if (suites.length) await get().openSuite(suites[0].id)
      else set({ suite: null, cases: [], canvas: null })
    }
  },

  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  selectNode: (id) => {
    const node = get().canvas?.nodes.find((n) => n.id === id)
    set({
      selectedNodeId: id,
      selectedCaseId: node?.type === 'case' ? node.data.caseId : null,
    })
  },
  selectCase: (id) => set({ selectedCaseId: id, selectedNodeId: null }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  async loadAi() {
    const ai = await api.getAiSettings()
    set({ ai })
  },

  async saveAi(payload) {
    const ai = await api.saveAiSettings(payload)
    set({ ai })
    get().showToast({ text: 'AI 配置已保存' })
  },

  pushHistory() {
    const { cases, canvas, past } = get()
    if (!canvas) return
    const snap: Snapshot = JSON.parse(
      JSON.stringify({ cases, nodes: canvas.nodes, edges: canvas.edges }),
    )
    set({ past: [...past.slice(-39), snap], future: [] })
  },

  async undo() {
    const { past, future, cases, canvas, suite } = get()
    if (!past.length || !canvas || !suite) return
    const current: Snapshot = JSON.parse(
      JSON.stringify({ cases, nodes: canvas.nodes, edges: canvas.edges }),
    )
    const snap = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      future: [...future, current],
      cases: snap.cases,
      canvas: { ...canvas, nodes: snap.nodes, edges: snap.edges },
      selectedNodeId: null,
      selectedCaseId: null,
    })
    await api.syncSuite(suite.id, { cases: snap.cases, nodes: snap.nodes, edges: snap.edges })
  },

  async redo() {
    const { past, future, cases, canvas, suite } = get()
    if (!future.length || !canvas || !suite) return
    const current: Snapshot = JSON.parse(
      JSON.stringify({ cases, nodes: canvas.nodes, edges: canvas.edges }),
    )
    const snap = future[future.length - 1]
    set({
      future: future.slice(0, -1),
      past: [...past, current],
      cases: snap.cases,
      canvas: { ...canvas, nodes: snap.nodes, edges: snap.edges },
      selectedNodeId: null,
      selectedCaseId: null,
    })
    await api.syncSuite(suite.id, { cases: snap.cases, nodes: snap.nodes, edges: snap.edges })
  },

  async addCase(position, groupId = null) {
    const { suite, canvas, cases } = get()
    if (!suite || !canvas) return null
    const created = await api.createCase({
      suiteId: suite.id,
      groupId,
      title: '未命名用例',
      priority: 'P2',
      type: '功能',
      steps: [{ action: '', data: '' }],
      order: cases.length,
    })
    const nodeId = uid('n_')
    const pos = position || { x: 80, y: 80 }
    get().pushHistory()
    set({
      cases: [...get().cases, created],
      canvas: {
        ...canvas,
        nodes: [...canvas.nodes, { id: nodeId, type: 'case', position: pos, data: { caseId: created.id } }],
      },
      selectedNodeId: nodeId,
      selectedCaseId: created.id,
    })
    get().saveCanvasNow()
    return created
  },

  async addScenario(position) {
    const { canvas } = get()
    if (!canvas) return
    get().pushHistory()
    const nodeId = uid('n_')
    set({
      canvas: {
        ...canvas,
        nodes: [
          ...canvas.nodes,
          {
            id: nodeId,
            type: 'scenario',
            position: position || { x: 320, y: 80 },
            data: { label: '新场景', accent: 'violet' },
          },
        ],
      },
      selectedNodeId: nodeId,
      selectedCaseId: null,
    })
    get().saveCanvasNow()
  },

  async addRequirement(position) {
    const { canvas } = get()
    if (!canvas) return
    get().pushHistory()
    const nodeId = uid('n_')
    set({
      canvas: {
        ...canvas,
        nodes: [
          ...canvas.nodes,
          {
            id: nodeId,
            type: 'requirement',
            position: position || { x: 60, y: 80 },
            data: { text: '在这里贴一段需求…', source: '' },
          },
        ],
      },
      selectedNodeId: nodeId,
      selectedCaseId: null,
    })
    get().saveCanvasNow()
  },

  async addNote(position) {
    const { canvas } = get()
    if (!canvas) return
    get().pushHistory()
    const nodeId = uid('n_')
    set({
      canvas: {
        ...canvas,
        nodes: [
          ...canvas.nodes,
          {
            id: nodeId,
            type: 'note',
            position: position || { x: 60, y: 420 },
            data: { text: '记点什么…', color: 'amber' },
          },
        ],
      },
      selectedNodeId: nodeId,
      selectedCaseId: null,
    })
    get().saveCanvasNow()
  },

  async addChild() {
    const s = get()
    const parentId = s.selectedNodeId
    if (!parentId || !s.canvas) return
    const parent = s.canvas.nodes.find((n) => n.id === parentId)
    if (!parent) return
    const pos = { x: parent.position.x + 320, y: parent.position.y + 30 }
    if (parent.type === 'requirement') {
      await get().addScenario(pos)
    } else {
      let groupId: string | null = null
      if (parent.type === 'scenario') groupId = parent.id
      else if (parent.type === 'case') {
        groupId = get().cases.find((c) => c.id === parent.data.caseId)?.groupId ?? null
      }
      await get().addCase(pos, groupId)
    }
    const childId = get().selectedNodeId
    if (childId && childId !== parentId) get().addEdge(parentId, childId)
  },

  updateCase(id, patch) {
    set({
      cases: get().cases.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })
    clearTimeout(caseTimers[id])
    caseTimers[id] = setTimeout(() => {
      api.updateCase(id, patch).catch(() => get().showToast({ text: '用例保存失败' }))
    }, 400)
  },

  async deleteCases(ids) {
    if (!ids.length) return
    get().pushHistory()
    const set_ = new Set(ids)
    const canvas = get().canvas
    set({
      cases: get().cases.filter((c) => !set_.has(c.id)),
      canvas: canvas
        ? {
            ...canvas,
            nodes: canvas.nodes.filter((n) => !(n.data?.caseId && set_.has(n.data.caseId))),
            edges: canvas.edges.filter((e) => {
              const nodeIds = new Set(
                canvas.nodes
                  .filter((n) => !(n.data?.caseId && set_.has(n.data.caseId)))
                  .map((n) => n.id),
              )
              return nodeIds.has(e.source) && nodeIds.has(e.target)
            }),
          }
        : null,
      selectedNodeId: null,
      selectedCaseId: get().selectedCaseId && set_.has(get().selectedCaseId!) ? null : get().selectedCaseId,
    })
    await api.batchCases({ deletes: ids })
    get().saveCanvasNow()
    get().showToast({ text: `已删除 ${ids.length} 条用例` })
  },

  async importCases(csv, mode = 'merge') {
    const { suite, canvas, cases } = get()
    if (!suite || !canvas) return null
    // 先留快照，但只在导入成功后入栈，避免失败时脏了撤销栈
    const snapshot: Snapshot = JSON.parse(
      JSON.stringify({ cases, nodes: canvas.nodes, edges: canvas.edges }),
    )
    const res = await api.importCsv(suite.id, { csv, mode })
    const past = get().past
    set({
      cases: res.cases || cases,
      canvas: res.canvas || canvas,
      past: [...past.slice(-39), snapshot],
      future: [],
      selectedNodeId: null,
      selectedCaseId: null,
    })
    const s = res.stats
    const parts = [
      s.created ? `新增 ${s.created} 条` : '',
      s.updated ? `更新 ${s.updated} 条` : '',
      s.scenarios ? `新建 ${s.scenarios} 个场景` : '',
    ].filter(Boolean)
    get().showToast({
      text: `导入完成：${parts.join('，') || '没有变化'}`,
      actionLabel: '撤销',
      action: () => get().undo(),
    })
    return s
  },

  async deleteNodes(ids) {
    const { canvas } = get()
    if (!canvas || !ids.length) return
    const set_ = new Set(ids)
    const caseIds: string[] = []
    const scenarioIds: string[] = []
    canvas.nodes.forEach((n) => {
      if (!set_.has(n.id)) return
      if (n.type === 'case' && n.data?.caseId) caseIds.push(n.data.caseId)
      if (n.type === 'scenario') scenarioIds.push(n.id)
    })
    // 场景节点删除时，其下用例保留，仅解除分组
    const nodeIds = new Set(canvas.nodes.filter((n) => !set_.has(n.id)).map((n) => n.id))
    const ungrouped: string[] = []
    get().pushHistory()
    set({
      cases: get()
        .cases.filter((c) => !caseIds.includes(c.id))
        .map((c) => {
          if (c.groupId && scenarioIds.includes(c.groupId)) {
            ungrouped.push(c.id)
            return { ...c, groupId: null }
          }
          return c
        }),
      canvas: {
        ...canvas,
        nodes: canvas.nodes.filter((n) => !set_.has(n.id)),
        edges: canvas.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
      },
      selectedNodeId: null,
      selectedCaseId: get().selectedCaseId && caseIds.includes(get().selectedCaseId!) ? null : get().selectedCaseId,
    })
    if (caseIds.length) await api.batchCases({ deletes: caseIds })
    if (ungrouped.length) await api.batchCases({ updates: ungrouped.map((id) => ({ id, groupId: null })) })
    get().saveCanvasNow()
  },

  updateNodeData(id, patch) {
    const { canvas } = get()
    if (!canvas) return
    set({
      canvas: {
        ...canvas,
        nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      },
    })
    get().saveCanvasNow()
  },

  applyNodeChanges(changes) {
    const canvas = get().canvas
    if (!canvas) return
    let nodes = canvas.nodes
    let lastSelected: string | null = null
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        nodes = nodes.map((n) => (n.id === ch.id ? { ...n, position: ch.position } : n))
      } else if (ch.type === 'select') {
        nodes = nodes.map((n) => (n.id === ch.id ? { ...n, selected: ch.selected } : n))
        if (ch.selected) lastSelected = ch.id
      } else if (ch.type === 'dimensions' && ch.dimensions) {
        nodes = nodes.map((n) =>
          n.id === ch.id
            ? { ...n, measured: ch.dimensions, width: ch.dimensions.width, height: ch.dimensions.height }
            : n,
        )
      }
    }
    set({ canvas: { ...canvas, nodes } })
    if (lastSelected) get().selectNode(lastSelected)
    else if (changes.every((c) => c.type === 'select' && !c.selected)) set({ selectedNodeId: null, selectedCaseId: null })

    clearTimeout(canvasTimer)
    canvasTimer = setTimeout(() => get().saveCanvasNow(), 500)
  },

  addEdge(source, target) {
    const { canvas } = get()
    if (!canvas || source === target) return
    if (canvas.edges.some((e) => e.source === source && e.target === target)) return
    get().pushHistory()
    set({
      canvas: {
        ...canvas,
        edges: [...canvas.edges, { id: uid('e_'), source, target, kind: 'flow' }],
      },
    })
    get().saveCanvasNow()
  },

  deleteEdge(id) {
    const { canvas } = get()
    if (!canvas) return
    get().pushHistory()
    set({ canvas: { ...canvas, edges: canvas.edges.filter((e) => e.id !== id) } })
    get().saveCanvasNow()
  },

  async saveCanvasNow() {
    const { canvas } = get()
    if (!canvas) return
    try {
      await api.saveCanvas(canvas.id, {
        nodes: canvas.nodes.map(stripNode),
        edges: canvas.edges,
        viewport: canvas.viewport,
      })
    } catch {
      /* 本地优先，静默重试一次即可 */
    }
  },

  setViewport(vp) {
    const canvas = get().canvas
    if (!canvas) return
    set({ canvas: { ...canvas, viewport: vp } })
    clearTimeout(canvasTimer)
    canvasTimer = setTimeout(() => get().saveCanvasNow(), 600)
  },

  autoLayout() {
    const { canvas, cases } = get()
    if (!canvas) return
    get().pushHistory()
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 120, marginx: 40, marginy: 40 })
    const layoutNodes = canvas.nodes.filter((n) => n.type !== 'note')
    layoutNodes.forEach((n) => {
      const size = NODE_SIZE[n.type] || { w: 236, h: 100 }
      g.setNode(n.id, { width: size.w, height: size.h })
    })
    const nodeIds = new Set(layoutNodes.map((n) => n.id))
    canvas.edges.forEach((e) => {
      if (nodeIds.has(e.source) && nodeIds.has(e.target)) g.setEdge(e.source, e.target)
    })
    dagre.layout(g)
    const nodes = canvas.nodes.map((n) => {
      if (n.type === 'note') return n
      const pos = g.node(n.id)
      if (!pos) return n
      const size = NODE_SIZE[n.type] || { w: 236, h: 100 }
      return { ...n, position: { x: Math.round(pos.x - size.w / 2), y: Math.round(pos.y - size.h / 2) } }
    })
    // 未连接的便签或孤立节点不参与布局，避免重叠
    set({ canvas: { ...canvas, nodes } })
    get().saveCanvasNow()
    get().showToast({ text: '已按「场景流」重新布局' })
    void cases
  },

  setPending(patch, anchor) {
    if (!patch) {
      set({ pending: null })
      return
    }
    const origin = anchor || { x: 200, y: 200 }
    const items: PatchItem[] = (patch.items || []).map((it) => ({ ...it, checked: true }))
    const scenarios = items.filter((i) => i.type === 'scenario')
    const cases = items.filter((i) => i.type === 'case')
    const scenarioY = new Map<string, number>()
    scenarios.forEach((s, i) => {
      s.position = { x: origin.x, y: origin.y + i * 200 }
      s.nodeId = uid('n_')
      scenarioY.set(s.tmpId, s.position.y)
    })
    let cursor = 0
    cases.forEach((c) => {
      const parentY = c.parentTmpId ? scenarioY.get(c.parentTmpId) : undefined
      const y = parentY !== undefined ? parentY + cursor * 118 : origin.y + 130 + cursor * 118
      if (parentY !== undefined) cursor += 1
      c.position = { x: origin.x + 330, y }
      c.nodeId = uid('n_')
    })
    set({ pending: { ...patch, items, createdAt: Date.now() } })
  },

  togglePendingItem(tmpId) {
    const p = get().pending
    if (!p) return
    set({
      pending: {
        ...p,
        items: p.items.map((i) => (i.tmpId === tmpId ? { ...i, checked: !i.checked } : i)),
      },
    })
  },

  async adoptPending() {
    const { pending, suite, canvas, cases } = get()
    if (!pending || !suite || !canvas) return
    const snapshot: Snapshot = JSON.parse(
      JSON.stringify({ cases, nodes: canvas.nodes, edges: canvas.edges }),
    )
    const mode = pending.capability === 'normalize' ? 'update' : 'create'
    const items = pending.items.filter((i) => i.checked)
    if (!items.length) return

    const payload = {
      suiteId: suite.id,
      canvasId: canvas.id,
      mode: mode as 'create' | 'update',
      targetCaseId: pending.targetCaseId,
      items,
      edges: pending.edges || [],
    }
    const res = await api.adoptPatch(payload)
    set({
      cases: mode === 'update' ? get().cases.map((c) => (c.id === res.case!.id ? res.case! : c)) : [...get().cases, ...(res.cases || [])],
      canvas: res.canvas,
      pending: null,
      selectedNodeId: null,
      selectedCaseId: mode === 'update' ? pending.targetCaseId || null : null,
    })
    const count = mode === 'update' ? 1 : (res.cases || []).length
    get().showToast({
      text: mode === 'update' ? '已用 AI 结果更新该用例' : `已采纳 ${count} 条用例`,
      actionLabel: '撤销',
      action: async () => {
        await api.syncSuite(suite.id, {
          cases: snapshot.cases,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
        })
        set({
          cases: snapshot.cases,
          canvas: { ...canvas, nodes: snapshot.nodes, edges: snapshot.edges },
        })
      },
    })
  },

  clearPending: () => set({ pending: null }),

  showToast: (t) => {
    const id = Date.now() + Math.random()
    set({ toast: { ...t, id } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 4200)
  },

  clearToast: () => set({ toast: null }),
}))
