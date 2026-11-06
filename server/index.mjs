import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { ROOT, getDb, persist, uid } from './db.mjs'
import {
  generate,
  publicAiSettings,
  saveAiSettings,
  testConnection,
} from './ai.mjs'

const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 8 * 1024 * 1024 })
await app.register(cors, { origin: true })

const db = getDb()
const now = () => new Date().toISOString()
const ok = (data) => ({ ok: true, data })

function findProject(id) {
  return db.projects.find((p) => p.id === id)
}
function findSuite(id) {
  return db.suites.find((s) => s.id === id)
}
function findCanvasBySuite(suiteId) {
  return db.canvases.find((c) => c.suiteId === suiteId)
}
function casesOfSuite(suiteId) {
  return db.cases
    .filter((c) => c.suiteId === suiteId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt))
}

app.get('/api/health', async () => ok({ status: 'up', version: '0.1.0' }))

app.get('/api/projects', async () => {
  const list = db.projects.map((p) => {
    const suites = db.suites.filter((s) => s.projectId === p.id)
    const caseCount = db.cases.filter((c) => suites.some((s) => s.id === c.suiteId)).length
    return { ...p, suiteCount: suites.length, caseCount }
  })
  return ok(list)
})

app.post('/api/projects', async (req) => {
  const { name, description = '' } = req.body || {}
  if (!name?.trim()) return { ok: false, error: '项目名称不能为空' }
  const project = {
    id: uid('p_'),
    name: name.trim(),
    description,
    createdAt: now(),
    updatedAt: now(),
  }
  db.projects.push(project)
  const suite = {
    id: uid('s_'),
    projectId: project.id,
    name: '新用例集',
    order: 0,
    createdAt: now(),
  }
  db.suites.push(suite)
  db.canvases.push({
    id: uid('cv_'),
    suiteId: suite.id,
    name: '主画布',
    layoutMode: 'flow',
    viewport: { x: 40, y: 40, zoom: 0.9 },
    nodes: [],
    edges: [],
  })
  persist()
  return ok({ project, suite })
})

app.patch('/api/projects/:id', async (req) => {
  const p = findProject(req.params.id)
  if (!p) return { ok: false, error: '项目不存在' }
  const { name, description } = req.body || {}
  if (typeof name === 'string' && name.trim()) p.name = name.trim()
  if (typeof description === 'string') p.description = description
  p.updatedAt = now()
  persist()
  return ok(p)
})

app.delete('/api/projects/:id', async (req) => {
  const id = req.params.id
  const suiteIds = db.suites.filter((s) => s.projectId === id).map((s) => s.id)
  db.projects = db.projects.filter((p) => p.id !== id)
  db.suites = db.suites.filter((s) => s.projectId !== id)
  db.cases = db.cases.filter((c) => !suiteIds.includes(c.suiteId))
  db.canvases = db.canvases.filter((c) => !suiteIds.includes(c.suiteId))
  persist(true)
  return ok({ id })
})

app.get('/api/projects/:id', async (req) => {
  const project = findProject(req.params.id)
  if (!project) return { ok: false, error: '项目不存在' }
  const suites = db.suites
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({ ...s, caseCount: db.cases.filter((c) => c.suiteId === s.id).length }))
  return ok({ project, suites })
})

app.post('/api/suites', async (req) => {
  const { projectId, name } = req.body || {}
  const project = findProject(projectId)
  if (!project) return { ok: false, error: '项目不存在' }
  if (!name?.trim()) return { ok: false, error: '用例集名称不能为空' }
  const suite = {
    id: uid('s_'),
    projectId,
    name: name.trim(),
    order: db.suites.filter((s) => s.projectId === projectId).length,
    createdAt: now(),
  }
  db.suites.push(suite)
  db.canvases.push({
    id: uid('cv_'),
    suiteId: suite.id,
    name: '主画布',
    layoutMode: 'flow',
    viewport: { x: 40, y: 40, zoom: 0.9 },
    nodes: [],
    edges: [],
  })
  persist()
  return ok(suite)
})

app.patch('/api/suites/:id', async (req) => {
  const s = findSuite(req.params.id)
  if (!s) return { ok: false, error: '用例集不存在' }
  if (typeof req.body?.name === 'string' && req.body.name.trim()) s.name = req.body.name.trim()
  persist()
  return ok(s)
})

