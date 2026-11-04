import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import {
  Plus,
  LayoutTemplate,
  FileText,
  StickyNote,
  LayoutGrid,
  Maximize2,
  Sparkles,
} from 'lucide-react'
import { useStore } from '../store'
import { CaseNode, ScenarioNode, RequirementNode, NoteNode, GhostNode } from './nodes'
import { setCenterProvider } from '../lib/viewport'

const nodeTypes = {
  case: CaseNode,
  scenario: ScenarioNode,
  requirement: RequirementNode,
  note: NoteNode,
  ghost: GhostNode,
}

const MINI_COLOR: Record<string, { light: string; dark: string }> = {
  case: { light: '#d3d8ea', dark: '#2b3150' },
  scenario: { light: '#bcabf7', dark: '#5a45b8' },
  requirement: { light: '#ecd8ae', dark: '#5a4726' },
  note: { light: '#f0dd97', dark: '#5a4a20' },
}

/** 图纸网格与连线的配色：随主题走，避免硬编码色值散落在组件里 */
const SKIN = {
  light: {
    gridMinor: '#e9ebf6',
    gridMajor: '#d9ddf0',
    edge: '#c4c9e0',
    edgeFlow: '#a99bf0',
    arrow: '#b6bbd2',
    mask: 'rgba(246, 247, 252, 0.8)',
  },
  dark: {
    gridMinor: 'rgba(255, 255, 255, 0.026)',
    gridMajor: 'rgba(255, 255, 255, 0.058)',
    edge: 'rgba(160, 172, 214, 0.26)',
    edgeFlow: 'rgba(139, 107, 255, 0.6)',
    arrow: 'rgba(150, 162, 205, 0.5)',
    mask: 'rgba(7, 9, 17, 0.72)',
  },
}

