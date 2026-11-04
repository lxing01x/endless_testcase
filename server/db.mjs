import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

export const uid = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16)

const now = () => new Date().toISOString()

function emptyDb() {
  return {
    projects: [],
    suites: [],
    cases: [],
    canvases: [],
    settings: {
      ai: {
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        temperature: 0.3,
        keyCipher: null,
        updatedAt: null,
      },
    },
    aiUsage: [],
  }
}

function makeCase(suiteId, groupId, data) {
  const id = uid('c_')
  return {
    id,
    suiteId,
    groupId,
    title: data.title,
    preconditions: data.preconditions || '',
    steps: data.steps || [],
    expected: data.expected || '',
    priority: data.priority || 'P2',
    type: data.type || '功能',
    tags: data.tags || [],
    status: data.status || 'draft',
    order: data.order ?? 0,
    aiMeta: data.aiMeta || null,
    createdAt: now(),
    updatedAt: now(),
  }
}

function seed() {
  const db = emptyDb()
  const projectId = uid('p_')
  const suiteId = uid('s_')
  const canvasId = uid('cv_')

  db.projects.push({
    id: projectId,
    name: '支付中心',
    description: '支付、优惠券、退款相关的用例设计',
    createdAt: now(),
    updatedAt: now(),
  })
  db.suites.push({
    id: suiteId,
    projectId,
    name: '优惠券迭代 v2.4',
    order: 0,
    createdAt: now(),
  })

  const cases = [
    {
      groupId: 'sc_1',
      title: '满减券与折扣券同时选中最优一张生效',
      preconditions: '用户账户中有满100减20与9折券各一张',
      steps: [
        { action: '进入结算页，选择商品合计 120 元', data: '' },
        { action: '同时勾选两张优惠券', data: '' },
        { action: '点击提交订单', data: '' },
      ],
      expected: '仅满减券生效，实付 100 元；折扣券仍为未使用状态',
      priority: 'P0',
      type: '功能',
      tags: ['优惠券', '结算'],
      order: 0,
    },
    {
      groupId: 'sc_1',
      title: '优惠券不可与特价商品叠加',
      preconditions: '购物车含 1 件特价商品（已标注不参与优惠）',
      steps: [
        { action: '结算页尝试选择优惠券', data: '' },
        { action: '观察优惠券列表状态', data: '' },
      ],
      expected: '优惠券置灰不可选，提示「特价商品不参与优惠券活动」',
      priority: 'P1',
      type: '功能',
      tags: ['优惠券'],
      order: 1,
    },
    {
      groupId: 'sc_2',
      title: '优惠券刚好在支付瞬间过期',
      preconditions: '券有效期至 12:00:00，用户在 11:59:58 提交订单',
      steps: [
        { action: '11:59:58 点击提交订单', data: '' },
        { action: '12:00:03 完成支付', data: '' },
      ],
      expected: '以提交订单时刻为准，券核销成功；订单金额为优惠后金额',
      priority: 'P0',
      type: '异常',
      tags: ['优惠券', '时效'],
      order: 2,
    },
    {
      groupId: 'sc_2',
      title: '订单金额未达券门槛 0.01 元',
      preconditions: '满 100 减 20 券，订单金额 99.99 元',
      steps: [{ action: '进入结算页查看可用券列表', data: '' }],
      expected: '该券不可用，并提示「还差 0.01 元可用」',
      priority: 'P2',
      type: '边界',
      tags: ['优惠券', '金额'],
      order: 3,
    },
    {
      groupId: 'sc_2',
      title: '退款后优惠券按比例返还',
      preconditions: '订单使用满 100 减 20 券，实付 100 元',
      steps: [
        { action: '对订单中 60 元商品发起退款', data: '' },
        { action: '查看优惠券状态', data: '' },
      ],
      expected: '按退款金额比例返还优惠（12 元），券不返还但差额退回',
      priority: 'P1',
      type: '功能',
      tags: ['退款', '优惠券'],
      order: 4,
    },
  ].map((c) => makeCase(suiteId, c.groupId, c))

  db.cases.push(...cases)

  const caseNodes = cases.map((c, i) => ({
    id: uid('n_'),
    type: 'case',
    position: { x: 760, y: i < 2 ? 40 + i * 150 : 380 + (i - 2) * 150 },
    data: { caseId: c.id },
  }))

  db.canvases.push({
    id: canvasId,
    suiteId,
    name: '主画布',
    layoutMode: 'flow',
    viewport: { x: 40, y: 40, zoom: 0.85 },
    nodes: [
      {
        id: 'req_1',
        type: 'requirement',
        position: { x: 20, y: 150 },
        data: {
          text: '优惠券 2.4：支持满减券与折扣券叠加校验、门槛边界、过期与退款返还规则',
          source: 'PRD-2024-0912',
        },
      },
      {
        id: 'sc_1',
        type: 'scenario',
        position: { x: 400, y: 30 },
        data: { label: '券叠加规则', accent: 'violet' },
      },
      {
        id: 'sc_2',
        type: 'scenario',
        position: { x: 400, y: 370 },
        data: { label: '有效期与门槛', accent: 'teal' },
      },
      {
        id: 'note_1',
        type: 'note',
        position: { x: 40, y: 400 },
        data: { text: '待确认：券叠加时「最优」是按优惠金额还是按折扣率计算？', color: 'amber' },
      },
      ...caseNodes,
    ],
    edges: [
      { id: 'e1', source: 'req_1', target: 'sc_1', kind: 'flow' },
      { id: 'e2', source: 'req_1', target: 'sc_2', kind: 'flow' },
      { id: 'e3', source: 'sc_1', target: caseNodes[0].id, kind: 'contains' },
      { id: 'e4', source: 'sc_1', target: caseNodes[1].id, kind: 'contains' },
      { id: 'e5', source: 'sc_2', target: caseNodes[2].id, kind: 'contains' },
      { id: 'e6', source: 'sc_2', target: caseNodes[3].id, kind: 'contains' },
      { id: 'e7', source: 'sc_2', target: caseNodes[4].id, kind: 'contains' },
    ],
  })

  return db
}

let db
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    db.settings ||= emptyDb().settings
    db.aiUsage ||= []
  } catch {
    db = seed()
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
  }
} else {
  db = seed()
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

export function getDb() {
  return db
}

let timer = null
export function persist(immediate = false) {
  const write = () => {
    const tmp = DB_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
    fs.renameSync(tmp, DB_FILE)
  }
  if (immediate) {
    if (timer) clearTimeout(timer)
    timer = null
    write()
    return
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    try {
      write()
    } catch (err) {
      console.error('[db] persist failed', err)
    }
  }, 250)
}

export { DB_FILE, DATA_DIR, ROOT }
