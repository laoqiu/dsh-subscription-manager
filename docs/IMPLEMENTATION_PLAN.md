# 分步实施与验收

本文管理开发顺序与验收状态。设计要求见[技术设计](TECHNICAL_DESIGN.md)，平台 endpoint、证据和限制只维护在[平台接入分析](PLATFORMS.md)。只有完成实际验证的项目才能勾选。

## 进度

- [x] 阅读三个参考仓库及当前 DSH 的授权、凭据和 LLM 接口。
- [x] 创建独立目录和技术文档，区分设计、源码证据和账号验证。
- [x] 公共基础、原生设置页及构建产物。
- [x] Codex：默认 CLI OAuth / 目录 / Responses / 用量；保留可配置的公共 ChatGPT 模式，凭据隔离与离线测试。
- [x] Cursor：PKCE 轮询、动态目录、Connect/protobuf、DSH 工具桥、用量摘要代码与离线测试。
- [x] GitHub Copilot：device flow、双层 token、目录与按模型协议调用、quota 代码与离线测试。
- [x] Grok：device flow、目录、Responses、billing 代码与离线测试。
- [x] Tarball 在空目录安装，普通 Node 导入 Host，检查 Client loader 描述、patch 与 vendor 依赖。
- [x] 隔离 Web profile：原生设置页、平台折叠、Codex 授权等待/取消、深浅主题、窄屏与浏览器错误检查。
- [x] 使用原生 LLM registry 验证目录发布、通知和退出撤下。
- [ ] 四个平台的真实账号登录、用量权限、订阅日期可用性、实际推理和完整工具往返。
- [ ] Desktop 安装、真实账号的原生模型选择器与会话恢复验收。

## 实施顺序

### 1. 公共基础与 Codex

先完成一个能从登录走到 DSH 会话推理的纵向实现，再推广到其他平台。不要一次注册四个只会抛 `not implemented` 的 LLM adapter，也不要为了展示页面把所有平台伪装成可用。

复用公开 PiAiAdapter 与 pi-ai 的 Codex / OpenAI provider；验证固定和动态 OAuth client、PKCE/OIDC、凭据独占刷新、实时目录和流终止。复用不成立的部分局部实现，不依赖参考仓库私有路径。

交付内容：单包 manifest/lockfile/patch、分离 Host/Client 编译、原生「订阅」设置页、schema 校验、原生授权桥接、凭据记录、只读账号投影和 `subscription-codex` route。不为尚未实现的平台注册空 adapter。

默认 Codex 模式读取账号额度，公共 API 模式使用 ChatGPT 用量页；单次推理 usage 单独交由 DSH 记录，不推算订阅有效期。

### 2. Cursor

先建立 raw/framed protobuf 目录 fixture，再实现 Connect stream 与 DSH 工具回传，最后接入 dashboard summary。每个阶段均使用同一授权记录和同一页面，不能挂载另一个 Cursor 插件来重复注册菜单和凭据。

优先将有维护价值的 Connect 编解码提取为少量模块；必须处理帧限制、压缩标记、终止错误、未知 exec 拒绝和关闭资源。重启恢复与跨 provider 历史是发布前条件，不能仅测“你好”后宣称 agent 能力已完成。

### 3. GitHub Copilot

沿用页面和生命周期，增加 device flow 与两层 token，核验 entitlement 和目录协议信息。只发布已实现 wire 的模型。quota 优先对照官方 SDK transport，避免为查看用量引入第二个会话运行时；需扩大权限时先判断是否仍在本插件最小范围内。

### 4. Grok

实现 xAI 设备授权和 billing 解析，复用 Responses 翻译能力；授权路线依据见平台分析。按实际权益验证 X Premium 账号，不写死套餐名或模型数量。

## 每个平台的验收

离线测试可以证明本地处理行为，真实账号验证负责证明平台当前接受该客户端、scope 和请求协议；二者分别记录。

