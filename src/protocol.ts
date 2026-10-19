/** Public settings messages. Credentials never occur in these views. */
import { z } from 'zod'

export const NS = 'subscription-manager'
export const platforms = ['codex', 'cursor', 'copilot', 'grok'] as const
export const Platform = z.enum(platforms)
export type Platform = z.infer<typeof Platform>
export const AttemptId = z.uuid().brand<'SubscriptionAttemptId'>()
export type AttemptId = z.infer<typeof AttemptId>
export const errors = ['network', 'invalid-response', 'invalid-request', 'auth-required', 'reauth-required', 'callback-busy', 'auth-failed', 'denied', 'timeout', 'cancelled', 'storage-failed', 'unsupported', 'busy', 'unloading'] as const
export const ErrorCode = z.enum(errors)
export type ErrorCode = z.infer<typeof ErrorCode>
export const Window = z.object({ label: z.string(), kind: z.enum(['session', 'weekly', 'other']).optional(), usedPercent: z.number().finite().optional(), used: z.number().finite().optional(), limit: z.number().finite().optional(), resetsAt: z.number().finite().optional(), unlimited: z.boolean().optional() })

/** Derive remaining quota from normalized used values; undefined means no valid total.
 * @param window Platform quota window, with percentages expressed as used amounts.
 * @returns Remaining percentage, including negative values when the quota is exceeded.
 */
export function remainingPercent(window: z.infer<typeof Window>): number | undefined {
  if (window.unlimited) return undefined
  if (window.usedPercent !== undefined) return 100 - window.usedPercent
  return window.used !== undefined && window.limit !== undefined && window.limit > 0 ? (window.limit - window.used) / window.limit * 100 : undefined
}
export const Usage = z.object({ supported: z.boolean(), windows: z.array(Window), plan: z.string().optional(), subscriptionEndsAt: z.number().finite().optional(), billingPeriodEnd: z.number().finite().optional(), fetchedAt: z.number().finite(), url: z.literal('https://chatgpt.com/settings/usage').optional() })
export type Usage = z.infer<typeof Usage>
export const Model = z.object({ id: z.string(), name: z.string() })
export const View = z.object({
  platform: Platform, authenticated: z.boolean(), account: z.string().optional(), tokenExpiresAt: z.number().optional(),
  models: z.array(Model), usage: Usage.optional(), modelsError: ErrorCode.optional(), usageError: ErrorCode.optional(),
  attempt: z.object({ id: AttemptId, phase: z.enum(['pending', 'authorized', 'cancelled', 'failed']), url: z.url().optional(), code: z.string().optional(), error: ErrorCode.optional() }).optional(),
})
export type View = z.infer<typeof View>
export const Catalog = z.array(View)
export const requests = {
  list: z.object({}).strict(),
  login: z.object({ platform: Platform }).strict(),
  cancel: z.object({ platform: Platform, attempt: AttemptId }).strict(),
  refresh: z.object({ platform: Platform, target: z.enum(['usage', 'models']) }).strict(),
  logout: z.object({ platform: Platform }).strict(),
}
export type Method = keyof typeof requests
export const Failure = z.object({ ok: z.literal(false), code: ErrorCode })