app.delete('/api/suites/:id', async (req) => {
  const id = req.params.id
  db.suites = db.suites.filter((s) => s.id !== id)
  db.cases = db.cases.filter((c) => c.suiteId !== id)
  db.canvases = db.canvases.filter((c) => c.suiteId !== id)
  persist(true)
  return ok({ id })
})

app.get('/api/suites/:id/full', async (req) => {
  const suite = findSuite(req.params.id)
  if (!suite) return { ok: false, error: '用例集不存在' }
  let canvas = findCanvasBySuite(suite.id)
  if (!canvas) {
    canvas = {
      id: uid('cv_'),
      suiteId: suite.id,
      name: '主画布',
      layoutMode: 'flow',
      viewport: { x: 40, y: 40, zoom: 0.9 },
      nodes: [],
      edges: [],
    }
    db.canvases.push(canvas)
    persist()
  }
  return ok({ suite, cases: casesOfSuite(suite.id), canvas })
})

function normalizeCasePatch(patch) {
  const allowed = [
    'title',
    'preconditions',
    'steps',
    'expected',
    'priority',
    'type',
    'tags',
    'status',
    'order',
    'groupId',
  ]
  const out = {}
  for (const k of allowed) {
    if (patch[k] !== undefined) out[k] = patch[k]
  }
  return out
}

app.post('/api/cases', async (req) => {
  const { suiteId, groupId = null, ...rest } = req.body || {}
  if (!findSuite(suiteId)) return { ok: false, error: '用例集不存在' }
  const order = db.cases.filter((c) => c.suiteId === suiteId).length
  const item = {
    id: uid('c_'),
    suiteId,
    groupId,
    title: rest.title?.trim() || '未命名用例',
    preconditions: rest.preconditions || '',
    steps: rest.steps || [],
    expected: rest.expected || '',
    priority: rest.priority || 'P2',
    type: rest.type || '功能',
    tags: rest.tags || [],
    status: rest.status || 'draft',
    order,
    aiMeta: rest.aiMeta || null,
    createdAt: now(),
    updatedAt: now(),
  }
  db.cases.push(item)
  persist()
  return ok(item)
})

app.patch('/api/cases/:id', async (req) => {
  const item = db.cases.find((c) => c.id === req.params.id)
  if (!item) return { ok: false, error: '用例不存在' }
  Object.assign(item, normalizeCasePatch(req.body || {}))
  item.updatedAt = now()
  persist()
  return ok(item)
})

app.post('/api/cases/batch', async (req) => {
  const { creates = [], updates = [], deletes = [] } = req.body || {}
  const created = []
  for (const c of creates) {
    if (!findSuite(c.suiteId)) continue
    const order = db.cases.filter((x) => x.suiteId === c.suiteId).length
    const item = {
      id: c.id || uid('c_'),
      suiteId: c.suiteId,
      groupId: c.groupId || null,
      title: c.title?.trim() || '未命名用例',
      preconditions: c.preconditions || '',
      steps: c.steps || [],
      expected: c.expected || '',
      priority: c.priority || 'P2',
      type: c.type || '功能',
      tags: c.tags || [],
      status: c.status || 'draft',
      order: c.order ?? order,
      aiMeta: c.aiMeta || null,
      createdAt: now(),
      updatedAt: now(),
    }
    db.cases.push(item)
    created.push(item)
  }
  const updated = []
  for (const u of updates) {
    const item = db.cases.find((c) => c.id === u.id)
    if (!item) continue
    Object.assign(item, normalizeCasePatch(u))
    item.updatedAt = now()
    updated.push(item)
  }
  if (deletes.length) {
    const del = new Set(deletes)
    db.cases = db.cases.filter((c) => !del.has(c.id))
    for (const canvas of db.canvases) {
      canvas.nodes = canvas.nodes.filter((n) => !(n.data?.caseId && del.has(n.data.caseId)))
      const ids = new Set(canvas.nodes.map((n) => n.id))
      canvas.edges = canvas.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    }
  }
  persist()
  return ok({ created, updated, deleted: deletes })
})

/* ---------------- CSV 导入 ---------------- */