export default function CanvasView() {
  const canvas = useStore((s) => s.canvas)
  const cases = useStore((s) => s.cases)
  const pending = useStore((s) => s.pending)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const applyNodeChanges = useStore((s) => s.applyNodeChanges)
  const selectNode = useStore((s) => s.selectNode)
  const addEdge = useStore((s) => s.addEdge)
  const addCase = useStore((s) => s.addCase)
  const addScenario = useStore((s) => s.addScenario)
  const addRequirement = useStore((s) => s.addRequirement)
  const addNote = useStore((s) => s.addNote)
  const autoLayout = useStore((s) => s.autoLayout)
  const setViewport = useStore((s) => s.setViewport)
  const setAiOpen = useStore((s) => s.setAiOpen)
  const ai = useStore((s) => s.ai)
  const theme = useStore((s) => s.theme)
  const skin = SKIN[theme]

  const rf = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)

  const caseMap = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases])

  useEffect(() => {
    setCenterProvider(() => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return { x: 120, y: 120 }
      const p = rf.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
      return { x: Math.round(p.x - 140), y: Math.round(p.y - 70) }
    })
  }, [rf])

  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => rf.fitView({ padding: 0.18, duration: 380 }), 160)
    return () => clearTimeout(t)
  }, [pending, rf])

  const rfNodes: Node[] = useMemo(() => {
    if (!canvas) return []
    const orderMap = new Map(cases.map((c, i) => [c.id, i]))
    const base: Node[] = canvas.nodes.map((n) => {
      let data: Record<string, any> = { ...n.data }
      if (n.type === 'case') {
        const c = caseMap.get(n.data.caseId)
        data = { ...data, case: c, missing: !c, index: c ? orderMap.get(c.id) : undefined }
      }
      if (n.type === 'scenario') {
        data = {
          ...data,
          caseCount: cases.filter((c) => c.groupId === n.id).length,
        }
      }
      return {
        id: n.id,
        type: n.type,
        position: n.position,
        selected: n.id === selectedNodeId,
        measured: (n as any).measured,
        width: (n as any).width,
        height: (n as any).height,
        data,
      }
    })
    const ghosts: Node[] = pending
      ? pending.items
          .filter((i) => i.position)
          .map((i) => {
            const w = i.type === 'scenario' ? 240 : 236
            const h = i.type === 'scenario' ? 62 : 96
            return {
              id: 'ghost_' + i.tmpId,
              type: 'ghost',
              position: i.position!,
              data: { item: i, checked: i.checked },
              draggable: false,
              selectable: false,
              connectable: false,
              width: w,
              height: h,
              measured: { width: w, height: h },
            }
          })
      : []
    return [...base, ...ghosts]
  }, [canvas, caseMap, cases, selectedNodeId, pending])

  const rfEdges: Edge[] = useMemo(() => {
    if (!canvas) return []
    const base: Edge[] = canvas.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.kind === 'flow',
      style: {
        stroke: e.kind === 'flow' ? skin.edgeFlow : skin.edge,
        strokeWidth: e.kind === 'flow' ? 1.6 : 1.3,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 11,
        height: 11,
        color: skin.arrow,
      },
    }))
    const ghosts: Edge[] = pending
      ? (pending.edges || []).map((e, i) => ({
          id: 'ge_' + i,
          source: 'ghost_' + e.source,
          target: 'ghost_' + e.target,
          type: 'smoothstep',
          style: { stroke: 'var(--accent)', strokeDasharray: '4 3', strokeWidth: 1.1 },
          animated: true,
        }))
      : []
    return [...base, ...ghosts]
  }, [canvas, pending, skin])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const el = e.target as HTMLElement
      if (!el.classList?.contains('react-flow__pane')) return
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addCase({ x: Math.round(p.x - 118), y: Math.round(p.y - 52) })
    },
    [rf, addCase],
  )

  if (!canvas) {
    return <div className="empty-state">左侧选择或新建一个用例集，开始画用例。</div>
  }

  const isEmpty = canvas.nodes.length === 0 && !pending

  return (
    <div className="canvas-wrap" ref={wrapRef} onDoubleClick={handleDoubleClick}>
      <ReactFlow
        key={canvas.id}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        defaultViewport={canvas.viewport || { x: 40, y: 40, zoom: 0.9 }}
        minZoom={0.15}
        maxZoom={2.2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        onNodesChange={applyNodeChanges}
        onNodeClick={(_, node) => {
          if (node.id.startsWith('ghost_')) return
          selectNode(node.id)
        }}
        onPaneClick={() => selectNode(null)}
        onConnect={(c) => {
          if (c.source && c.target) addEdge(c.source, c.target)
        }}
        onMoveEnd={(_, vp) => setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })}
        nodesDraggable
        elementsSelectable
        selectionOnDrag={false}
        panOnDrag
        zoomOnDoubleClick={false}
      >
        <Background
          id="grid-minor"
          variant={BackgroundVariant.Lines}
          gap={16}
          lineWidth={1}
          color={skin.gridMinor}
        />
        <Background
          id="grid-major"
          variant={BackgroundVariant.Lines}
          gap={80}
          lineWidth={1}
          color={skin.gridMajor}
        />
        {!isEmpty && (
          <MiniMap
            className="minimap"
            pannable
            zoomable
            nodeColor={(n) => MINI_COLOR[n.type || 'case']?.[theme] || skin.edge}
            nodeStrokeWidth={0}
            maskColor={skin.mask}
            style={{ width: 132, height: 88 }}
          />
        )}
      </ReactFlow>

      <div className="flow-tools">
        <button title="新建用例" onClick={() => addCase()}>
          <Plus size={16} />
          <span className="tip">新建用例 · N</span>
        </button>
        <button onClick={() => addScenario()}>
          <LayoutTemplate size={16} />
          <span className="tip">新建场景 · S</span>
        </button>
        <button onClick={() => addRequirement()}>
          <FileText size={16} />
          <span className="tip">新建需求 · R</span>
        </button>
        <button onClick={() => addNote()}>
          <StickyNote size={16} />
          <span className="tip">新建便签 · B</span>
        </button>
        <div className="divider" />
        <button onClick={autoLayout}>
          <LayoutGrid size={16} />
          <span className="tip">自动布局 · L</span>
        </button>
        <button onClick={() => rf.fitView({ padding: 0.22, duration: 320 })}>
          <Maximize2 size={16} />
          <span className="tip">全览 · ⇧1</span>
        </button>
      </div>

      {isEmpty && (
        <div className="canvas-empty">
          <div className="box">
            <span className="kicker">空白图纸 · 从一段需求开始</span>
            <h3>把用例「画」出来</h3>
            <p>
              先放一个需求节点，再铺开场景与用例；也可以直接双击空白处新建用例。
              便签留给还没想清楚的部分。
            </p>
            <div className="row">
              <button className="primary-btn" onClick={() => addRequirement()}>
                <FileText size={13} /> 新建需求
              </button>
              <button className="primary-btn ghost" onClick={() => addCase()}>
                <Plus size={13} /> 新建用例
              </button>
              <button
                className="primary-btn ghost"
                onClick={() => {
                  if (!ai?.configured) {
                    useStore.getState().setSettingsOpen(true)
                    return
                  }
                  setAiOpen(true)
                }}
              >
                <Sparkles size={13} /> AI 生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
