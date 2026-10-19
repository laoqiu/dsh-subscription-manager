/** Complete English and Chinese product copy. */
export const en = {
  available: 'available',
  'callback-busy': 'Sign-in callback ports are occupied. Close other sign-in windows and retry',
  chatgptUsage: 'View plan usage and app limits in ChatGPT',
  signedOutState: 'Not signed in',
  connectedAccount: '1 account connected', usage: 'Usage', plan: 'Plan',
  quotaSession: '5-hour window', quotaWeekly: 'Weekly',
  nav: 'Subscriptions', login: 'Sign in', logout: 'Sign out', refresh: 'Refresh usage', models: 'Available models', discover: 'Refresh models', cancel: 'Cancel', continue: 'Continue in browser', pending: 'Waiting for authorization', authorized: 'Signed in',
  expiry: 'Subscription ends', tokenExpiry: 'Access token expires', billing: 'Billing period ends', reset: 'Resets', unknown: 'Not provided by platform', noUsage: 'Usage is not available for this authorization', noQuotaWindows: 'The platform returned no quota windows', lastUpdated: 'Updated', unlimited: 'Unlimited', used: 'Used', retry: 'Retry', emptyModels: 'No available models',
  success: 'Updated', signedOut: 'Signed out locally', loadError: 'Subscriptions could not be loaded. Please retry', quotaError: 'Usage could not be refreshed. Previous data is shown', modelError: 'Models could not be refreshed. Please retry',
  network: 'Could not connect. Check your network and retry', 'invalid-response': 'The platform returned unexpected data. Please retry', 'invalid-request': 'The request has expired. Please retry', 'auth-required': 'Authorization has expired. Sign in again', 'reauth-required': 'The Codex sign-in method changed. Sign out and sign in again', 'auth-failed': 'Authorization could not be verified. Sign in again', denied: 'The platform denied access. Check your account permissions', timeout: 'Authorization timed out. Please retry', cancelled: 'Authorization cancelled', 'storage-failed': 'Credentials could not be stored. Check DSH storage permissions', unsupported: 'This capability is not available', busy: 'An operation is already in progress', unloading: 'The plugin is unloading. Please retry after restarting',
} as const
export type Key = keyof typeof en
export const zh: Record<Key, string> = {
  available: '可用',
  'callback-busy': '授权回调端口被占用，请关闭其他登录窗口后重试',
  chatgptUsage: '在 ChatGPT 查看套餐用量与应用限额',
  signedOutState: '未登录',
  connectedAccount: '已连接 1 个账号', usage: '用量', plan: '计划',
  quotaSession: '5 小时额度', quotaWeekly: '每周额度',
  nav: '订阅', login: '登录', logout: '退出登录', refresh: '刷新用量', models: '可用模型', discover: '刷新模型', cancel: '取消', continue: '在浏览器中继续', pending: '等待授权完成', authorized: '已登录',
  expiry: '订阅到期', tokenExpiry: '访问令牌到期', billing: '账单周期结束', reset: '重置时间', unknown: '平台未提供', noUsage: '当前授权无法读取用量', noQuotaWindows: '平台未返回额度窗口', lastUpdated: '更新时间', unlimited: '无限量', used: '已用', retry: '重试', emptyModels: '暂无可用模型',
  success: '已更新', signedOut: '已清除本地登录', loadError: '无法加载订阅，请重试', quotaError: '用量刷新失败，保留上次数据', modelError: '模型刷新失败，请重试',
  network: '连接失败，请检查网络后重试', 'invalid-response': '平台返回的数据无法识别，请重试', 'invalid-request': '请求已失效，请重试', 'auth-required': '授权已失效，请重新登录', 'reauth-required': 'Codex 授权方式已更新，请退出后重新登录', 'auth-failed': '授权验证失败，请重新登录', denied: '平台拒绝访问，请检查账号权限', timeout: '授权超时，请重试', cancelled: '已取消授权', 'storage-failed': '无法保存凭据，请检查 DSH 存储权限', unsupported: '当前能力尚不可用', busy: '操作正在进行中', unloading: '插件正在卸载，请重启后重试',
}
