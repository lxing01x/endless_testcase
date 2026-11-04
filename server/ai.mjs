import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR, getDb, persist, uid } from './db.mjs'

const SECRET_FILE = path.join(DATA_DIR, '.secret')
function secret() {
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
  }
  return Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex')
}

export function encryptKey(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secret(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`
}

export function decryptKey(payload) {
  if (!payload) return null
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.3,
}

export function publicAiSettings() {
  const s = getDb().settings.ai
  return {
    baseUrl: s.baseUrl || DEFAULTS.baseUrl,
    model: s.model || DEFAULTS.model,
    temperature: s.temperature ?? DEFAULTS.temperature,
    configured: Boolean(decryptKey(s.keyCipher)),
    keyHint: decryptKey(s.keyCipher) ? '••••••' + (decryptKey(s.keyCipher) || '').slice(-4) : null,
    updatedAt: s.updatedAt || null,
  }
}

export function saveAiSettings({ baseUrl, model, temperature, apiKey }) {
  const db = getDb()
  const ai = db.settings.ai
  if (typeof baseUrl === 'string' && baseUrl.trim()) ai.baseUrl = baseUrl.trim().replace(/\/+$/, '')
  if (typeof model === 'string' && model.trim()) ai.model = model.trim()
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    ai.temperature = Math.min(2, Math.max(0, temperature))
  }
  if (typeof apiKey === 'string' && apiKey.trim()) ai.keyCipher = encryptKey(apiKey.trim())
  if (apiKey === null || apiKey === '') ai.keyCipher = null
  ai.updatedAt = new Date().toISOString()
  persist(true)
  return publicAiSettings()
}

function endpoint(baseUrl) {
  const base = (baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(base)) return base
  return `${base}/chat/completions`
}

export async function testConnection() {
  const ai = getDb().settings.ai
  const key = decryptKey(ai.keyCipher)
  if (!key) throw new Error('尚未配置 API Key')
  const started = Date.now()
  const res = await fetch(endpoint(ai.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: ai.model || DEFAULTS.model,
      messages: [{ role: 'user', content: '回复两个字：可用' }],
      max_tokens: 12,
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} · ${text.slice(0, 300)}`)
  let content = ''
  try {
    content = JSON.parse(text)?.choices?.[0]?.message?.content ?? ''
  } catch {
    content = text.slice(0, 100)
  }
  return { ok: true, latencyMs: Date.now() - started, model: ai.model, reply: content.trim() }
}

const SYSTEM = `你是资深测试架构师，服务于一个"无限画布 + 结构化用例"的测试用例设计工具。
你产出的内容会被解析成 JSON 并直接画到画布上，因此必须严格遵守格式。

只输出 JSON 对象，不要任何解释文字，不要 markdown 代码块。

JSON 结构：
{
  "nodes": [
    {
      "tmpId": "n1",
      "type": "scenario",
      "title": "场景名称",
      "parentTmpId": null
    },
    {
      "tmpId": "n2",
      "type": "case",
      "title": "用例标题",
      "parentTmpId": "n1",
      "priority": "P0",
      "preconditions": "前置条件",
      "steps": [{ "action": "具体操作，动词开头", "data": "测试数据，可为空" }],
      "expected": "可判定的预期结果",
      "tags": ["标签"]
    }
  ],
  "edges": [{ "source": "n1", "target": "n2", "kind": "contains" }],
  "summary": "一句话说明本次覆盖了什么、还缺什么"
}

规则：
1. type=scenario 是场景分组，只有 title，不写步骤；type=case 必须完整填写 steps（1-6 步）与 expected。
2. 一条用例只验证一个判断点。标题要具体，禁止"正常流程""异常测试"这类空泛表述。
3. 每个 case 的 parentTmpId 必须指向某个 scenario 的 tmpId；每个 case 都要有一条从该 scenario 指向它的 edge。
4. 优先覆盖：主流程、分支、边界值、异常与失败回滚；涉及权限/并发时补充对应用例。
5. 步骤里的预期写在 expected，不要写进步骤。
6. 不要编造需求中没有的业务规则；不确定的地方写进 summary。
7. 语言：简体中文，术语与用户需求保持一致。`

