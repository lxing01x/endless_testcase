export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type CaseStatus = 'draft' | 'reviewing' | 'approved' | 'deprecated'

export interface Step {
  action: string
  data?: string
}

export interface CaseRecord {
  id: string
  suiteId: string
  groupId: string | null
  title: string
  preconditions: string
  steps: Step[]
  expected: string
  priority: Priority
  type: string
  tags: string[]
  status: CaseStatus
  order: number
  aiMeta?: { generated?: boolean; model?: string; at?: string } | null
  createdAt?: string
  updatedAt?: string
}

export interface XY {
  x: number
  y: number
}

export type NodeKind = 'case' | 'scenario' | 'requirement' | 'note' | 'ghost'

export interface CanvasNode {
  id: string
  type: NodeKind
  position: XY
  data: Record<string, any>
  selected?: boolean
  width?: number
  height?: number
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  kind?: 'flow' | 'contains' | 'data'
}

export interface CanvasState {
  id: string
  suiteId: string
  name: string
  layoutMode: string
  viewport?: { x: number; y: number; zoom: number }
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface Suite {
  id: string
  projectId: string
  name: string
  order: number
  caseCount?: number
}

export interface Project {
  id: string
  name: string
  description?: string
  suiteCount?: number
  caseCount?: number
}

export interface AiConfig {
  baseUrl: string
  model: string
  temperature: number
  configured: boolean
  keyHint: string | null
  updatedAt: string | null
}

export type Capability = 'requirement2case' | 'diverge' | 'normalize'

export interface PatchItem {
  tmpId: string
  type: 'scenario' | 'case'
  title: string
  parentTmpId?: string | null
  priority?: Priority
  preconditions?: string
  steps?: Step[]
  expected?: string
  tags?: string[]
  caseType?: string
  // adopt 时填充
  nodeId?: string
  position?: XY
  checked?: boolean
  groupId?: string | null
}

export interface PatchEdge {
  source: string
  target: string
  kind?: string
}

export interface PendingPatch {
  capability: Capability
  items: PatchItem[]
  edges: PatchEdge[]
  summary?: string
  targetCaseId?: string
  createdAt: number
}
