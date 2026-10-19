/** Self-contained callback UI; no upstream values, scripts or remote resources are rendered. */
import { createHash } from 'node:crypto';
const copy = {
    en: {
        received: ['Authorization successful', 'Return to your client to check your sign-in result. Your client is verifying your authorization.'],
        denied: ['Authorization was not completed', 'Return to your client and sign in again when you are ready.'],
        invalid: ['This authorization link is invalid', 'Start a new sign-in from your client. This link cannot complete your authorization.'],
        brand: 'Account sign-in', label: 'ACCOUNT AUTHORIZATION', close: 'You can close this page',
    },
    zh: {
        received: ['授权成功', '请返回客户端查看登录结果，客户端正在验证你的授权信息'],
        denied: ['授权未完成', '请返回客户端，准备好后重新登录'],
        invalid: ['授权链接无效或已过期', '请从客户端重新发起登录，此链接无法完成授权'],
        brand: '账号登录', label: '账号授权', close: '可以关闭此页面',
    },
};
const css = `
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--ink:#1f2329;--muted:#616976;--line:#e4e7ed;--accent:#2563eb;--soft:#edf3ff}
@media(prefers-color-scheme:dark){:root{--bg:#191a1d;--card:#25262a;--ink:#f0f1f4;--muted:#b2b7c2;--line:#3b3d44;--accent:#8aafff;--soft:#29334b}}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.7 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
main{width:min(100%,460px);padding:36px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:0 16px 60px #00000008}
.brand{display:flex;align-items:center;gap:10px;font-weight:500}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--soft);color:var(--accent);font-size:12px;letter-spacing:.5px}
.label{margin:36px 0 10px;color:var(--muted);font-size:12px;letter-spacing:1px}h1{margin:0;font-size:24px;line-height:1.4;font-weight:500;letter-spacing:-.4px}.description{margin:14px 0 28px;color:var(--muted);overflow-wrap:anywhere}
footer{padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media(max-width:420px){body{padding:16px}main{padding:28px 24px;border-radius:20px}h1{font-size:22px}}
`;
const policy = `default-src 'none'; style-src 'sha256-${createHash('sha256').update(css).digest('base64')}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
/** Render a callback receipt or failure; the client owns token verification and the final sign-in result.
 * @param state Public callback result, independent of the later token exchange.
 * @param language Browser Accept-Language; the preferred supported language is used.
 * @returns Static HTML and restrictive response headers.
 */
export function callbackPage(state, language = '') {
    const preferred = language.split(',').map(value => value.trim().split(';')[0] ?? '').find(value => /^(zh|en)(-|$)/i.test(value));
    const lang = preferred?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const text = copy[lang], [title, description] = text[state];
    return {
        html: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title}</title><style>${css}</style></head><body><main><div class="brand"><span class="mark" aria-hidden="true">↗</span><span>${text.brand}</span></div><p class="label">${text.label}</p><h1>${title}</h1><p class="description">${description}</p><footer>${text.close}</footer></main></body></html>`,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-security-policy': policy, 'x-content-type-options': 'nosniff' },
    };
}