const CAPS = {
  requirement2case: '需求转用例',
  diverge: '场景发散',
  normalize: '步骤规范化',
}

function buildMessages(capability, input = {}) {
  const parts = []
  if (input.requirement) parts.push(`【需求】\n${String(input.requirement).slice(0, 4000)}`)
  if (input.scenario) parts.push(`【所属场景】${input.scenario}`)
  if (input.caseTitle) parts.push(`【当前用例】${input.caseTitle}`)
  if (input.detail) parts.push(`【当前用例内容】\n${String(input.detail).slice(0, 2500)}`)
  if (input.siblingTitles?.length) {
    parts.push(`【同场景已有用例（请勿重复，可作为补漏参照）】\n${input.siblingTitles.slice(0, 40).map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
  }
  if (input.existingTitles?.length) {
    parts.push(`【本用例集已有用例标题（去重用）】\n${input.existingTitles.slice(0, 120).map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
  }
  if (input.glossary) parts.push(`【业务术语】\n${String(input.glossary).slice(0, 800)}`)
  if (input.instruction) parts.push(`【补充要求】\n${String(input.instruction).slice(0, 1200)}`)

  if (capability === 'requirement2case') {
    parts.unshift('任务：把下面的需求拆解成「场景 → 用例」两级结构，输出 6-12 条可执行用例。')
  } else if (capability === 'diverge') {
    parts.unshift('任务：围绕当前用例所在场景做覆盖补漏，只输出 5-8 条【当前列表中不存在】的新用例，重点是边界、异常、权限、并发、幂等。不要重复已有用例。')
  } else if (capability === 'normalize') {
    parts.unshift('任务：把当前用例改写成规范化表达。只输出 nodes 中一条 type=case 的用例（parentTmpId 置为 null），edges 输出空数组，steps 拆成可执行的具体操作，expected 必须可判定。')
  } else {
    parts.unshift('任务：围绕给定上下文补充测试用例。')
  }

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: parts.join('\n\n') + '\n\n请只输出 JSON。' },
  ]
}

function extractJson(text) {
  let t = String(text || '').trim()
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t)
}

export async function* generate(capability, input) {
  const db = getDb()
  const ai = db.settings.ai
  const key = decryptKey(ai.keyCipher)
  if (!key) {
    yield { type: 'error', message: '未配置 DeepSeek API Key，请先在设置中填写。' }
    return
  }
  if (!CAPS[capability]) {
    yield { type: 'error', message: `未知的 AI 能力：${capability}` }
    return
  }

  const messages = buildMessages(capability, input)
  const model = ai.model || DEFAULTS.model
  const body = {
    model,
    messages,
    temperature: typeof input?.temperature === 'number' ? input.temperature : ai.temperature ?? DEFAULTS.temperature,
    max_tokens: 4096,
    stream: true,
    stream_options: { include_usage: true },
  }
  if (!/reasoner/.test(model)) body.response_format = { type: 'json_object' }

  const started = Date.now()
  let res
  try {
    res = await fetch(endpoint(ai.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err) {
    yield { type: 'error', message: `请求失败：${err.message}` }
    return
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    yield { type: 'error', message: `DeepSeek 返回 ${res.status}：${text.slice(0, 400)}` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let usage = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let json
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      if (json.usage) usage = json.usage
      const delta = json.choices?.[0]?.delta
      const piece = delta?.content
      if (piece) {
        full += piece
        yield { type: 'delta', text: piece }
      }
    }
  }

  let patch = null
  let parseError = null
  try {
    patch = extractJson(full)
  } catch (err) {
    parseError = err.message
  }

  db.aiUsage.push({
    id: uid('u_'),
    projectId: input?.projectId || null,
    capability,
    model,
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    latencyMs: Date.now() - started,
    adopted: false,
    createdAt: new Date().toISOString(),
  })
  if (db.aiUsage.length > 500) db.aiUsage = db.aiUsage.slice(-300)
  persist()

  if (!patch) {
    yield { type: 'error', message: `模型输出无法解析为 JSON（${parseError}），原始内容已保留在面板中。`, raw: full }
    return
  }
  yield { type: 'done', patch, raw: full, usage, latencyMs: Date.now() - started }
}
