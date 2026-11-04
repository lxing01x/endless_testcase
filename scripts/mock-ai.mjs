import http from 'node:http'

const PATCH = {
  nodes: [
    { tmpId: 's1', type: 'scenario', title: '并发与幂等' },
    {
      tmpId: 'c1',
      type: 'case',
      parentTmpId: 's1',
      title: '同一张券并发核销仅一笔成功',
      priority: 'P0',
      preconditions: '用户持有满100减20券一张，两个端同时结算',
      steps: [
        { action: '在 Web 端点击提交订单', data: '' },
        { action: '在同一秒内从 App 端再次提交', data: '' },
      ],
      expected: '仅一笔订单核销成功，另一笔提示「优惠券已被使用」',
      tags: ['并发', '优惠券'],
    },
    {
      tmpId: 'c2',
      type: 'case',
      parentTmpId: 's1',
      title: '重复提交同一订单不重复核销',
      priority: 'P1',
      preconditions: '网络抖动导致客户端自动重试',
      steps: [{ action: '连续提交相同订单号 3 次', data: 'orderNo=SO20241103' }],
      expected: '服务端按幂等键去重，仅核销一次',
      tags: ['幂等'],
    },
    {
      tmpId: 'c3',
      type: 'case',
      parentTmpId: 's1',
      title: '跨时区用户券过期时间按服务端时区计算',
      priority: 'P2',
      preconditions: '用户设备时区为 UTC-8，服务端为 UTC+8',
      steps: [{ action: '在本地时间 23:30 提交订单', data: '' }],
      expected: '以服务端时间为准判断有效期，不因时区差异提前失效',
      tags: ['时效', '时区'],
    },
  ],
  edges: [
    { source: 's1', target: 'c1', kind: 'contains' },
    { source: 's1', target: 'c2', kind: 'contains' },
    { source: 's1', target: 'c3', kind: 'contains' },
  ],
  summary: '补充了并发核销、重复提交与跨时区过期三类场景，未覆盖券回滚补偿。',
}

const text = JSON.stringify(PATCH)

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (!req.url.includes('/chat/completions')) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const step = Math.ceil(text.length / 8)
    let i = 0
    const timer = setInterval(() => {
      if (i >= text.length) {
        clearInterval(timer)
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 820, completion_tokens: 360 } })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      const chunk = text.slice(i, i + step)
      i += step
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
    }, 60)
  })
})

server.listen(8899, '127.0.0.1', () => console.log('mock deepseek on 8899'))
