# endless_testcase

> 用无限画布「想」用例，用结构化表格「管」用例。

一个单机运行的测试用例编写平台：画布负责发散与推演，表格负责规范与交付，两者共用同一份数据。AI（DeepSeek）作为画布上的协作画师，产出以「虚线幽灵节点」的形式出现，确认才落库。

## 特性

**画布（主入口）**
- 无限画布，节点编排 + 便签自由区（React Flow 12）
- 四类节点：需求、场景、用例、便签；双击空白处就地新建用例
- 连线表达依赖关系，自动布局（dagre 分层），小地图，多选，缩放
- 1000+ 节点可用：分层渲染与视口裁剪

**表格**
- 行内编辑（标题/优先级/类型/预期/状态）、场景归属下拉、优先级筛选
- 批量新建、删除，搜索（标题/标签/预期）
- 导出 CSV（Excel 可直接打开）、Markdown

**双视图同源**
- 画布拖动 = 改布局；表格改标题 = 节点标题同步变化
- 画布与表格共用一个撤销栈，`⌘Z` 在任何视图都有效
- 删除场景不会删用例，只解除分组

**AI（MVP 仅 DeepSeek）**
- 三种能力：需求转用例、场景发散补漏、步骤规范化
- SSE 流式输出，结果先以幽灵节点铺在画布右侧，可逐条勾选采纳
- 采纳后作为一个整体可撤销；未配置 Key 时给明确引导
- Key 使用 AES-256-GCM 加密存于本机，永不下发浏览器

## 视觉与主题

界面按「深空实验室」设计：近黑深空底 + 四角缓慢漂移的极光 + 玻璃面板 + 霓虹节点。**默认深色**，右上角太阳/月亮按钮切到浅色「雾光」模式，选择记在 `localStorage`，刷新后保持。

- **极光只做环境**：紫/青/品红三色只出现在背景与浮层，正文压在实色表面上
- **发光只标状态**：选中节点有呼吸光环，P0 粉红 / P1 琥珀 / P2 蓝 的色晕直接映射优先级
- **玻璃只给浮层**：侧栏、顶栏、检查器、AI 抽屉、弹窗用 `backdrop-filter`；用例节点用实色，保证长时间阅读不累
- **字体分工**：无衬线做界面，等宽只标真实数据（`#01`、`3 步`、`56%`、快捷键），需求原文用宋体，便签用楷体
- **画布是带星尘的方格图纸**：16px 细网格 + 80px 主网格，网格退到 3%–6% 白

设计令牌集中在 `src/styles.css` 顶部的 `:root`（浅色）与 `[data-theme='dark']`（深色）两段，改配色只动变量。注意实心按钮用 `--grad-fill`（压暗渐变）而非装饰用的 `--grad`，后者尾部青色配白字对比度不足。设计上下文（受众、气质、反参考、原则）在 [`.impeccable.md`](.impeccable.md)。

## 快速开始

需要 Node.js 20.11 或以上（服务端用到 `import.meta.dirname`）。

```bash
git clone <this-repo> endless_testcase
cd endless_testcase
npm install
npm run dev          # 前端 http://localhost:5173，API http://127.0.0.1:8787
```

首次启动会自动生成一个示例项目「支付中心 / 优惠券迭代 v2.4」（5 条用例、2 个场景、1 段需求、1 张便签），可直接上手。

生产模式：

```bash
npm run build        # 类型检查 + 打包到 dist/
npm start            # API 同时托管 dist，访问 http://127.0.0.1:8787
```

### 配置 AI

左侧「AI 配置」→ 填入 DeepSeek API Key（`https://api.deepseek.com`，模型 `deepseek-chat`）→「保存并测试」。

不配置也能用全部画布与表格功能，AI 是增强而非依赖。

## 快捷键

| 键 | 行为 |
|---|---|
| `N` / `S` / `R` / `B` | 新建用例 / 场景 / 需求 / 便签 |
| `Tab` | 为选中节点新建子节点并连线 |
| 双击空白 | 就地新建用例 |
| `L` | 自动布局（场景流） |
| `⌘K` | 唤起 AI 助手 |
| `⌘↵` | 在 AI 面板中触发生成 |
| `⌘Z` / `⇧⌘Z` | 撤销 / 重做（跨视图） |
| `Delete` | 删除选中节点 |
| `⌘/` | 快捷键面板 |
| `Esc` | 关闭面板 / 取消选中 |

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 |
| 画布 | @xyflow/react 12（自定义节点 / 边 / 小地图） |
| 状态 | Zustand（单一 store + 快照式撤销栈） |
| 布局 | @dagrejs/dagre |
| 后端 | Fastify 5（ESM，无需构建） |
| 存储 | JSON 文件 `data/db.json`（原子写入，250ms 防抖） |
| AI | DeepSeek（OpenAI 兼容协议），SSE 转发 |

### 目录

```
server/
  index.mjs       路由 + SSE + 导入导出
  db.mjs          存储、初始化与示例数据
  ai.mjs          密钥加解密、prompt、流式调用、JSON 解析
src/
  components/     CanvasView / TableView / Inspector / AiDrawer / Sidebar …
  lib/theme.ts    主题读写与持久化
  store.ts        单一数据源、跨视图同步、撤销、自动布局
  api.ts          REST + SSE 客户端
  types.ts
  styles.css      设计令牌 + 全部样式（双主题）
scripts/
  smoke.mjs       API 冒烟测试（node scripts/smoke.mjs）
  mock-ai.mjs     本地模拟 DeepSeek，便于无 Key 调试 AI 流程
docs/设计方案.md   产品与架构设计文档
.impeccable.md    视觉设计上下文与原则
```

### 数据与备份

所有数据在 `data/db.json`，复制即备份；删除后重启会重新生成示例数据。
`data/.secret` 是本机加密密钥，**丢失后已保存的 API Key 无法解密**，重新填写即可。

## API

```
GET    /api/projects
GET    /api/projects/:id
POST   /api/suites                      GET /api/suites/:id/full
POST   /api/cases                       PATCH /api/cases/:id
POST   /api/cases/batch                 （批量创建/更新/删除）
PUT    /api/canvases/:id                （布局与连线）
POST   /api/suites/:id/sync             （撤销时整体回放）
GET    /api/suites/:id/export?format=md|csv
GET/PUT /api/settings/ai                POST /api/settings/ai/test
POST   /api/ai/generate                 （SSE）
POST   /api/ai/adopt                    （create / update）
```

## 当前边界

- 单机单用户，无鉴权与多租户；多人协同需要引入 CRDT（P2）
- 只写用例，不执行用例（执行与结果回填在路线图上）
- 导入仅支持 CSV 导出后的回填；Excel/XMind 导入待做
- AI 仅适配 DeepSeek，多模型抽象层留到后续

更完整的取舍与路线见 [`docs/设计方案.md`](docs/设计方案.md)。
