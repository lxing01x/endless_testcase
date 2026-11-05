import type {
  AiConfig,
  CanvasState,
  CaseRecord,
  ImportPreviewRow,
  ImportStats,
  Project,
  Suite,
} from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const json = await res.json().catch(() => ({ ok: false, error: '响应不是合法 JSON' }))
  if (!json.ok) throw new Error(json.error || `请求失败（${res.status}）`)
  return json.data as T
}

export const api = {
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, description = '') =>
    request<{ project: Project; suite: Suite }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  getProject: (id: string) => request<{ project: Project; suites: Suite[] }>(`/api/projects/${id}`),

  createSuite: (projectId: string, name: string) =>
    request<Suite>('/api/suites', { method: 'POST', body: JSON.stringify({ projectId, name }) }),
  deleteSuite: (id: string) => request(`/api/suites/${id}`, { method: 'DELETE' }),
  getSuiteFull: (id: string) =>
    request<{ suite: Suite; cases: CaseRecord[]; canvas: CanvasState }>(`/api/suites/${id}/full`),

  createCase: (payload: Partial<CaseRecord> & { suiteId: string }) =>
    request<CaseRecord>('/api/cases', { method: 'POST', body: JSON.stringify(payload) }),
  updateCase: (id: string, patch: Partial<CaseRecord>) =>
    request<CaseRecord>(`/api/cases/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  batchCases: (payload: {
    creates?: Partial<CaseRecord>[]
    updates?: (Partial<CaseRecord> & { id: string })[]
    deletes?: string[]
  }) => request('/api/cases/batch', { method: 'POST', body: JSON.stringify(payload) }),

  saveCanvas: (id: string, payload: Partial<CanvasState>) =>
    request<CanvasState>(`/api/canvases/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  syncSuite: (id: string, payload: { cases: CaseRecord[]; nodes: any[]; edges: any[] }) =>
    request(`/api/suites/${id}/sync`, { method: 'POST', body: JSON.stringify(payload) }),

  importCsv: (
    suiteId: string,
    payload: { csv: string; mode?: 'merge' | 'replace'; dryRun?: boolean },
  ) =>
    request<{
      stats: ImportStats
      preview: ImportPreviewRow[]
      hasHeader: boolean
      cases?: CaseRecord[]
      canvas?: CanvasState
    }>(`/api/suites/${suiteId}/import`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAiSettings: () => request<AiConfig>('/api/settings/ai'),
  saveAiSettings: (payload: {
    baseUrl?: string
    model?: string
    temperature?: number
    apiKey?: string | null
  }) => request<AiConfig>('/api/settings/ai', { method: 'PUT', body: JSON.stringify(payload) }),
  testAi: () =>
    request<{ ok: boolean; latencyMs: number; model: string; reply: string }>(
      '/api/settings/ai/test',
      { method: 'POST' },
    ),

  adoptPatch: (payload: {
    suiteId: string
    canvasId: string
    mode: 'create' | 'update'
    targetCaseId?: string
    items: any[]
    edges: any[]
  }) =>
    request<{ cases?: CaseRecord[]; case?: CaseRecord; canvas: CanvasState; createdCaseIds?: string[] }>(
      '/api/ai/adopt',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  onDone: (payload: any) => void
  onError: (message: string, raw?: string) => void
}

export async function streamAi(
  capability: string,
  input: Record<string, any>,
  handlers: StreamHandlers,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability, input }),
    signal,
  })
  if (!res.ok || !res.body) {
    handlers.onError(`请求失败（${res.status}）`)
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      let evt: any
      try {
        evt = JSON.parse(raw)
      } catch {
        continue
      }
      if (evt.type === 'delta') handlers.onDelta(evt.text)
      else if (evt.type === 'done') {
        finished = true
        handlers.onDone(evt)
      } else if (evt.type === 'error') {
        finished = true
        handlers.onError(evt.message, evt.raw)
      }
    }
  }
  if (!finished) handlers.onError('连接中断，未收到完整结果')
}
