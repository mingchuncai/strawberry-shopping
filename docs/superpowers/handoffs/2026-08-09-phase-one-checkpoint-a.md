# BerryPilot AI 阶段一 Checkpoint A 交接

> 日期：2026-08-09
>
> 范围：阶段一实施计划 Tasks 1–6（stable commerce baseline）
>
> 状态：等待人工确认；未进入 Checkpoint B，未开展 Agent UI 工作

## 1. 本检查点目标

在不重构原商城主体布局、不接触用户自有支付草稿的前提下，建立可重复运行的前端质量基线，修复认证/购物车关键缺陷，引入必要的 TypeScript 边界与懒加载路由，并完成 BerryPilot AI 必需的公开品牌迁移。

## 2. 已完成工作

### Task 1：质量基线

- 增加 TypeScript、Vue TSC、Vitest、Vue Test Utils、Happy DOM、MSW 与 Playwright。
- 增加 `typecheck`、`lint:check`、`test:unit`、`test:e2e`、`verify` 脚本。
- 配置桌面 Chrome 与 Mobile Chrome 测试项目、覆盖率起始阈值和单元测试环境。
- 关闭构建插件在仓库根目录自动生成声明文件的行为。
- 提交：`92151cc test: establish frontend quality baseline`

### Task 2：关键流程修复

- 登录失败现在保持 rejected 状态，不再被 store 吞掉。
- 登录成功后的购物车合并失败与认证失败分离；用户登录态和本地购物车保留以便重试。
- 修复游客重复 SKU 数量、空购物车全选、缺失 SKU 删除、认证态数量/选中/删除持久化。
- 删除操作只在 Popconfirm 确认后发生。
- HTTP 网络错误与 401 安全归一化，401 保留完整回跳路径。
- 用测试锁定 SKU 禁用、选择、取消和完整选择事件。
- 提交：`5e551e2 fix: stabilize auth and cart flows`

### Task 3：类型化领域与 HTTP 边界

- 增加 `ApiResponse<T>`、`AppError`、`UserSession`、`CartItem`、`ProductDetail`、`SkuSelection` 与 `CheckoutPreview`。
- 新增类型化 Axios 边界，支持 `VITE_API_BASE_URL`，开发环境显式回退到现有教学 API。
- 将用户、购物车、详情、结算与支付 API 迁移到 `src/api/*.ts`。
- 未增加教学 API 不支持的 refresh-token 行为。
- 因 `src/views/pay/PayIndex.vue` 禁止修改，保留 `src/apis/pay.js` 作为只读兼容转发层。
- 提交：`1fca3e9 refactor: add typed commerce boundaries`

### Task 4：认证与购物车 Store TypeScript 化

- 最终导出为 `useUserStore()` 与 `useCartStore()`，删除旧 store 模块和旧导出。
- 使用 `UserSession | null`、`CartItem[]`、显式参数和 1–99 数量边界。
- 增加旧持久化数据迁移，过滤无效会话、越界/畸形购物车项；密码与错误对象不进入持久化白名单。
- 更新直接使用方，不进行无关目录整理。
- 提交：`7fa40af refactor: type auth and cart state`

### Task 5：懒加载路由、守卫与支付回调

- 路由迁移到 TypeScript，页面组件均使用动态导入。
- 新增稳定路由名、`requiresAuth` 守卫和经过校验的登录回跳。
- `/paycallback` 公开展示 `success`、`pending`、`failure`；未知状态回退到“支付结果待确认”，不声称真实资金交易完成。
- `/agent` 仅建立公开命名路由边界；为遵守本检查点“不开展 Agent UI”，当前临时重定向到首页。
- 提交：`3443776 feat: add guarded lazy routes and payment callback`

### Task 6：课程痕迹与必要品牌迁移

- 替换页面标题、描述、公开文案、Logo 和 Favicon 为 BerryPilot AI。
- 新增原创 `berrypilot-mark.svg` 与 `favicon.svg`，停止公开引用旧课程 Logo/Favicon。
- 移除 `test scss`、首页课程占位块、默认密码和公开入口调试日志。
- 建立素材来源/授权/风险/阶段/动作清单；保留素材没有被标注为 BerryPilot 原创。
- 商城首页既有核心区块、分类、详情、购物车、结算主体布局均未重构。
- 提交：`cb2094c feat: migrate public brand surfaces`

