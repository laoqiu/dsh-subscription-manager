---
description: 为 DSH 管理订阅授权、账号用量和原生模型接入。
kind: package-bundle
---

# dsh-subscription-manager

## 摘要

在 **设置 → 订阅** 登录已有订阅，查看平台返回的用量，并将账号模型加入 DSH 原生模型选择器。适配 DSH `0.2.1-rc.2`，每个平台一个账号，提供退出登录、刷新用量和刷新模型。纯 DSH 插件，单包构建，无额外服务或 MCP 入口。仓库为 [laoqiu/dsh-subscription-manager](https://github.com/laoqiu/dsh-subscription-manager)，当前尚未发布到 npm。订阅菜单图标由 DSH 设置外壳提供，部分宿主可能显示齿轮。默认使用原 Codex 链路，新的 ChatGPT 公共 API 实现可通过配置保留切换；认证方式与已保存凭据不同的账号需重新登录，见[升级说明](docs/UPGRADING.md)。

## 目录

- [平台状态](#平台状态)
- [安装与开发](#安装与开发)
- [使用与数据](#使用与数据)
- [实现](#实现)
- [限制与待验收](#限制与待验收)
- [进一步阅读](#进一步阅读)

## 平台状态

| 平台 | 已实现代码 | 自动测试是否包含真实账号 |
| --- | --- | --- |
| Codex / ChatGPT | Codex OAuth、实时目录、Codex Responses、账号额度；可切换 ChatGPT 公共 API | 不包含 |
| Cursor | 浏览器配对、动态目录、Connect/protobuf、DSH 工具桥、用量摘要 | 不包含 |
| GitHub Copilot | Device flow、双层 token 刷新、动态目录、Responses / Chat、quota | 不包含 |
| Grok（X Premium） | Device flow、动态目录、Responses、billing 用量 | 不包含 |

本地测试验证协议解析、授权生命周期和流处理，不证明平台已经接受目标账号的客户端身份、订阅权益或请求。目录成功也不保证所有模型当前都有额度。

## 安装与开发

适配 **DSH 0.2.1-rc.2**，需要 Node.js `^22.19.0 || >=24`。在 Desktop 的「插件 → 添加插件」中输入 GitHub 归档地址：

```text
https://github.com/laoqiu/dsh-subscription-manager/archive/refs/heads/main.tar.gz
```

Web 使用已安装的 DSH CLI：

```powershell
dsh plugin --profile web add https://github.com/laoqiu/dsh-subscription-manager/archive/refs/heads/main.tar.gz
```

安装后重启对应应用，从「设置 → 订阅」进入。Web 与 Desktop 使用独立 profile。仓库包含已构建的 `lib/` 入口；归档安装无需编译 TypeScript，运行依赖由 DSH 包管理器安装。更新时重新安装该地址并重启；`main` 跟随最新提交，需要固定版本时使用具体提交的 GitHub 归档地址。

从源码开发：

```powershell
git clone https://github.com/laoqiu/dsh-subscription-manager.git
cd dsh-subscription-manager
npm ci
npm run build
npm test
npm pack
```

`lib/` 是随源码提交的生成产物，修改源码后需重新构建并一并提交。`npm pack` 自动构建，产物为 `dsh-subscription-manager-0.1.5.tgz`，包含 Host、Client、补丁、文档及 Cursor 协议许可；开发时也可安装构建后的本地目录。

0.1.5 的包名为 `dsh-subscription-manager`。从旧作用域包升级时，先在目标 profile 中移除旧依赖，再添加本仓库归档或新包。配置条目 ID 和凭据存储键不变，已有订阅授权可继续使用，见[升级说明](docs/UPGRADING.md)。

测试使用本地 HTTP / HTTP2 服务与脱敏数据，不读取用户 token，不触发付费推理；自动测试不代替目标账号的 OAuth、额度和模型调用验收。

## 使用与数据

设置页标题旁显示插件版本，下方显示简介；右侧图标依次提供检查更新、GitHub 和问题反馈，统一右对齐且悬停提示显示在下方；页面出现滚动条时保持位置一致。账号内保留用量与模型刷新操作。检查更新对比本仓库最新的 `vX.Y.Z` 正式 GitHub Release，并提供发布说明入口；尚未发布或查询失败时明确提示，检查本身不安装插件。

点击平台「登录」，在链接打开的平台页面完成授权；设备授权额外显示短码，可随时取消。登录提交后并行读取模型和用量；账号列表等待首次读取完成后返回，不需手动刷新才能显示额度。其中一项失败不会清空另一项。已保存账号在插件加载时恢复，模型目录更新通过 DSH 原生 LLM 通知链发布。

页面使用平台外卡片和账号内卡片，显示连接状态、账号、套餐、日期与用量窗口；百分比和进度条统一表示剩余可用额度：已用 7% 显示为 93% 可用；剩余超过 25% 为绿色，超过 10% 且不超过 25% 为黄色，不超过 10% 为红色。无限量及未知额度不绘制进度条，超额时保留负的剩余数值，条宽限制在 0 到 100%。登录按钮位于原账号区域，使用带加号的整行虚线样式；退出按钮保持原生边框样式。账号卡片内的「可用模型」只读展示接口返回的目录，展开内容独占整行；提供用量 API 的平台和模型目录分别通过带提示的刷新图标更新，不提供手工编辑列表。全部卡片跟随 DSH 的浅色或深色外观；平台外卡片使用原生卡片背景，账号内卡片使用更淡的底色：浅色为极浅灰，深色为轻微加深。

浏览器回调页使用通用的「账号登录」「客户端」文案，支持中英文和系统浅色 / 深色外观，分别显示授权成功、授权未完成或链接失效。「授权成功」表示已收到平台回调，客户端仍需验证和保存凭据，登录结果以客户端内显示为准。回调页不加载脚本、外部资源或显示授权参数。

默认 Codex 模式读取账号额度，显示平台返回的百分比、额度窗口和重置时间，并提供刷新图标。保留的 ChatGPT 公共 API 模式使用用量页链接，不请求 Codex 私有接口。用量只显示上游实际返回的窗口、百分比、计数或无限量。账号优先显示明确的订阅到期日；没有该字段时显示标注为「访问令牌到期」的授权有效期。额度重置和账单周期分别标注，不把令牌到期当作付费订阅结束。

「退出登录」删除本插件对应平台的本地凭据、撤下模型并取消本进程的在途请求，不取消付费订阅，也不代表平台已撤销服务器上的授权。刷新失败会保留旧数据并显示错误。凭据由 DSH credential provider 保存；默认文件 provider 不等于系统密钥链加密。

## 实现

<details>
<summary>结构与可配置参数</summary>

`src/index.ts` 注册原生授权方法、管理 RPC 和 LLM adapter；`account.ts` 统一处理凭据刷新、账号 generation、目录注册和退出清理。平台模块只处理各自的授权、模型和用量协议。Responses / Chat 的 DSH 消息、工具及流翻译复用公开的 `PiAiAdapter`；Cursor 仅维护必要的 Connect/protobuf 适配，协议子集的来源和 MIT 许可见 [vendor](vendor/README.md)。

Client 是原生 `settings.section`，全部产品文案使用中英文字典，跟随宿主主题；没有账号池、自动轮换、额外调参界面或独立代理。Host 与 Client 分开编译，根 `tsconfig.json` 仅组织 references。

参数通过 `cordis.yml` / overlay 中 `subscription-manager` 行的 `config` 配置：切换示例与重新登录步骤见[升级说明](docs/UPGRADING.md)。

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `requestTimeoutMs` | 30000 | 授权、模型、用量 HTTP 请求时限 |
| `authTimeoutMs` | 300000 | 整次登录时限 |
| `streamIdleTimeoutMs` | 120000 | 推理无内容进展时限 |
| `cursorToolSettleMs` | 500 | 收集 Cursor 并行工具请求的等待窗口 |
| `codexAuthMode` | `codex` | `codex` 为原订阅链路，`chatgpt` 为保留的公共 API 链路 |
| `codexClientVersion` | `0.153.4` | Codex 实时模型目录的客户端兼容版本 |
| `copilotEditorVersion` | `1.107.0` | Copilot 请求的编辑器版本 |
| `defaultContextWindow` | 262144 | 上游及维护目录均无数据时的上下文预算 |
| `defaultMaxTokens` | 32768 | Responses / Chat 模型缺少输出限制时的预算 |
| `maxRequestImageBytes` | 20971520 | 原生 adapter 的输入图片总量限制 |
| `requestImagePixelBudget` | 4194304 | 原生 adapter 的图片像素预算 |
| `requestImageMaxBytes` | 1048576 | 原生 adapter 的单张处理后图片限制 |

预算默认值不是上游容量保证。模型成员只来自账号实时目录；已安装的维护目录仅补充容量等已知元数据，不作为发现失败后的模型列表。Client 不接收 access/refresh/id token、Cookie、verifier 或设备 `device_code`。

</details>

## 限制与待验收

- Codex 默认使用原订阅链路，可显式切换至保留的 ChatGPT 公共 API。两种认证不会自动回退或混用 token。Codex 私有 HTTP 接口没有面向第三方的长期兼容保证，真实账号权限与在线用量仍需验收。
- Cursor 当前只支持文本和 DSH 工具；每次重建完整可见历史，不保留隐藏的远端 checkpoint，不执行平台下发的原生文件或 shell 工具。服务未暴露的 temperature、maxTokens、stop 和 reasoning effort 会明确拒绝。其 HTTP2 推理连接当前直连；JSON 请求使用环境 HTTP 代理，不能据此声称 Cursor 推理也支持代理。
- Copilot 只显示目录明确支持 Responses 或 Chat 的聊天模型；其他专有协议不发布。Grok 的 X Premium 权益是否可用于当前 OAuth / API，仍需目标账号确认。
- 自动测试不包含真人 OAuth、付费推理及完整在线 DSH 工具往返；平台权益与可用性需以目标账号实际结果为准。
- 推理不自动重发，不自动切换到另一账号或 API Key；流中断不会标记为成功。

## 进一步阅读

- [技术设计](docs/TECHNICAL_DESIGN.md)：服务、状态、通信、错误及生命周期。
- [平台接入分析](docs/PLATFORMS.md)：来源、协议与平台限制。
- [实施与验收](docs/IMPLEMENTATION_PLAN.md)：Codex → Cursor → Copilot → Grok 的实施状态与验证记录。

### Dev Note

无。


## Private registry distribution

This build is distributed as `dsh-subscription-manager` through `https://registry.antistudio.cn/`. Update checks use `https://registry.antistudio.cn/index.json`; package downloads use the npm credentials configured in the active DSH profile. GitHub hosts source code and issue reports.

