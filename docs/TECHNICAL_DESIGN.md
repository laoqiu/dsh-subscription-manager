# 订阅管理插件技术设计

本文描述插件的实现约定；平台尚未通过真实账号验收的部分不构成服务可用性保证。宿主接口以本地 DSH `0.2.1-alpha.2` 为依据，平台证据见[平台接入分析](PLATFORMS.md)，实施和验证状态见[实施计划](IMPLEMENTATION_PLAN.md)。

## 摘要

用户通过 DSH 设置页授权已有 AI 订阅，查看平台实际返回的账号、额度和日期，并在原生模型选择器中使用订阅模型。Host 持有凭据和上游网络请求，Client 只显示经过筛选的状态。复用 DSH 的授权、凭据和 LLM 服务，不运行额外网关，不修改 agent-loop。

## 目录

- [范围和命名](#范围和命名)
- [界面](#界面)
- [代码组织](#代码组织)
- [宿主服务与凭据](#宿主服务与凭据)
- [授权与并发](#授权与并发)
- [账号视图与用量](#账号视图与用量)
- [模型与 API 接入](#模型与-api-接入)
- [页面通信](#页面通信)
- [错误与生命周期](#错误与生命周期)
- [构建与交付](#构建与交付)

## 范围和命名

| 项目 | 约定 |
| --- | --- |
| npm 包名 | `dsh-subscription-manager`；本地目录名 `dsh-subscription-manager` |
| Cordis 插件名、设置页 id、凭据 scope | `subscription-manager` |
| 平台 id | `codex`、`cursor`、`copilot`、`grok` |
| 已实现 LLM provider route | `subscription-codex`、`subscription-cursor`、`subscription-copilot`、`subscription-grok` |
| 凭据地址 | `credentialKey('subscription-manager', platform)` |
| 页面通信前缀 | `subscription-manager/` |
| 设置入口 | `settings.section`，标题「订阅」；无侧栏应用和会话工具按钮 |

每个平台一个当前账号；重新授权只在新身份验证和凭据提交成功后替换原账号。更换账号通过退出并重新登录完成，不实现账号列表、账号池、自动切换、手填 API Key 或其他插件凭据导入。

只提供授权、用量与日期、模型发现和推理接入。文本流、推理流、DSH 工具调用和工具结果回传属于正常 agent 会话所需的 API 适配；它们不是额外功能。图片输入按真实能力接入，不增加图片生成、视频或搜索工具。

## 界面

复用已归档和技能插件的设置页宽度、间距、折叠分组与原生控件。按 Codex、Cursor、GitHub Copilot、Grok（X Premium） 的顺序上下排列，每组可收起；未授权的行仅提供平台名、状态和登录按钮。

每个平台使用独立外卡片，标题旁显示连接状态，下方显示当前账号数或未登录状态。登录入口位于原账号区域，是带加号的整行虚线按钮。平台背景使用原生卡片色，账号内层使用更淡的主题底色：浅色极浅灰，深色轻微加深。已登录账号使用内卡片，账号与退出操作在顶部，用量和只读模型折叠区均在账号卡片内。展开模型列表独占整行，刷新图标只占标题行并带原生 Tooltip。退出使用 outline 按钮；平台收起时，账号区及登录按钮一并隐藏。视觉布局不改变每个平台一个账号的功能范围。

```text
订阅

⌄ Codex
  ┌ user@example.com                       [退出登录] ┐
  │ 访问令牌到期 …                                  │
  │ 每周额度 93% 可用 · 五小时额度 7% 可用       [刷新用量]    │
  │ 可用模型  ▸                             [刷新]   │
  └──────────────────────────────────────────────────┘

⌄ Cursor
  [ + 登录 · 整行虚线按钮 ]
⌄ GitHub Copilot
  [ + 登录 · 整行虚线按钮 ]
⌄ Grok（X Premium）
  [ + 登录 · 整行虚线按钮 ]
```

上图是布局说明。默认 Codex 模式显示真实额度及刷新图标，公共 ChatGPT 模式才显示用量页链接。只显示上游提供的额度窗口；没有百分比时显示真实计数、余额或「平台未提供」，不绘制零用量进度条。模型列表默认收起，只读显示名称，不增加模型编辑器和调参表单。

登录期间显示授权链接、必要的设备码、等待状态和取消按钮。浏览器弹窗被拦时保留可点击链接。回调只向 Host 返回，不能以 `dsh-app://` 作为平台默认 OAuth 回调。页面不自动发送会话、不因获取模型发起试用推理。

退出登录表示清除此插件持有的本地授权，不取消平台付费订阅，也不声称已经撤销平台服务器上的 OAuth grant。平台确有撤销接口时，由对应适配器明确实现；撤销失败与本地清除结果分别报告。

使用 DSH 的 Button、加载状态、折叠箭头、Toast 和主题 token，字体粗细不超过 500。退出和刷新操作局部禁用；刷新保留旧数据，失败显示上次更新时间和重试入口。刷新和退出结果使用设置页之外的全局 Toast；授权等待和失败留在平台分组内。全部产品文案进入中英文类型化字典。

设置页导航图标由 DSH 设置外壳按 id 决定；`subscription-manager` 对应已有的额度仪表图标。插件注册不增加宿主未提供的 `icon` 字段；旧宿主需要更新设置外壳构建才能显示该图标。

## 代码组织

采用单包、单锁文件，不建立嵌套项目。平台 grant schema 与对应平台代码放在一起，不增加仅转发调用的文件。

```text
dsh-subscription-manager/
├─ package.json
├─ package-lock.json
├─ cordis.patch.yml
├─ tsconfig.json                 # 只有 files: [] 和非空 references 的 solution
├─ tsconfig.base.json            # 严格选项
├─ tsconfig.host.json
├─ tsconfig.client.json
├─ build.mjs
├─ src/
│  ├─ index.ts                   # Host 注入、注册和清理
│  ├─ account.ts                 # 账号视图、刷新协调和 LLM route 生命周期
│  ├─ protocol.ts                # 页面请求、公开响应和输入校验
│  ├─ http.ts                    # 有界 HTTP 请求和脱敏错误
│  ├─ oauth.ts                   # PKCE / 回调资源管理
│  ├─ device.ts                  # GitHub / Grok 设备授权
│  ├─ adapter.ts                 # 复用原生 PiAiAdapter
│  ├─ providers/
│  │  ├─ codex.ts                  # 默认 Codex 链路与两类凭据识别
│  │  ├─ chatgpt.ts                # 保留的公共 API 授权
│  │  ├─ cursor.ts
│  │  ├─ cursor-stream.ts
│  │  ├─ copilot.ts
│  │  └─ grok.ts
│  ├─ client.tsx                 # 原生设置页
│  ├─ locales.ts
│  └─ styles.ts
├─ tests/
├─ vendor/                      # 有来源和许可的 Cursor 编解码子集
└─ docs/
```

不要把四个平台压成一个带大量可选字段的通用 OAuth 配置对象。公共层只协调生命周期与统一公开视图；token exchange、用量解析、模型发现、请求协议由平台拥有。Cursor Connect 协议独立；不得为目录对称复制四份通用 HTTP 代码。

Responses / Chat 复用 `@deepseek-ai/dsh-llm-pi-ai` 公开的 `PiAiAdapter` 和 `@earendil-works/pi-ai@1.0.2`，注入本插件凭据、动态目录和 route。OAuth 仍由平台模块实现；不导入宿主私有路径，不引入参考插件的整套页面、账号池和工具。

## 宿主服务与凭据

Host 的必要服务为 `llm`、`authorization`、`credentials` 和 `connection`；图片输入另外使用宿主 attachment 服务。Client 使用 `uiSettings`、`uiRenderer`、`locale`、`connection` 及全局反馈所在的布局服务，具体注入名以已安装类型为准。

| DSH 接口 | 本插件职责 |
| --- | --- |
| `authorization.registerFlow()` | 每平台注册授权方法；通过 `session.notify()` 提示，通过 `session.commit()` 或明确的库写入完成凭据提交 |
| `authorization.begin()` / `cancel()` | 运行和取消当前授权；不重新实现第二套并发授权引擎 |
| `credentials.readRecord()` | 在 Host 读取并校验本插件的 grant payload |
| `credentials.modifyRecord()` | 在独占读改写内刷新令牌，避免跨进程同时轮换同一 refresh token |
| `credentials.deleteRecord()` | 退出时只删除本插件对应平台的记录 |
| `credentials/record-updated` | 同步同一 DSH home 中的其他进程和页面 |
| `llm.registerAdapter()` | 注册真实可用的订阅 route，注册由 effect 释放 |
| `AdapterRegistrationHandle.replace()` | 已有注册原子更新 route 集合并通知原生消费者 |

使用 `GrantRecord`，payload 必须可 JSON 往返并带格式版本、平台判别字段；不同平台的 token、scope、client id、账号身份和 project id 使用判别联合。文件数据与上游 JSON 用 schema 校验，不添加 `as unknown`。

本插件不创建 `auth.json`、不把 token 写入 settings/patch、浏览器存储或进程环境。DSH 当前默认 credential provider 是文件实现，不能据此宣传“系统密钥链加密存储”；安全保证取决于实际挂载的 provider 和文件访问权限。

Host 返回页面的投影必须显式列出允许字段，不能先序列化 grant 再删 token。access/refresh/id token、Cookie、PKCE verifier、设备授权的 `device_code` 和完整回调 URL 均不得进入日志、Toast、模型提示、快照、错误 body 或 Client 状态；供人输入的短 `user_code` 可显示。

## 授权与并发

登录完成或恢复账号时，模型和用量并行读取；同一账号 generation 的后续列表请求等待当前两项读取结束，避免轮询在只有模型的中间状态停止。失败投影为原有单项错误，不用固定延时或重复请求替代状态同步。

浏览器 PKCE、GitHub device flow 和 Cursor 登录轮询共享 DSH 授权生命周期，不能假设它们有同一个回调协议。

授权码流程使用每次新建的高熵 state、S256 verifier 和需要时的 OIDC nonce。先绑定 loopback listener 再给出登录链接；严格验证 callback path、state 和身份，拒绝重复参数与重复回调。OIDC 身份用维护中的验证库检查签名、issuer、audience、时效和 nonce，不能仅 Base64 解码 JWT 就作为验证成功。

回调监听只绑定 loopback，端口来源于平台协议或明确配置，禁止为了登录开放 `0.0.0.0`。平台支持动态端口时使用系统分配端口；固定端口冲突要报告，不清理用户进程。成功、失败、取消、超时和插件卸载都关闭 listener 并等待结束。回调响应不包含凭据，带禁止缓存与禁止 referrer 泄露的响应头。

`oauth-page.ts` 输出无脚本的静态状态页，按浏览器 Accept-Language 选择中英文，按 prefers-color-scheme 适配浅色与深色。样式通过 CSP hash 允许，其他资源默认禁止；不反射上游 error description 或任何 URL 参数。页面不绑定客户端品牌，有效回调的标题为「授权成功」，正文说明客户端仍在验证授权信息，最终登录结果由客户端显示。

device flow 尊重服务器 `interval`、`expires_in`、`authorization_pending`、`slow_down`、拒绝和到期；Cursor 的 404 待授权只在明确的登录轮询接口中处理，不能把其他 404 都当成功等待。所有轮询和回调有可取消的总时限。

刷新在凭据独占更新内完成；记录不存在时不刷新。退出必须先阻止新请求、取消授权并等待在途提交退出临界区，再删除凭据和缓存。旧刷新、旧目录请求或旧授权完成不得复活账号；需要账号 generation 和写入时当前记录检查。不同平台不共用一个长任务队列，防止一个平台登录阻塞其他平台。

持久 refresh token 的写入失败属于未知授权状态，不宣称已刷新或安全重试。尽可能保留现存记录，平台要求重新授权时给出重新登录入口。

## 账号视图与用量

公开视图按平台提供登录状态、账号标签、上游套餐名、用量、日期、模型目录和分项刷新状态；不得只用一个 `loading` 或 `error` 覆盖整张卡片。

| 概念 | 语义 |
| --- | --- |
| `subscriptionEndsAt` | 上游明确表示权益终止的时间；未提供时为空 |
| `renewsAt` | 下一次续费时间；不能推断取消订阅后仍有同一行为 |
| `billingPeriodEnd` | 当前账单周期结束，不等于订阅停止 |
| `resetsAt` | 某个额度窗口重置 |
| `tokenExpiresAt` | 访问凭据失效，可被刷新；不得标作订阅到期 |
| `fetchedAt` | 对应数据上次成功读取时间 |

时间在 Host 统一为 epoch 毫秒，页面按当前时区格式化。未知、无限量、读取失败和实际用量 0 分开表示。

用量窗口至少区分百分比、已用/总量和无限量。Host 保留已用百分比或同单位计数；Client 将其转换为剩余可用百分比，文本、条宽和无障碍值保持一致。剩余超过 25% 为正常色，超过 10% 且不超过 25% 为预警色，不超过 10% 为错误色。已用百分比优先采用平台提供值，或使用同单位的有效分子分母计算；额度为零、字段缺失或量纲不同不做除法。超额时保留真实数值，进度条可限制视觉长度；不能靠夹紧数据隐瞒超额。

用量读取不触发购买、充值、项目开通或推理。在登录完成、启动恢复和用户点击刷新时读取；页面不会额外定时刷新用量。目录独立更新，不让用量接口故障清空模型。

用量的 `supported: false` 表示当前接口或授权不提供可展示数据，`usageError` 表示本次刷新失败，没有 `usage` 表示尚未成功读取。失败保留上次结果；不能捕获全部异常后显示“无订阅”或“用量为 0”。

## 模型与 API 接入

“加入 LLM 支持列表”通过原生 adapter 注册完成，不向 `.credentials.yaml` 之外的文件写密钥，不编辑宿主内置模型常量，也不替换用户已有 API provider。

1. 授权提交后读取该账号目录，并将模型 id、名称、输入能力及可得的 context/输出限制规范化。
2. 只有登录且有有效目录的 route 出现在原生选择器。未登录的平台仍显示在订阅设置页。
3. 缓存使用账号 generation 隔离。目录成功后一次替换，空目录与请求失败不同；失败不使用硬编码“可用模型”冒充发现结果。
4. 同名模型通过 provider 区分，例如 `subscription-copilot` 的某模型与 `subscription-codex` 下同名模型保留两个条目。
5. 使用现有 `llm/adapters-updated` 通知链让 Client 重新读取；只有需要实际更新时发布，不在渲染或每次目录查询中循环注册。当前 `registerAdapter([])` 非法，首次无账号时不注册；已有 handle 的 `replace([])` 可撤下全部 route。
6. 退出后撤下对应 route，旧会话的已选模型不自动替换为其他付费 provider；下一次请求明确提示重新登录或重新选择模型。

目录是上游给出的候选列表，不保证模型当前有额度或已获全部权限。仅暴露当前 adapter 已实现协议且满足 DSH 会话需要的模型；过滤 embedding、图片生成及未实现的推理协议，不把“平台返回但插件不会调用”的模型放入选择器。

每个平台实现或委托 `providerInfo`、`listModels`、`resolveModel`、`prepareCall` 和 `stream`。准备调用时固定账号 generation、模型能力和调用方式，防止切换账号或刷新目录把一个在途请求拼成两个账号的数据。退出时取消本插件仍在使用该账号的请求，并等待资源结束。

流适配遵守 DSH `StreamChunk`：有序的 block-start/delta/block-end、真实 token usage、唯一终止 finish，终止后不再输出。覆盖文本、reasoning、分片 tool-call、多个并行工具、tool-role 结果、空内容、错误和 abort。读取到 EOF 不等于正常完成，必须验证上游终止事件。

DSH 工具交给 DSH 执行，不能让 Cursor 等平台在远端直接执行本地 shell 或文件工具。需要续传的推理签名或 checkpoint 使用 DSH 已有 `ReplayEnvelope` 的规则保留可重建状态；不得只放进无法从会话日志恢复的全局 Map。重启或切换 provider 后的历史投影必须单独验证。

每个推理 HTTP 请求包含 DSH `attributionHeaders()`。图片通过宿主 attachment 访问接口取得，不能把本地文件路径冒充 URL。未知能力保留未知，不凭模型名称写死窗口、视觉支持或 reasoning effort。

推理默认不在 adapter 内自动重发。明确的鉴权拒绝最多刷新一次，且只有确定原请求没有产生推理输出时才可再次提交；流中断、超时、5xx 或结果未知不自动重发，避免重复扣量。DSH 上层重试策略也必须配置为与该保证一致，而不是只关闭底层 SDK 重试。

## 页面通信

优先使用 DSH 已提供的 Remote 能力；本插件专用管理操作采用 `connection.fetch.register()` 和 Client 的 authenticated connection，与技能插件一致。Desktop 的 `dsh-app://` 页面和普通 Web 共享通信，不开放无认证的 loopback 管理服务。

所有管理请求是现有 authenticated connection 下的 POST RPC，路径为 `/api/subscription-manager/<method>`。请求和响应在 `src/protocol.ts` 定义并校验。

| 操作 | 输入 | 响应内容 |
| --- | --- | --- |
| `list` | 空对象 | 四个平台公开视图 |
| `login` | 平台 id | 启动 `authorization.begin()`；返回包含 attempt 的公开视图 |
| `cancel` | 平台 id、attempt id | 取消该尝试，不影响其他平台 |
| `refresh` | 平台 id、目标 `usage` 或 `models` | 分项刷新结果与更新时间 |
| `logout` | 平台 id | 本地清除和 route 撤下结果 |

`list` 同时返回授权状态，Client 只在等待登录时轮询，不另建 status 路由。公共层不复制 DSH 的授权任务或凭据锁；没有手工回调输入框和任意文本透传。attempt id 使用品牌类型，外部输入校验后构造。

平台 id 必须是固定枚举；请求不能提交任意 URL、header、Cookie、方法名或要删除的凭据 key。上游请求固定或校验平台 origin/path；不跟随带 Authorization/Cookie 的跨域重定向。错误只返回稳定错误码和可公开参数，不传异常堆栈与上游响应原文。

## 错误与生命周期

| 失败 | 处理 |
| --- | --- |
| 授权拒绝/取消/到期 | 结束当前尝试，释放资源，保留此前有效账号 |
| 凭据无效或 refresh grant 被撤销 | 标记需重新登录，停止对应 route 的新推理，不清除其他平台 |
| 403/策略限制 | 标明账号或模型不可用，不自动降级到另一个账号或 provider |
| 429/额度耗尽 | 显示真实上游限额或 reset 信息，不自动轮换，不伪造订阅到期 |
| 网络、超时、schema 改动 | 保留已有视图，标记分项失败；推理报告结构化错误 |
| 退出时凭据删除失败 | 停止本进程使用并显示清除失败；不声称重启后仍保持退出 |
| 卸载 | 拒绝新操作，撤销注册，取消请求/轮询，关闭 listener 并等待在途资源结束 |

每个平台拥有自己的 AbortController、在途请求和刷新合并状态。相同账号同类读取可以共享 promise；失败后的 promise 必须释放，不能永久缓存 rejection。Client 的异步完成需检查当前挂载状态和 generation。

可调的请求超时、流空闲超时、授权时限和工具收集时长通过 Config 校验并解析一次。固定 OAuth 路径、scope、品牌 id 与 frame 限制不开放给页面。JSON 请求使用环境 HTTP 代理；Cursor HTTP2 连接的直连限制见 README，不增加每账号代理界面。

## 构建与交付

精确声明当前 DSH prerelease peer 版本，Cordis 与 schemastery 对齐宿主；不能把旧参考项目的宽泛 `^0.1...` 或 `^0.2.0-rc.2` 直接当作本地 `0.2.1-alpha.2` 的兼容证据。

Host 和 Client 使用独立 TypeScript 编译面，开启 strict、exactOptionalPropertyTypes 和 noUncheckedIndexedAccess。根 solution 使用非空 references，避免仅有空 `files` 导致 TS18002；不把 Host 与 Client 的 Cordis Context 合成一个编译程序。

Host 输出 `lib/index.js` 和声明，Client 输出 DSH `__ModuleLoader__` 可加载模块，导出 `./client`；`dsh.client.inject` 与实际消费一致，`dsh.bundle.patch` 指向插入 Host 行的 patch。打包必须包含所有真实引用的运行文件；`prepack` 完成构建，缺失入口再构建也必须能恢复。

`npm pack` 产物必须在空目录安装、以普通 Node 导入 Host、以真实 loader 验证 Client 和 patch。发布前通过真实 DSH profile 验证入口和原生选择器；Desktop 与 Web 安装独立，不能把安装到 `web` 当作 Desktop 已激活。

构建和分发操作见 README，已经执行与仍待执行的验收项目分开记录在实施计划中。