/** 表头别名：中英文都认，方便从 Excel / 其他工具导出的表格直接用 */
const IMPORT_FIELDS = {
  scenario: ['场景', '所属场景', '分组', '模块', 'scenario', 'group', 'module'],
  title: ['标题', '用例标题', '用例名称', '用例', 'title', 'name', 'case'],
  priority: ['优先级', 'priority', 'prio'],
  type: ['类型', '用例类型', 'type', 'kind'],
  preconditions: ['前置条件', '前提条件', '前置', 'preconditions', 'precondition'],
  steps: ['步骤', '操作步骤', '测试步骤', 'steps', 'step'],
  expected: ['预期结果', '预期', '期望结果', 'expected', 'expectedresult', 'result'],
  tags: ['标签', 'tags', 'tag'],
  status: ['状态', 'status'],
}

const DEFAULT_IMPORT_COLS = [
  'scenario',
  'title',
  'priority',
  'type',
  'preconditions',
  'steps',
  'expected',
  'tags',
  'status',
]

const HEADER_LOOKUP = new Map()
for (const [field, aliases] of Object.entries(IMPORT_FIELDS)) {
  for (const alias of aliases) {
    HEADER_LOOKUP.set(alias.toLowerCase().replace(/[\s_:：-]/g, ''), field)
  }
}

const STATUS_ALIAS = {
  草稿: 'draft',
  draft: 'draft',
  待评审: 'reviewing',
  评审中: 'reviewing',
  reviewing: 'reviewing',
  已通过: 'approved',
  通过: 'approved',
  approved: 'approved',
  已废弃: 'deprecated',
  废弃: 'deprecated',
  deprecated: 'deprecated',
}

/** 手写 CSV 解析：支持双引号包裹、字段内换行与转义引号 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''))
}

function parseSteps(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ action: line.replace(/^\s*(?:\d+[.、)）]|[-*·])\s*/, '') }))
    .filter((s) => s.action)
}

function parseImportRows(csv) {
  const rows = parseCsv(String(csv || '').replace(/^\uFEFF/, ''))
  if (!rows.length) return { items: [], hasHeader: false }

  const header = rows[0].map(
    (cell) => HEADER_LOOKUP.get(String(cell).toLowerCase().replace(/[\s_:：-]/g, '')) || null,
  )
  // 至少命中两列才认为是表头，否则按固定列序（与导出格式一致）解析
  const hasHeader = header.filter(Boolean).length >= 2
  const cols = hasHeader ? header : DEFAULT_IMPORT_COLS
  const body = hasHeader ? rows.slice(1) : rows

  const items = []
  for (const r of body) {
    const rec = {}
    cols.forEach((key, i) => {
      if (key && rec[key] === undefined) rec[key] = String(r[i] ?? '').trim()
    })
    if (!rec.title) continue
    const priority = String(rec.priority || '').toUpperCase()
    items.push({
      scenario: rec.scenario || '',
      title: rec.title.trim(),
      priority: ['P0', 'P1', 'P2', 'P3'].includes(priority) ? priority : 'P2',
      type: rec.type || '功能',
      preconditions: rec.preconditions || '',
      steps: parseSteps(rec.steps),
      expected: rec.expected || '',
      tags: String(rec.tags || '')
        .split(/[,，;；、]/)
        .map((t) => t.trim())
        .filter(Boolean),
      status: STATUS_ALIAS[String(rec.status || '').toLowerCase()] || STATUS_ALIAS[String(rec.status || '')] || 'draft',
    })
  }
  return { items, hasHeader }
}

