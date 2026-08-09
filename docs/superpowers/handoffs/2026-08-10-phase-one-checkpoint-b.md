# BerryPilot AI 阶段一 Checkpoint B 交接

> 日期：2026-08-10
>
> 范围：阶段一实施计划 Tasks 7–9（protocol vertical slice）
>
> 状态：Checkpoint B 已完成并通过测试与整体代码审查；已停止在 Task 9，等待人工确认后才进入 Checkpoint C

## 本阶段目标

在不开展 Agent UI、不进入 Task 10、不重构商城主体布局的前提下，完成 Mock Agent 的协议垂直切片：建立运行时可校验的事件契约、可取消且可断线恢复的确定性 Mock SSE transport，以及带恢复游标、持久化恢复和写操作确认门的 Pinia 状态机。

## 已完成内容

### Task 7：Agent 事件协议

- 定义 `AgentStage`、`AgentEvent`、`AgentRequest`、`AgentTransport`、`RecommendationGroup` 与不可变 `OperationConfirmation`。
- 使用显式类型守卫重建事件，不把任意 JSON 直接断言为 `AgentEvent`；非法事件返回非可恢复 `API_ERROR`。
- 实现无 Vue 依赖、无副作用的纯 reducer：严格事件序号、重复抑制、跳号恢复、消息增量、轨迹、推荐、确认替换与失效。
- 确认快照使用只读字段、冻结拷贝和逐字段比较，避免调用方引用变更或伪造 hash 绕过失效。
- 提交：
  - `8f9296b feat: define mock agent event protocol`
  - `904a213 fix: harden agent confirmation snapshots`

### Task 8：确定性 Mock SSE 与恢复

- 建立预算 500 元、宿舍使用、排除胶囊机、偏好静音的咖啡设备场景。
- 场景覆盖理解、搜索、比较、推荐、等待确认与传输完成；每个推荐包含证据、约束和不确定性。
- 内部使用标准 `id:`、`event:` 与多行 `data:` 帧；支持 UTF-8 分块缓冲、未终止帧丢弃和运行时事件校验。
- 支持 AbortSignal、计时器清理、模拟断线、`afterEventId` 无重放恢复，以及取消/断线竞态保护。
- 每个新会话生成唯一 operation scope；同一会话重试/恢复复用相同确认 ID 与幂等键。
- 提交：
  - `cd72206 feat: add resumable mock agent stream`
  - `de3319d fix: close mock stream cancellation races`

### Task 9：Agent store 状态机与确认门

- 新增 `useAgentStore()`，提供 `sendMessage(text)`、`cancel()`、`retry()`、`confirmOperation(id)`、`rejectOperation(id)` 与 `resetConversation()`。
- transport 通过工厂注入；`AbortController`、流所有权和运行中 promise 保留在闭包，不进入持久化状态。
- 支持单一活动流、增量消息、恢复游标、可恢复/不可恢复错误、取消、提前 EOF 恢复和终止事件收束。
- 将 transport 完成与工作流完成分离：存在待确认操作时保持 `WAIT_CONFIRMATION`，本地确认/拒绝后才收束工作流和 Trail。
- 只有 `confirmOperation` 能调用现有 `useCartStore().addcart()`；缺失、失效、拒绝、完成、重复、并发或容量溢出的确认均被阻止。
- 校验数量 1–99、分币精度、金额乘积和现有购物车容量，保证展示/哈希快照与实际执行一致。
- 新增持久化结构化 `operationAttempts`：记录 confirmation ID、幂等键、冻结快照与 `in_flight/completed/ambiguous/acknowledged` 状态。
- 页面刷新、reset 与写结果未知的交错均采用 fail-closed：未知写全局阻止 send/retry/confirm，避免第二次购物车变更。
- 提交：
  - `7806063 feat: add agent conversation state machine`
  - `de18e8b fix: harden agent store concurrency and hydration`
  - `913a5f3 fix: enforce checkpoint B integration invariants`
  - `b010eaf fix: persist unresolved agent operation safety`

## 关键设计决策及原因

- 协议 reducer 保持纯函数，transport 与 store 分层，便于第三阶段替换真实 SSE 服务而不改变 UI/store 消费契约。
- `operationScope` 属于持久化请求，同一会话恢复保持身份稳定，新会话避免确认 ID/幂等键碰撞。
- `stream.completed` 只表示传输结束；有待确认操作时工作流仍为 `WAIT_CONFIRMATION`，避免把“等待用户批准”误写成任务完成。
- 现有 `addcart(goods)` 不支持端到端幂等键，因此对结果未知的写操作采用保守阻断，不自动重试。
- 操作尝试记录独立于会话展示状态持久化；reset 不会擦除尚未落定的安全事实。
- 确认金额使用分币精度验证，数量与购物车 99 件上限在执行前校验，避免 store 静默截断导致确认内容与实际写入不同。

