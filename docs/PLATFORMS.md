# 平台接入分析

调研日期：2026-10-17。下文的“源码确认”表示已阅读所列固定版本实现，不表示已经使用本插件或真实账号请求成功。“官方文档确认”只覆盖该文档描述的能力；内部接口和其他平台 OAuth client id 不能因此被称为官方第三方 API。

## 摘要

四个平台没有统一的订阅 API。授权成功、拿到模型目录、具备推理权限和读取订阅账单是四项独立能力。通用页面可复用，平台凭据和 wire protocol 必须分离；到期时间不能统一从 JWT 的 `exp` 获取。

## 目录

- [能力概览](#能力概览)
- [Codex](#codex)
- [GitHub Copilot](#github-copilot)
- [Grok（X Premium）](#grokx-premium)
- [Cursor](#cursor)
- [参考代码取舍](#参考代码取舍)
- [证据与待验证范围](#证据与待验证范围)

## 能力概览

| 平台 | 授权与调用方式 | 用量线索 | 日期可用性 | 接入结论 |
| --- | --- | --- | --- | --- |
| Codex / ChatGPT | 默认 Codex OAuth + Codex Responses；可切换公共 API | 默认读取账号额度；公共 API 模式提供 ChatGPT 用量页链接 | token expiry 与额度 reset 分开 | 两条协议离线测试通过，待真实账号验收 |
| Cursor | 浏览器 PKCE 配对 + polling；Connect/protobuf AgentService | Cursor dashboard summary | billing cycle end；token expiry 另列 | 第二个平台；专用协议实现，待真实账号验收 |
| GitHub Copilot | GitHub device flow → Copilot token；Chat / Responses 按目录选择 | 直接读取内部 quota 接口 | token expiry 和 quota reset；个人订阅结束未确认 | 第三个平台；内部接口可访问性待账号验证 |
| Grok / X Premium | xAI device flow；Responses | Grok CLI billing | 周期结束/reset；订阅终止未确认 | 第四个平台；X 网页登录不等于 OAuth token 已有推理权益 |

没有任何一行保证所有套餐都有可读取的订阅到期日。字段缺失按技术设计显示，不能为了凑齐需求创建手工到期时间输入或爬取账单页面。

## Codex

### 默认 Codex 链路

`codexAuthMode: codex` 使用固定 OAuth client `app_EMoamEEZ73f0CkXaXp7hrann`，authorize 为 `https://auth.openai.com/oauth/authorize`，token / refresh 为 `https://auth.openai.com/oauth/token`。回调使用 `localhost:1455/auth/callback`，占用时尝试 1457；不会结束其他端口占用者。

ID token 签名、issuer、audience、有效期和 nonce 均校验后才读取账号。access token 中的 ChatGPT account id 必须匹配已验证身份；刷新保留账号和 generation。模型从 `/backend-api/codex/models?client_version=...` 实时发现，推理由已安装 pi-ai 的 Codex Responses SDK 处理，固定 SSE 且禁止重发。请求携带账号 id 和 DSH attribution。

用量读取 `https://chatgpt.com/backend-api/wham/usage`，按真实窗口时长区分五小时、每周和其他额度，支持绝对及相对重置时间。平台的 `used_percent` 是已用额度，页面显示 `100 - used_percent` 可用额度，重置时间不变。有效 0 与缺失数据分开；HTTP 拒绝和响应变化显示错误，保留上一份快照。没有来源时不生成付费订阅结束日期。

官方仍提供 Codex 订阅登录及 [App Server 额度查询](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt)。截至 2026-10-17 未查到这条 HTTP 链路的明确停用日期，也未查到面向第三方的长期地址兼容保证；不能将 SDK 的 legacy 分类当作官方停用公告。

### 保留的 Sign in with ChatGPT 链路

授权流程参考 [pi 的 openai-chatgpt 实现](https://github.com/earendil-works/pi/blob/main/packages/ai/src/auth/oauth/openai-chatgpt.ts)及 OpenAI 的[注册与登录说明](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)。该实现独立保存在 `src/providers/chatgpt.ts`，仅在显式配置 `codexAuthMode: chatgpt` 后启用。

| 操作 | 当前实现 |
| --- | --- |
| authorize | `https://auth.openai.com/api/accounts/authorize`，以 `dynamic_agent_client` 注册 |
| 注册标识 | 应用名 DeepSeek Harness；Host 标识由 DSH credentials 持久保存为 `urn:uuid:...` |
| scope / resource | `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`；`https://api.openai.com/v1` |
| callback | `http://127.0.0.1:<空闲端口>/auth/callback`，每次授权与换码使用完全相同的 URI |
| token / refresh | `https://auth.openai.com/api/accounts/oauth/token`，使用回调签发的 `oaiapp_...` client id |
| 模型 | `https://api.openai.com/v1/models`，读取 `models` 中 `visibility: list` 的条目，保留顺序 |
| 推理 | `https://api.openai.com/v1/responses`，SSE，`store: false`、`stream: true`，禁用自动重发 |

回调监听先绑定再显示授权 URL；校验 state、PKCE 和 nonce。ID token 通过 `jose` 校验签名、issuer、issued-client audience 和有效期后，才读取 subject / email。access token 作为不透明 Bearer 凭据使用，不解析 ChatGPT workspace id；没有直接调用权限的 scope 时拒绝启用。刷新在 DSH credential 独占锁内整体替换 access / refresh token、scope 和到期时间；不能用固定客户端或另一账号的 token 刷新。

### 公共 API 模型与推理

使用账号实时模型目录，不以静态列表冒充发现成功。pi 的已安装 OpenAI 目录只补充模型容量和推理能力。公开 PiAiAdapter 负责 DSH 消息、工具、reasoning、token usage 与历史回传；SDK 内部使用 OpenAI provider，宿主仍以 `subscription-codex` 区分账号路由。

system 消息转换为 developer 消息。按[预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)省略不接受的请求参数；工具声明放入 developer `additional_tools` 输入项，避免向该路由提交顶层的普通 function tools。只有 `response.completed` 才算完成；流中途出现额度错误或 EOF 均失败，不重发、不切换付费来源。

### 公共 API 套餐用量与日期

OpenAI 的[账号与用量说明](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions#tracking-usage)提供 ChatGPT 设置中的用量管理入口，未公开本流程查询套餐剩余额度或订阅终止日的 API。账号卡片因此提供「在 ChatGPT 查看套餐用量与应用限额」链接，不显示虚假的零额度，也不使用旧私有用量接口。Responses 返回的单次 token usage 仍交给 DSH 记录，它不等于套餐剩余额度。

访问令牌的到期时间单独标注，不将其显示为订阅到期。已存凭据的版本处理及重新登录步骤只维护在[升级说明](UPGRADING.md)。真实登录、套餐权限、模型推理与工具往返仍需真实账号验收。

## GitHub Copilot

### 授权和模型

GitHub 官方支持 [OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)。参考项目的具体实现使用 Copilot Chat 的 client id 请求 `/login/device/code`，轮询 `/login/oauth/access_token`，再以 GitHub token 请求 `api.github.com/copilot_internal/v2/token` 获取短期 Copilot token。

不能把任意自建 GitHub OAuth App 登录成功等同于有权调用 Copilot internal token exchange。该 client identity 与组织策略是否可用于目标账号必须真实验证；文档中的 device flow 只证明授权协议，不为内部推理接口提供兼容承诺。

模型从 `https://api.githubcopilot.com/models` 读取，按目录的能力、policy 和 supported endpoints 过滤。Responses 与 Chat 分别路由；其他专有协议不发布。当前只访问固定 Copilot API origin，不跟随 token 内任意 URL。

短期 Copilot token 过期时用 GitHub token 重新兑换；若 GitHub 登录本身返回 expiring token / refresh token，也必须支持该层续期，不能假定 GitHub token 永久有效。两个 token 的刷新和失效语义分开保存。

### 用量

V1ki README 声称不提供用量展示，但这不是平台能力上限。GitHub 当前[官方 SDK 文档](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing)已提供 `account.getQuota`，区分账号 entitlement、已用、剩余百分比与 reset date；[官方 Billing REST](https://docs.github.com/en/rest/billing/usage?apiVersion=2026-03-10)也有个人、组织/企业的用量作用域区别。

此插件直接读取 `/copilot_internal/user`，不引入另一套 agent session，不请求组织管理权限。没有可展示 quota 时标记不可读取，不把组织席位信息缺失显示为零用量。

`/copilot_internal/user` 不是稳定公开 API，真实账号权限仍待核验。解析 `quota_snapshots` 的独立窗口、remaining percent、entitlement/remaining 或 unlimited；不将 premium requests 与 AI credits 固定换算。403/404 表示当前授权不提供用量，其余请求失败保留旧数据。

### 日期与验收

`expires_at` 通常属于 Copilot token；quota reset 与账单周期另列。没有确定的个人订阅停止时间来源，默认显示平台未提供。设备等待/slow_down、组织拒绝、无订阅、双层刷新、按模型协议路由、quota 部分不可用都需要验证。

## Grok（X Premium）

### 协议线索

V1ki 使用 Grok CLI 的 PKCE/OIDC 路线。本插件改用已安装 `@earendil-works/pi-ai@1.0.2` 中 xAI 授权实现所采用的设备流程，向 `https://auth.x.ai/oauth2/device/code` 请求短码，并轮询 `/oauth2/token`；scope 为 `openid profile email offline_access grok-cli:access api:access`。共用 RFC 8628 等待/取消逻辑，不增加固定端口和第二套浏览器回调。

其模型目录来自 `https://api.x.ai/v1/models`，reasoning 能力还可能来自 `cli-chat-proxy.grok.com/v1/models`，推理为 xAI Responses。不能把 grok.com 或 X 的网页 Cookie 当 OAuth grant；也不能因用户买了某个名称含 Premium 的套餐就假设已获所有 API 权限。

### 用量和日期

参考实现读取 `https://cli-chat-proxy.grok.com/v1/billing?format=credits` 并使用 CLI token header。返回可能包含 `creditUsagePercent`、`currentPeriod`，或旧版额度与已用金额；必须按字段和单位解析，不将缺失百分比设为 0。

`currentPeriod.end` 或 `billingPeriodEnd` 代表周期边界，不是自动取消订阅的时间。tier 的 JWT claim 至多是未经独立账单查询的套餐显示线索；缺少可信终止字段时不生成订阅倒计时。

### 验收

离线测试覆盖设备授权公开字段、verification origin、模型过滤与两类 billing 返回。真实设备登录、refresh、目录权限、推理和 billing 权限尚未验证，不能仅按 X Premium 套餐名推断接入成功。设备服务返回的 token 用于请求；JWT 解码仅作显示标签，不宣称经过 OIDC 身份验证。

## Cursor

### 采用专用参考

orrinzeng 的实现比通用订阅插件更适合该平台：它提供 PKCE 配对、动态模型、Connect/protobuf stream、工具桥接及 dashboard usage。GooDAnDReaDY 参考中的 Cursor 路径把 JSON chat 请求发到 AgentService/Run，不能作为已实现协议复用。

| 操作 | 专用参考中的路径 |
| --- | --- |
| 浏览器登录 | `https://cursor.com/loginDeepControl?challenge=...&uuid=...&mode=login&redirectTarget=cli` |
| Host 等待授权 | `https://api2.cursor.sh/auth/poll`，请求含 uuid 和 verifier |
| refresh | `https://api2.cursor.sh/auth/exchange_user_api_key` |
| 账号模型 | `https://api2.cursor.sh/agent.v1.AgentService/GetUsableModels`，protobuf unary |
| 推理 | `/agent.v1.AgentService/Run`，Connect framing / protobuf，不能当 SSE chat 使用 |
| 简化用量 | `https://cursor.com/api/usage-summary`；必要时补 `/api/usage` |

引用路径来自固定版本源码，不是第三方公开稳定 API。请求中的 verifier、Cookie 和 grant 仅存在 Host。参考使用 `WorkosCursorSessionToken=<sub>::<access>` 调用 dashboard；本插件须验证这与当前授权所得 token 一致，不要求用户额外复制浏览器 Cookie。

### 模型、工具与恢复

`GetUsableModels` 返回 raw protobuf 或 framed 数据，需要有界解析。参考失败后回退静态目录，本插件不采用此行为：首次发现失败不显示硬编码模型，已有目录保留并标过期。

Cursor 会要求 MCP 风格工具、request context、KV/blob 与 checkpoint；DSH 工具需要投影到该协议。只执行 DSH 审批后的工具，明确拒绝远端原生 shell、文件或未知 exec 请求，不能悄悄将其交给本地系统执行。工具执行权、取消和错误回传归 DSH。

不能把最初文字输出当作完成，也不能让 heartbeat 无限延长无内容进展的请求。实现检查完整帧、Connect error、压缩标记与帧大小限制。每个 DSH step 新建 Run，使用完整日志消息构建文本历史，保留 tool id、完整 arguments 和 tool-role 结果；不保留内存中的远端 checkpoint。文本协议和并行工具经过本地 HTTP2 fixture 验证，但真实服务对该历史投影的接受与恢复效果仍需验收。

### 用量和日期

只取需求所需的套餐、额度池及账单周期；不搬运团队列表、按模型消费明细、支出报表等 dashboard。`billingCycleEnd` 显示为账单周期结束，不能标成订阅到期。token 的 `exp` 只用于刷新和凭据状态。

真实验收至少覆盖登录、目录、短会话、DSH 工具来回、取消、恢复历史与退出后关闭 HTTP2 资源。实施顺序为 Codex 后接 Cursor。当前仅支持文本，不传图片；不静默忽略服务未提供的推理参数。HTTP2 连接直连，尚无环境代理隧道支持。

## 参考代码取舍

已检出以下参考代码，未安装或执行参考仓库脚本。本项目只采用 Cursor 的 protobuf / Connect 协议子集，版权、MIT 许可和本地修改记录在 [vendor](../vendor/README.md)；未引入参考项目的整套适配器和页面。

| 参考 | 已查阅版本 | 采用的证据 | 不随项目引入的部分 |
| --- | --- | --- | --- |
| [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions/tree/9930c5ee5e3fa239db9031f47a0f6f30f7ffc443) | `9930c5ee5e3fa239db9031f47a0f6f30f7ffc443`，包 0.9.9 | provider、OAuth、usage、wire 和模型过滤思路 | Claude、账号池、轮换、搜索/图片/视频、状态栏、模型编辑和旧 DSH compatibility 层 |
| [GooDAnDReaDY/dsh-subscriptions](https://github.com/GooDAnDReaDY/dsh-subscriptions/tree/4cb19cb254faca932f4232a241f804678cc9137a) | `4cb19cb254faca932f4232a241f804678cc9137a` | 多平台差异与凭据隔离设计的对照 | 16 平台、代理/网关、自动更新、诊断中心、账号调度和静态目录冒充发现 |
| [orrinzeng/dsh-cursor-subscription](https://github.com/orrinzeng/dsh-cursor-subscription/tree/936fb5b40b8efb50a5bb2031c81f3c8f553bf7f8) | `936fb5b40b8efb50a5bb2031c81f3c8f553bf7f8`，包 0.6.12 | Cursor PKCE / protobuf / Connect / usage | 独立整套设置页、多语言扩展、团队报表、静态模型 fallback、重试调参界面 |

纯粹删除行数不能作为精简依据。协议必须处理的工具、结束标记、refresh 轮换与资源清理需要保留；额外页面、功能、兼容旧宿主和猜测 fallback 才是裁剪对象。

## 证据与待验证范围

DSH 侧已查阅本地 `packages/credentials/{authorization,credentials,credentials-local}`、`packages/llm/{llm,llm-pi-ai}`、原生 UI 及前两个插件。确认原生授权/记录服务存在，`LlmAdapter` 的当前消息和流类型与旧参考有差异，`registerAdapter` 首次不能为空、handle 可原子替换为零个 route。

本地验证使用脱敏数据、临时服务和隔离 DSH home。原生页面已检查授权等待与取消，但没有在平台页面提交真实登录，没有读取用户已有 token、请求付费推理或修改用户 profile。需要账号的支持范围、scope、用量/日期与模型推理仍按[实施计划](IMPLEMENTATION_PLAN.md)逐项验收。