app.post('/api/suites/:id/import', async (req) => {
  const suite = findSuite(req.params.id)
  if (!suite) return { ok: false, error: '用例集不存在' }
  const { csv = '', mode = 'merge', dryRun = false } = req.body || {}
  const { items, hasHeader } = parseImportRows(csv)
  if (!items.length) {
    return { ok: false, error: '没有解析到用例：请确认表格里有「标题」列，且不是空文件' }
  }

  const canvas = findCanvasBySuite(suite.id)
  if (!canvas) return { ok: false, error: '画布不存在' }

  const replace = mode === 'replace'
  const scenarioLabel = new Map()
  for (const node of canvas.nodes) {
    if (node.type === 'scenario') scenarioLabel.set(node.id, String(node.data?.label || '').trim())
  }
  const scenarioIdByLabel = new Map()
  for (const [id, label] of scenarioLabel) if (!scenarioIdByLabel.has(label)) scenarioIdByLabel.set(label, id)

  const keyOf = (label, title) => `${label.trim().toLowerCase()}::${title.trim().toLowerCase()}`
  const existing = casesOfSuite(suite.id)
  const index = new Map()
  if (!replace) {
    for (const c of existing) index.set(keyOf(scenarioLabel.get(c.groupId) || '', c.title), c)
  }

  const plan = []
  const seenKeys = new Set()
  let skipped = 0
  for (const item of items) {
    const key = keyOf(item.scenario, item.title)
    if (seenKeys.has(key)) {
      skipped++
      continue
    }
    seenKeys.add(key)
    plan.push({ item, target: index.get(key) || null })
  }

  const toCreate = plan.filter((p) => !p.target)
  const newLabels = [...new Set(toCreate.map((p) => p.item.scenario).filter(Boolean))].filter(
    (label) => !scenarioIdByLabel.has(label),
  )

  const stats = {
    created: toCreate.length,
    updated: plan.length - toCreate.length,
    skipped,
    scenarios: newLabels.length,
    removed: replace ? existing.length : 0,
    total: plan.length,
  }
  const preview = plan.slice(0, 8).map((p) => ({
    title: p.item.title,
    scenario: p.item.scenario || '未分组',
    priority: p.item.priority,
    steps: p.item.steps.length,
    action: p.target ? 'update' : 'create',
  }))

  if (dryRun) return ok({ stats, preview, hasHeader })

  if (replace) {
    const drop = new Set(existing.map((c) => c.id))
    db.cases = db.cases.filter((c) => !drop.has(c.id))
    canvas.nodes = canvas.nodes.filter((n) => !(n.data?.caseId && drop.has(n.data.caseId)))
    const alive = new Set(canvas.nodes.map((n) => n.id))
    canvas.edges = canvas.edges.filter((e) => alive.has(e.source) && alive.has(e.target))
  }

  let order = casesOfSuite(suite.id).length
  for (const p of plan) {
    if (!p.target) continue
    Object.assign(p.target, {
      priority: p.item.priority,
      type: p.item.type,
      preconditions: p.item.preconditions,
      steps: p.item.steps,
      expected: p.item.expected,
      tags: p.item.tags,
      status: p.item.status,
      updatedAt: now(),
    })
  }

  // 新用例按场景分列排布，接在现有内容下方，不覆盖已有节点
  let baseY = 80
  let maxY = 0
  for (const node of canvas.nodes) {
    maxY = Math.max(maxY, node.position.y + (node.type === 'case' ? 120 : 84))
  }
  if (canvas.nodes.length) baseY = maxY + 110
  const baseX = 80

  const groups = new Map()
  for (const p of toCreate) {
    const label = p.item.scenario
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(p)
  }

  let col = 0
  for (const [label, group] of groups) {
    const x = baseX + col * 300
    let scenarioId = label ? scenarioIdByLabel.get(label) || null : null
    if (label && !scenarioId) {
      const node = {
        id: uid('n_'),
        type: 'scenario',
        position: { x, y: baseY },
        data: { label, accent: 'violet' },
      }
      canvas.nodes.push(node)
      scenarioId = node.id
      scenarioIdByLabel.set(label, node.id)
    }
    const startY = label ? baseY + 84 : baseY
    group.forEach((p, i) => {
      const created = {
        id: uid('c_'),
        suiteId: suite.id,
        groupId: scenarioId,
        title: p.item.title,
        preconditions: p.item.preconditions,
        steps: p.item.steps,
        expected: p.item.expected,
        priority: p.item.priority,
        type: p.item.type,
        tags: p.item.tags,
        status: p.item.status,
        order: order++,
        aiMeta: null,
        createdAt: now(),
        updatedAt: now(),
      }
      db.cases.push(created)
      const node = {
        id: uid('n_'),
        type: 'case',
        position: { x, y: startY + i * 128 },
        data: { caseId: created.id },
      }
      canvas.nodes.push(node)
      if (scenarioId) {
        canvas.edges.push({ id: uid('e_'), source: scenarioId, target: node.id, kind: 'contains' })
      }
    })
    col++
  }

  canvas.updatedAt = now()
  persist(true)
  return ok({ stats, preview, hasHeader, cases: casesOfSuite(suite.id), canvas })
})

