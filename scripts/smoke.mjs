const BASE = process.env.BASE || 'http://127.0.0.1:8787'

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`${method} ${path} → ${json.error || res.status}`)
  return json.data
}

let passed = 0
let failed = 0
function check(name, cond, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

const run = async () => {
  console.log('\n用例星图 API smoke test\n')

  const { project, suite } = await call('POST', '/api/projects', {
    name: '__smoke__',
    description: '自动化冒烟',
  })
  check('创建项目并自动生成默认用例集', Boolean(project.id && suite.id))

  const full = await call('GET', `/api/suites/${suite.id}/full`)
  check('读取用例集（含画布）', full.canvas && Array.isArray(full.canvas.nodes))

  const created = await call('POST', '/api/cases', {
    suiteId: suite.id,
    title: '冒烟-手工创建',
    steps: [{ action: '打开页面', data: '' }],
  })
  check('手工创建用例', created.title === '冒烟-手工创建')

  await call('PATCH', `/api/cases/${created.id}`, { priority: 'P0', expected: '页面打开成功' })
  const after = await call('GET', `/api/suites/${suite.id}/full`)
  const patched = after.cases.find((c) => c.id === created.id)
  check('更新用例字段', patched.priority === 'P0' && patched.expected === '页面打开成功')

  const adopted = await call('POST', '/api/ai/adopt', {
    suiteId: suite.id,
    canvasId: full.canvas.id,
    mode: 'create',
    items: [
      { tmpId: 's1', type: 'scenario', title: 'AI 场景', nodeId: 'n_sc', position: { x: 400, y: 40 } },
      {
        tmpId: 'c1',
        type: 'case',
        title: 'AI 用例一',
        parentTmpId: 's1',
        priority: 'P1',
        steps: [{ action: '操作', data: '' }],
        expected: '成功',
        nodeId: 'n_c1',
        position: { x: 760, y: 40 },
      },
      {
        tmpId: 'c2',
        type: 'case',
        title: 'AI 用例二',
        parentTmpId: 's1',
        priority: 'P2',
        steps: [{ action: '操作2' }],
        expected: '成功2',
        nodeId: 'n_c2',
        position: { x: 760, y: 170 },
      },
    ],
    edges: [
      { source: 's1', target: 'c1', kind: 'contains' },
      { source: 's1', target: 'c2', kind: 'contains' },
    ],
  })
  check('AI 采纳：生成 2 条用例', adopted.cases.length === 2)
  const gid = adopted.cases[0].groupId
  check('AI 用例自动挂到场景分组', gid === 'n_sc', `groupId=${gid}`)
  check(
    'AI 采纳：画布新增 3 个节点 + 2 条连线',
    adopted.canvas.nodes.length === full.canvas.nodes.length + 3 &&
      adopted.canvas.edges.length === full.canvas.edges.length + 2,
  )

  const merged = await call('POST', '/api/ai/adopt', {
    suiteId: suite.id,
    canvasId: full.canvas.id,
    mode: 'update',
    targetCaseId: adopted.cases[0].id,
    items: [{ title: 'AI 用例一（规范化）', steps: [{ action: '步骤A' }, { action: '步骤B' }], expected: '可判定' }],
    edges: [],
  })
  check(
    'AI 采纳：规范化模式原地更新',
    merged.case.title === 'AI 用例一（规范化）' && merged.case.steps.length === 2,
  )

  const resCsv = await fetch(`${BASE}/api/suites/${suite.id}/export?format=csv`)
  const csv = await resCsv.text()
  check('导出 CSV', resCsv.ok && csv.includes('AI 用例二') && csv.includes('场景'))

  const resMd = await fetch(`${BASE}/api/suites/${suite.id}/export?format=md`)
  const md = await resMd.text()
  check('导出 Markdown', resMd.ok && md.includes('## AI 场景'))

  const importCsv = [
    '场景,标题,优先级,类型,前置条件,步骤,预期结果,标签,状态',
    '导入场景,导入用例甲,P0,功能,,"1. 打开页面\n2. 点击按钮",显示成功,"导入,冒烟",评审中',
    '导入场景,导入用例乙,P2,功能,,1. 输入内容,保存成功,导入,草稿',
    '导入场景,导入用例甲,P0,功能,,表内重复行应被跳过,,,草稿',
  ].join('\n')

  const dry = await call('POST', `/api/suites/${suite.id}/import`, { csv: importCsv, dryRun: true })
  check(
    '导入预览：2 条新增 + 1 条表内重复',
    dry.stats.created === 2 && dry.stats.skipped === 1,
    JSON.stringify(dry.stats),
  )

  const imported = await call('POST', `/api/suites/${suite.id}/import`, {
    csv: importCsv,
    mode: 'merge',
  })
  check('导入落库：新增 2 条', imported.stats.created === 2, JSON.stringify(imported.stats))
  check(
    '导入自动建场景节点并连线',
    imported.canvas.nodes.some((n) => n.type === 'scenario' && n.data.label === '导入场景') &&
      imported.canvas.edges.length > 0,
  )
  const importedCase = imported.cases.find((c) => c.title === '导入用例甲')
  check(
    '导入字段解析：步骤 / 标签 / 状态',
    importedCase.steps.length === 2 &&
      importedCase.tags.includes('冒烟') &&
      importedCase.status === 'reviewing',
    JSON.stringify(importedCase).slice(0, 140),
  )

  const again = await call('POST', `/api/suites/${suite.id}/import`, {
    csv: importCsv,
    mode: 'merge',
  })
  check(
    '重复导入按标题去重，只更新不新增',
    again.stats.created === 0 && again.stats.updated === 2,
    JSON.stringify(again.stats),
  )

  const replaced = await call('POST', `/api/suites/${suite.id}/import`, {
    csv: importCsv,
    mode: 'replace',
  })
  check(
    '覆盖导入：先清空再写入',
    replaced.cases.length === 2 && replaced.stats.removed === imported.cases.length,
    JSON.stringify(replaced.stats),
  )

  await call('POST', `/api/suites/${suite.id}/sync`, {
    cases: [{ ...created, title: '同步后的标题' }],
    nodes: [{ id: 'n_only', type: 'note', position: { x: 0, y: 0 }, data: { text: 'hi' } }],
    edges: [],
  })
  const synced = await call('GET', `/api/suites/${suite.id}/full`)
  check(
    '撤销用全量同步接口',
    synced.cases.length === 1 && synced.cases[0].title === '同步后的标题' && synced.canvas.nodes.length === 1,
  )

  const aiRes = await fetch(`${BASE}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability: 'requirement2case', input: { requirement: '登录' } }),
  })
  const sse = await aiRes.text()
  check('未配置 Key 时 AI 接口返回可读错误', sse.includes('API Key') || sse.includes('error'))

  await call('DELETE', `/api/projects/${project.id}`)

  console.log(`\n${failed === 0 ? '全部通过' : '有失败项'}：${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('\n冒烟测试中断：', err.message, '\n')
  process.exit(1)
})