## 3. 关键接口与行为

- `useUserStore()`：`getuserinfo`、`clearuserinfo`，状态含 `userInfo`、`authError`、`cartSyncError`。
- `useCartStore()`：`addcart`、`delcart`、`setSelected`、`setCount`、`updatenewlist`、`clearcart` 及金额/选择派生状态。
- `normalizeAppError(cause)`：稳定错误码 `NETWORK_ERROR | UNAUTHORIZED | TIMEOUT | API_ERROR | UNKNOWN`。
- 路由名：`home`、`login`、`cart`、`checkout`、`pay`、`pay-callback`、`agent`。
- 支付回调查询：`result=success|pending|failure`；其他值按 pending 处理。

## 4. 验证证据

在提交 `cb2094c` 后重新运行：

| 命令 | 实际结果 |
| --- | --- |
| `npm.cmd run verify` | PASS，退出码 0 |
| `npm.cmd run typecheck`（由 verify 调用） | PASS |
| `npm.cmd run lint:check`（由 verify 调用） | PASS，0 warnings / 0 errors |
| `npm.cmd run test:unit`（由 verify 调用） | PASS，8 files / 23 tests |
| `npm.cmd run build`（由 verify 调用） | PASS，1629 modules transformed |
| `npm.cmd run test:e2e -- --list` | PASS，桌面与移动端共发现 2 个 smoke tests |
| `git diff --check` | PASS，无输出 |
| PayIndex 保护哈希 | 前后均为 `4AB6191EE061CB7E90473F538C2CEA3764C0E4263F07AD6BA3C69AD77C2A8138` |

构建仍会报告 `src/views/checkout/CheckOutIndex.vue:206` 的 Sass `lighten()` 弃用警告；它不影响构建成功，且本检查点没有为清警告重构冻结的结算布局。

## 5. Git 状态与保护文件

- 分支：`master`。
- Checkpoint A 完成时相对 `origin/master` 领先 9 个提交，其中本检查点新增 6 个提交，之前已有 3 个设计文档提交。
- `src/views/pay/PayIndex.vue` 仍为用户拥有的未提交修改：未覆盖、未格式化、未暂存、未提交。
- `docs/superpowers/plans/2026-08-09-berrypilot-ai-phase-one.md` 仍是用户提供的未跟踪计划文件，没有纳入任何任务提交。
- 本交接文档提交后，预期工作区只保留上述两个状态项。

## 6. 已知限制与待确认事项

- Playwright 在 Checkpoint A 只完成测试发现；完整浏览器执行、稳定 API fixtures 与业务 E2E 属于 Task 15。
- 首页/商品数据仍依赖外部教学 API，后端、真实 Agent、RAG、SSE 服务端与真实支付均不在本检查点范围。
- `/agent` 当前是公开路由占位边界并重定向首页，不包含任何 Agent UI。
- 旧登录背景、二维码、Banner 与商品图授权状态仍需按素材清单后续处理。
- PayIndex 现有用户草稿及其中潜在运行时问题不在本检查点修改范围。

## 7. Checkpoint B 首步

收到人工确认后才执行 Tasks 7–9：

1. 定义 Agent 协议与安全确认类型；
2. 建立可恢复、可取消、可模拟断线的 Mock SSE transport；
3. 建立 Agent store 状态机、恢复游标和幂等确认门；
4. Checkpoint B 仍不开始视觉组件，Agent UI 从 Task 10 才开始。

## 8. 新会话继续提示

```text
请先阅读阶段一主设计、阶段一实施计划和 docs/superpowers/handoffs/2026-08-09-phase-one-checkpoint-a.md，检查 Git 状态与最近提交。Checkpoint A 已完成且等待确认。确认后严格执行 Checkpoint B Tasks 7–9，不开展 Agent UI；继续保护 src/views/pay/PayIndex.vue，不覆盖、不格式化、不暂存。
```