app.put('/api/canvases/:id', async (req) => {
  const canvas = db.canvases.find((c) => c.id === req.params.id)
  if (!canvas) return { ok: false, error: '画布不存在' }
  const { nodes, edges, viewport, layoutMode, name } = req.body || {}
  if (Array.isArray(nodes)) canvas.nodes = nodes
  if (Array.isArray(edges)) canvas.edges = edges
  if (viewport) canvas.viewport = viewport
  if (layoutMode) canvas.layoutMode = layoutMode
  if (name) canvas.name = name
  canvas.updatedAt = now()
  persist()
  return ok(canvas)
})

app.post('/api/suites/:id/sync', async (req) => {
  const suite = findSuite(req.params.id)
  if (!suite) return { ok: false, error: '用例集不存在' }
  const { cases = [], nodes = [], edges = [] } = req.body || {}
  db.cases = db.cases.filter((c) => c.suiteId !== suite.id)
  for (const c of cases) {
    db.cases.push({
      ...c,
      suiteId: suite.id,
      updatedAt: c.updatedAt || now(),
      createdAt: c.createdAt || now(),
    })
  }
  const canvas = findCanvasBySuite(suite.id)
  if (canvas) {
    canvas.nodes = nodes
    canvas.edges = edges
    canvas.updatedAt = now()
  }
  persist(true)
  return ok({ suiteId: suite.id })
})

app.get('/api/settings/ai', async () => ok(publicAiSettings()))

app.put('/api/settings/ai', async (req) => ok(saveAiSettings(req.body || {})))

