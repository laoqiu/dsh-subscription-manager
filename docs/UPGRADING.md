# 升级到 0.1.5

## 包名

npm 包名改为 `dsh-subscription-manager`。从作用域包 `@deepseek-ai/dsh-subscription-manager` 升级时，在对应应用的插件页卸载旧包，再添加构建后的本地目录或 `dsh-subscription-manager-0.1.5.tgz`。配置条目 ID `subscription-manager` 和凭据存储键不变；卸载插件不会执行退出登录，也不会删除订阅凭据。

## 默认 Codex 链路

默认 `codexAuthMode: codex`，恢复 Codex OAuth、账号模型目录、Codex Responses 和额度查询；浅色与深色均改为平台原生背景、账号内层淡底色。新的 ChatGPT 公共 API 实现独立保留在 `src/providers/chatgpt.ts`，不自动回退或混用认证。

0.1.1 的 version 2 Codex 凭据可继续按原格式读取和刷新；0.1.0 / 0.1.2 的 version 1 / 3 公共 ChatGPT 凭据仍可识别，但默认模式不使用它们发送请求。若页面提示认证方式变化，退出后按当前方式重新登录。升级不会删除或转换已有 token。

## 用量展示

账号列表在登录或恢复后的首次模型和用量读取完成后返回。平台的已用额度在页面转换为剩余可用百分比；已用 7% 对应 93% 可用。剩余超过 25% 为绿色，不超过 25% 为黄色，不超过 10% 为红色。认证方式和已保存凭据格式不变，已有正确授权不需要重新登录。

额度仪表图标由 DSH 设置外壳提供，更新插件后仍显示齿轮时，需要同时使用本次宿主构建。

## 安装与切换

1. 安装 0.1.4，完全退出并重启目标 DSH 应用。
2. 默认模式下，使用公共 ChatGPT 授权的账号需先退出，再点击虚线「登录」完成 Codex 授权。
3. 返回页面查看实时模型、用量窗口及重置时间，刷新图标重新读取对应数据。

需要启用保留的公共 API 实现时，在目标 profile 应用下面的 loader overlay，然后重启应用并重新登录：

```yaml
- id: subscription-manager
  config:
    codexAuthMode: chatgpt
```

改回 `codex` 即恢复默认链路。`codexClientVersion` 只控制 Codex 账号模型目录的客户端版本，默认 `0.153.4`。切换以整个认证 / 目录 / 推理 / 用量协议为单位；不允许把其中一类 token 交给另一类接口。公共 ChatGPT 模式仍使用 ChatGPT 用量页链接。

Codex OAuth 回调使用 localhost 的 1455 或 1457 端口，公共 ChatGPT 回调使用 127.0.0.1 的临时端口；完成或取消后均释放监听。退出只清除本地凭据，不取消订阅。访问令牌到期、额度重置和付费订阅结束分别标注。