| 层级 | 验收内容 |
| --- | --- |
| OAuth / device flow | 成功、用户拒绝、取消、超时、state/nonce 不匹配、重复 callback、slow_down、非法 issuer/audience；验证失败不替换现有账号 |
| 凭据 | schema 错误、只读存储、refresh 并发、token rotation 写入失败、退出与刷新/提交竞争；退出后旧结果不能重新存入 |
| 模型目录 | 实时字段解析、权限/endpoint 过滤、空列表、成功更新、保留过期缓存、账号更换清除旧目录、native picker 收到更新 |
| 用量 / 日期 | 有效 0、未知、无限量、超额、部分缺字段、限额为 0、格式变化、token/reset/billing/subscription 日期互不混淆 |
| Wire | 字符分片、多 block、reasoning、并行工具、tool-role 结果、usage、上游 failed/incomplete、提前 EOF、取消及无重复请求 |
| DSH 会话 | 原生模型选择、工具审批和结果回传、历史恢复、账号更换、退出后旧模型请求明确失败且不自动改用其他 provider |
| UI | 平台折叠、原生风格、中英文、深浅色、窄屏、登录等待/取消、刷新保留内容、退出后全局反馈、无 token 泄露 |
| 卸载 | 所有注册释放，listener / timer / reader / HTTP2 stream 关闭，等待在途资源，无端口残留或关闭后的迟到提交 |

涉及协议、会话输出或恢复的变更加入脱敏、无密钥 fixture 和 owner-local recorded output；通过 DSH 集成流影响会话记录时，按宿主快照要求补充对应记录。测试不读真实用户的凭据、默认 home 或付费接口。

## 检查和交付证据

工程提供类型检查、完整构建、聚焦行为测试和打包脚本。Tarball 还需在空目录检查 Host/Client 与运行依赖；不以修改 peer version 或手工创建空 `lib/index.js` 绕过宿主校验。

UI 验证从隔离 DSH home 的正式 `dsh` profile 启动，不调用另一套插件自带 Node server。自动化使用本地 fixture；真人 OAuth 只由用户在平台页面完成，测试报告不保存授权 URL 参数、token 或 Cookie。结束后只清理本次测试创建的进程、端口和文件，不影响用户手工运行的 Desktop。

每个平台交付记录包含：实际实现的功能、数据来源、真实返回缺失的能力、执行过的检查、是否经过真人授权、是否有完整推理与工具调用证据。仅写了适配器、只有 mock 通过或只有目录成功，都不能标记该平台已完成。

## 当前验证记录

记录日期：2026-10-17。当前包含 Codex、Cursor、Copilot、Grok 四个平台和 0.1.4 本地安装包。

| 已执行检查 | 观察结果 |
| --- | --- |
| `npm ci`、`npm ci --ignore-scripts` | 锁文件可重建依赖；当前环境阻止未批准的依赖安装脚本，后续构建成功 |
| DSH 设置页聚焦测试与 bundle | 31 项测试通过；订阅菜单使用额度仪表图标 |
| `npm run build` | Host / Client 类型检查与产物生成通过 |
| `npm test` | 55 项通过：登录/恢复首次用量读取竞态、剩余额度计算、两类 OAuth、PKCE/nonce、回调 HTML/CSP、端口占用与取消、权限 scope、Host 标识、令牌轮换、认证方式隔离、额度窗口与拒绝、凭据并发与退出、实时目录、原生 LLM registry、两类 HTTP Responses 工具回传与失败、HTTP2 / Connect 与并行工具 |
| `npm pack --json` | 包含声明的两个入口、patch、文档与 Cursor MIT 许可 |
| 空目录 `npm install <tgz> --omit=dev --ignore-scripts` | 普通 Node 可导入 Host，Client 注册描述与 patch 有效，vendored ESM 可加载 |
| 隔离 `dsh --profile web` + 原生页面检查 | 深浅主题、窄屏、分组折叠、授权等待和取消可用；浏览器错误列表为空 |
| 订阅卡片的本地接口 fixture | 深浅主题与窄屏下的账号、日期、进度和模型折叠显示正常；模型目录位于账号卡片内且展开内容占满一行，刷新图标发出 models 请求并更新目录，Tooltip 可显示/消失；登录位于账号区域，使用整行虚线按钮；退出为原生边框按钮 |
| 真实 loopback 回调的本地 fixture | 静态状态页在浅色和暗色窄屏可读，无浏览器错误；监听在回调后关闭，无真实账号或 token exchange |

原生 Web 验证使用临时 DSH home / agents home 和正式 CLI profile，不修改用户的 Desktop profile。仅生成授权链接并取消，未打开平台页面提交账号；测试进程和浏览器已关闭。fixture 中的工具调用和模型注册不等于真实平台 DSH 会话已验收。

尚未执行：真实账号 OAuth / token 续期、各套餐 quota/到期字段、付费推理、真实服务工具往返与重启恢复、Desktop 实机登录。Cursor 的完整历史文本投影及直连 HTTP2 也需要目标网络和账号验证；相关限制见 README。