app.post('/api/settings/ai/test', async () => {
  try {
    return ok(await testConnection())
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

app.post('/api/ai/generate', (req, reply) => {
  const { capability, input = {} } = req.body || {}
  const body = Readable.from(
    (async function* () {
      try {
        for await (const evt of generate(capability, input)) {
          yield `data: ${JSON.stringify(evt)}\n\n`
          if (evt.type === 'error' || evt.type === 'done') break
        }
        yield 'data: [DONE]\n\n'
      } catch (err) {
        yield `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`
      }
    })(),
  )
  reply
    .header('Content-Type', 'text/event-stream; charset=utf-8')
    .header('Cache-Control', 'no-cache, no-transform')
    .header('Connection', 'keep-alive')
    .header('X-Accel-Buffering', 'no')
    .send(body)
})

app.post('/api/ai/adopt', async (req) => {
  const { suiteId, canvasId, mode = 'create', targetCaseId, items = [], edges = [] } = req.body || {}
  const suite = findSuite(suiteId)
  if (!suite) return { ok: false, error: '用例集不存在' }

  if (mode === 'update') {
    const item = db.cases.find((c) => c.id === targetCaseId)
    if (!item) return { ok: false, error: '目标用例不存在' }
    const src = items[0] || {}
    if (src.title) item.title = src.title
    if (src.preconditions !== undefined) item.preconditions = src.preconditions || ''
    if (Array.isArray(src.steps) && src.steps.length) item.steps = src.steps
    if (src.expected) item.expected = src.expected
    if (src.priority) item.priority = src.priority
    if (Array.isArray(src.tags) && src.tags.length) item.tags = src.tags
    item.aiMeta = { generated: true, model: db.settings.ai.model, at: now() }
    item.updatedAt = now()
    persist()
    return ok({ case: item, canvas: findCanvasBySuite(suiteId) })
  }

  let canvas = canvasId ? db.canvases.find((c) => c.id === canvasId) : findCanvasBySuite(suiteId)
  if (!canvas) {
    canvas = {
      id: uid('cv_'),
      suiteId,
      name: '主画布',
      layoutMode: 'flow',
      viewport: { x: 40, y: 40, zoom: 0.9 },
      nodes: [],
      edges: [],
    }
    db.canvases.push(canvas)
  }

  const baseOrder = db.cases.filter((c) => c.suiteId === suiteId).length
  const createdCases = []
  const nodeIdByTmp = new Map()
  const scenarioIds = new Set()

  // 先落场景节点，用例才能挂到正确的 groupId 上
  for (const item of items.filter((i) => i.type === 'scenario')) {
    const nodeId = item.nodeId || uid('n_')
    if (item.tmpId) nodeIdByTmp.set(item.tmpId, nodeId)
    scenarioIds.add(nodeId)
    canvas.nodes.push({
      id: nodeId,
      type: 'scenario',
      position: item.position || { x: 0, y: 0 },
      data: { label: item.title || '新场景', accent: item.accent || 'violet' },
    })
  }

  for (const item of items.filter((i) => i.type === 'case')) {
    const nodeId = item.nodeId || uid('n_')
    if (item.tmpId) nodeIdByTmp.set(item.tmpId, nodeId)
    const parentNodeId = item.parentTmpId ? nodeIdByTmp.get(item.parentTmpId) : null
    const created = {
      id: uid('c_'),
      suiteId,
      groupId: parentNodeId && scenarioIds.has(parentNodeId) ? parentNodeId : null,
      title: item.title?.trim() || 'AI 生成用例',
      preconditions: item.preconditions || '',
      steps: Array.isArray(item.steps) ? item.steps : [],
      expected: item.expected || '',
      priority: item.priority || 'P2',
      type: item.caseType || '功能',
      tags: Array.isArray(item.tags) ? item.tags : [],
      status: 'draft',
      order: baseOrder + createdCases.length,
      aiMeta: { generated: true, model: db.settings.ai.model, at: now() },
      createdAt: now(),
      updatedAt: now(),
    }
    db.cases.push(created)
    createdCases.push(created)
    canvas.nodes.push({
      id: nodeId,
      type: 'case',
      position: item.position || { x: 0, y: 0 },
      data: { caseId: created.id, fresh: true },
    })
  }

  for (const e of edges) {
    const source = nodeIdByTmp.get(e.source) || e.source
    const target = nodeIdByTmp.get(e.target) || e.target
    if (!source || !target || source === target) continue
    canvas.edges.push({ id: uid('e_'), source, target, kind: e.kind || 'contains' })
  }

  const lastUsage = [...db.aiUsage].reverse().find((u) => !u.adopted)
  if (lastUsage) lastUsage.adopted = true

  persist(true)
  return ok({ cases: createdCases, canvas, createdCaseIds: createdCases.map((c) => c.id) })
})

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

app.get('/api/suites/:id/export', async (req, reply) => {
  const suite = findSuite(req.params.id)
  if (!suite) return { ok: false, error: '用例集不存在' }
  const format = req.query.format === 'csv' ? 'csv' : 'md'
  const cases = casesOfSuite(suite.id)
  const canvas = findCanvasBySuite(suite.id)
  const groupName = (gid) => canvas?.nodes.find((n) => n.id === gid)?.data?.label || '未分组'

  if (format === 'csv') {
    const rows = [['场景', '标题', '优先级', '类型', '前置条件', '步骤', '预期结果', '标签', '状态']]
    for (const c of cases) {
      rows.push([
        groupName(c.groupId),
        c.title,
        c.priority,
        c.type,
        c.preconditions,
        c.steps.map((s, i) => `${i + 1}. ${s.action}${s.data ? `（${s.data}）` : ''}`).join('\n'),
        c.expected,
        (c.tags || []).join(','),
        c.status,
      ])
    }
    const body = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n')
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(suite.name)}.csv"`)
    return reply.send(body)
  }

  const lines = [`# ${suite.name}`, '']
  let last = null
  for (const c of cases) {
    const g = groupName(c.groupId)
    if (g !== last) {
      lines.push(`## ${g}`, '')
      last = g
    }
    lines.push(`### ${c.title}`)
    lines.push(`- 优先级：${c.priority}　类型：${c.type}　状态：${c.status}`)
    if (c.tags?.length) lines.push(`- 标签：${c.tags.join('、')}`)
    if (c.preconditions) lines.push(`- 前置条件：${c.preconditions}`)
    lines.push('', '**步骤**')
    c.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.action}${s.data ? `　数据：${s.data}` : ''}`))
    lines.push('', `**预期结果**：${c.expected || '—'}`, '')
  }
  const body = lines.join('\n')
  reply.header('Content-Type', 'text/markdown; charset=utf-8')
  reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(suite.name)}.md"`)
  return reply.send(body)
})

const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir, prefix: '/' })
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api')) return reply.code(404).send({ ok: false, error: 'not found' })
    return reply.sendFile('index.html')
  })
} else {
  app.get('/', async (_req, reply) => {
    reply.type('text/plain; charset=utf-8')
    return 'API server is running. Run `npm run dev` and open http://localhost:5173'
  })
}

const PORT = Number(process.env.PORT || 8787)
app.listen({ port: PORT, host: '127.0.0.1' }).then(() => {
  console.log(`[用例星图] api ready → http://127.0.0.1:${PORT}`)
})