## 创建和修改的文件

新增：

- `src/features/agent/types.ts`
- `src/features/agent/protocol.ts`
- `src/features/agent/api.ts`
- `src/features/agent/mock/scenarios.ts`
- `src/features/agent/mock/stream.ts`
- `src/features/agent/store.ts`
- `tests/unit/agent/protocol.spec.ts`
- `tests/unit/agent/mock-stream.spec.ts`
- `tests/unit/agent/store.spec.ts`

未创建或修改任何 Agent 组件、视图、样式、导航或商城布局文件。

## 数据库/API/事件协议变化

- 无数据库、真实后端、真实模型、RAG 或真实 SSE API 变化。
- `AgentTransport.stream(request, { afterEventId, signal })` 返回 `AsyncIterable<AgentEvent>`。
- `AgentRequest` 包含消息与持久化 `operationScope`，用于稳定恢复和隔离不同会话的操作身份。
- 事件序号严格递增；重复/旧事件忽略，跳号触发从最后接受序号恢复。
- 确认快照包含目标操作、商品/SKU、规格、数量、单价、总价、payload hash 与幂等键。
- 持久化状态新增结构化 operation attempt 记录；旧字符串请求和旧幂等键数组在 hydration 时保守迁移。

## 验证命令与结果

在提交 `b010eaf` 后新鲜运行：

| 命令 | 实际结果 |
| --- | --- |
| `npm.cmd run verify` | PASS，退出码 0 |
| `npm.cmd run typecheck`（由 verify 调用） | PASS |
| `npm.cmd run lint:check`（由 verify 调用） | PASS，0 warnings / 0 errors，77 files |
| `npm.cmd run test:unit`（由 verify 调用） | PASS，11 files / 106 tests |
| `npm.cmd run build`（由 verify 调用） | PASS，1629 modules transformed |
| `git diff --check` | PASS，无输出 |
| Checkpoint B 整体代码审查 | PASS，Critical / Important / Minor 均为 0 |
| PayIndex 保护哈希 | `E2AEDE0D2756CA08F75F06B3191711722EBC00113CA0121AF20446A537DA0F85` |

构建仍报告 `src/views/checkout/CheckOutIndex.vue:206` 的 Sass `lighten()` 弃用警告；它来自 Checkpoint A 已知的冻结结算页面，未为清除警告开展布局或样式重构。

## 性能或评测数据

本检查点未采集 Lighthouse 或浏览器性能基线；该工作属于 Task 16。当前可复现数据为 11 个单元测试文件、106 项测试全部通过，以及生产构建转换 1629 个模块。

## 当前 Git 状态

- 分支：`master`。
- Checkpoint B 源码完成提交为 `b010eaf`；本交接文档使用独立文档提交。
- `src/views/pay/PayIndex.vue` 仍是用户拥有的未提交修改，未编辑、未格式化、未暂存、未提交。
- `docs/superpowers/plans/2026-08-09-berrypilot-ai-phase-one.md` 仍为未跟踪的用户计划文档，未暂存、未提交。
- Checkpoint B 未包含 Task 10 或任何 Agent UI 文件。

## 未完成内容与已知问题

- `/agent` 仍保持 Checkpoint A 的占位路由行为；工作台 UI 从 Task 10 开始，本检查点未进入。
- 现有购物车 API 不接收幂等键；结果未知的写操作只能 fail-closed，不能安全自动重试。
- 完整 E2E、浏览器视口/可访问性、截图、性能基线和 README 交付分别属于 Tasks 10–16。
- 构建存在上述既有 Sass 弃用警告。
- 未实现真实 Agent、真实 SSE、业务后端、RAG 或真实支付。

## 下一阶段第一步

收到人工确认后进入 Checkpoint C，从 Task 10 开始：先按测试先行建立 Agent design tokens 与响应式 workspace shell。不得跳过确认直接进入 Task 10。

## 新对话启动提示词

```text
请完整阅读阶段一主设计、阶段一实施计划、Checkpoint A 交接和 docs/superpowers/handoffs/2026-08-10-phase-one-checkpoint-b.md，并检查 Git 状态、最近提交及 Tasks 7–9 源码/测试。Checkpoint B 已完成且通过 106 项单元测试、typecheck、lint、构建和整体代码审查。确认后严格执行 Checkpoint C Tasks 10–14；继续保护 src/views/pay/PayIndex.vue，不编辑、不格式化、不暂存、不提交；继续不暂存或提交未跟踪的阶段一计划文档；不重构商城主体布局。
```
