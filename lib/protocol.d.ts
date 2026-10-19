/** Public settings messages. Credentials never occur in these views. */
import { z } from 'zod';
export declare const NS = "subscription-manager";
export declare const platforms: readonly ["codex", "cursor", "copilot", "grok"];
export declare const Platform: z.ZodEnum<{
    codex: "codex";
    cursor: "cursor";
    copilot: "copilot";
    grok: "grok";
}>;
export type Platform = z.infer<typeof Platform>;
export declare const AttemptId: z.core.$ZodBranded<z.ZodUUID, "SubscriptionAttemptId", "out">;
export type AttemptId = z.infer<typeof AttemptId>;
export declare const errors: readonly ["network", "invalid-response", "invalid-request", "auth-required", "reauth-required", "callback-busy", "auth-failed", "denied", "timeout", "cancelled", "storage-failed", "unsupported", "busy", "unloading"];
export declare const ErrorCode: z.ZodEnum<{
    network: "network";
    "invalid-response": "invalid-response";
    "invalid-request": "invalid-request";
    "auth-required": "auth-required";
    "reauth-required": "reauth-required";
    "callback-busy": "callback-busy";
    "auth-failed": "auth-failed";
    denied: "denied";
    timeout: "timeout";
    cancelled: "cancelled";
    "storage-failed": "storage-failed";
    unsupported: "unsupported";
    busy: "busy";
    unloading: "unloading";
}>;
export type ErrorCode = z.infer<typeof ErrorCode>;
export declare const Window: z.ZodObject<{
    label: z.ZodString;
    kind: z.ZodOptional<z.ZodEnum<{
        session: "session";
        weekly: "weekly";
        other: "other";
    }>>;
    usedPercent: z.ZodOptional<z.ZodNumber>;
    used: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
    resetsAt: z.ZodOptional<z.ZodNumber>;
    unlimited: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** Derive remaining quota from normalized used values; undefined means no valid total.
 * @param window Platform quota window, with percentages expressed as used amounts.
 * @returns Remaining percentage, including negative values when the quota is exceeded.
 */
export declare function remainingPercent(window: z.infer<typeof Window>): number | undefined;
export declare const Usage: z.ZodObject<{
    supported: z.ZodBoolean;
    windows: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        kind: z.ZodOptional<z.ZodEnum<{
            session: "session";
            weekly: "weekly";
            other: "other";
        }>>;
        usedPercent: z.ZodOptional<z.ZodNumber>;
        used: z.ZodOptional<z.ZodNumber>;
        limit: z.ZodOptional<z.ZodNumber>;
        resetsAt: z.ZodOptional<z.ZodNumber>;
        unlimited: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    plan: z.ZodOptional<z.ZodString>;
    subscriptionEndsAt: z.ZodOptional<z.ZodNumber>;
    billingPeriodEnd: z.ZodOptional<z.ZodNumber>;
    fetchedAt: z.ZodNumber;
    url: z.ZodOptional<z.ZodLiteral<"https://chatgpt.com/settings/usage">>;
}, z.core.$strip>;
export type Usage = z.infer<typeof Usage>;
export declare const Model: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export declare const View: z.ZodObject<{
    platform: z.ZodEnum<{
        codex: "codex";
        cursor: "cursor";
        copilot: "copilot";
        grok: "grok";
    }>;
    authenticated: z.ZodBoolean;
    account: z.ZodOptional<z.ZodString>;
    tokenExpiresAt: z.ZodOptional<z.ZodNumber>;
    models: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>;
    usage: z.ZodOptional<z.ZodObject<{
        supported: z.ZodBoolean;
        windows: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            kind: z.ZodOptional<z.ZodEnum<{
                session: "session";
                weekly: "weekly";
                other: "other";
            }>>;
            usedPercent: z.ZodOptional<z.ZodNumber>;
            used: z.ZodOptional<z.ZodNumber>;
            limit: z.ZodOptional<z.ZodNumber>;
            resetsAt: z.ZodOptional<z.ZodNumber>;
            unlimited: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        plan: z.ZodOptional<z.ZodString>;
        subscriptionEndsAt: z.ZodOptional<z.ZodNumber>;
        billingPeriodEnd: z.ZodOptional<z.ZodNumber>;
        fetchedAt: z.ZodNumber;
        url: z.ZodOptional<z.ZodLiteral<"https://chatgpt.com/settings/usage">>;
    }, z.core.$strip>>;
    modelsError: z.ZodOptional<z.ZodEnum<{
        network: "network";
        "invalid-response": "invalid-response";
        "invalid-request": "invalid-request";
        "auth-required": "auth-required";
        "reauth-required": "reauth-required";
        "callback-busy": "callback-busy";
        "auth-failed": "auth-failed";
        denied: "denied";
        timeout: "timeout";
        cancelled: "cancelled";
        "storage-failed": "storage-failed";
        unsupported: "unsupported";
        busy: "busy";
        unloading: "unloading";
    }>>;
    usageError: z.ZodOptional<z.ZodEnum<{
        network: "network";
        "invalid-response": "invalid-response";
        "invalid-request": "invalid-request";
        "auth-required": "auth-required";
        "reauth-required": "reauth-required";
        "callback-busy": "callback-busy";
        "auth-failed": "auth-failed";
        denied: "denied";
        timeout: "timeout";
        cancelled: "cancelled";
        "storage-failed": "storage-failed";
        unsupported: "unsupported";
        busy: "busy";
        unloading: "unloading";
    }>>;
    attempt: z.ZodOptional<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodUUID, "SubscriptionAttemptId", "out">;
        phase: z.ZodEnum<{
            cancelled: "cancelled";
            pending: "pending";
            authorized: "authorized";
            failed: "failed";
        }>;
        url: z.ZodOptional<z.ZodURL>;
        code: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodEnum<{
            network: "network";
            "invalid-response": "invalid-response";
            "invalid-request": "invalid-request";
            "auth-required": "auth-required";
            "reauth-required": "reauth-required";
            "callback-busy": "callback-busy";
            "auth-failed": "auth-failed";
            denied: "denied";
            timeout: "timeout";
            cancelled: "cancelled";
            "storage-failed": "storage-failed";
            unsupported: "unsupported";
            busy: "busy";
            unloading: "unloading";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type View = z.infer<typeof View>;
export declare const Catalog: z.ZodArray<z.ZodObject<{
    platform: z.ZodEnum<{
        codex: "codex";
        cursor: "cursor";
        copilot: "copilot";
        grok: "grok";
    }>;
    authenticated: z.ZodBoolean;
    account: z.ZodOptional<z.ZodString>;
    tokenExpiresAt: z.ZodOptional<z.ZodNumber>;
    models: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>;
    usage: z.ZodOptional<z.ZodObject<{
        supported: z.ZodBoolean;
        windows: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            kind: z.ZodOptional<z.ZodEnum<{
                session: "session";
                weekly: "weekly";
                other: "other";
            }>>;
            usedPercent: z.ZodOptional<z.ZodNumber>;
            used: z.ZodOptional<z.ZodNumber>;
            limit: z.ZodOptional<z.ZodNumber>;
            resetsAt: z.ZodOptional<z.ZodNumber>;
            unlimited: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        plan: z.ZodOptional<z.ZodString>;
        subscriptionEndsAt: z.ZodOptional<z.ZodNumber>;
        billingPeriodEnd: z.ZodOptional<z.ZodNumber>;
        fetchedAt: z.ZodNumber;
        url: z.ZodOptional<z.ZodLiteral<"https://chatgpt.com/settings/usage">>;
    }, z.core.$strip>>;
    modelsError: z.ZodOptional<z.ZodEnum<{
        network: "network";
        "invalid-response": "invalid-response";
        "invalid-request": "invalid-request";
        "auth-required": "auth-required";
        "reauth-required": "reauth-required";
        "callback-busy": "callback-busy";
        "auth-failed": "auth-failed";
        denied: "denied";
        timeout: "timeout";
        cancelled: "cancelled";
        "storage-failed": "storage-failed";
        unsupported: "unsupported";
        busy: "busy";
        unloading: "unloading";
    }>>;
    usageError: z.ZodOptional<z.ZodEnum<{
        network: "network";
        "invalid-response": "invalid-response";
        "invalid-request": "invalid-request";
        "auth-required": "auth-required";
        "reauth-required": "reauth-required";
        "callback-busy": "callback-busy";
        "auth-failed": "auth-failed";
        denied: "denied";
        timeout: "timeout";
        cancelled: "cancelled";
        "storage-failed": "storage-failed";
        unsupported: "unsupported";
        busy: "busy";
        unloading: "unloading";
    }>>;
    attempt: z.ZodOptional<z.ZodObject<{
        id: z.core.$ZodBranded<z.ZodUUID, "SubscriptionAttemptId", "out">;
        phase: z.ZodEnum<{
            cancelled: "cancelled";
            pending: "pending";
            authorized: "authorized";
            failed: "failed";
        }>;
        url: z.ZodOptional<z.ZodURL>;
        code: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodEnum<{
            network: "network";
            "invalid-response": "invalid-response";
            "invalid-request": "invalid-request";
            "auth-required": "auth-required";
            "reauth-required": "reauth-required";
            "callback-busy": "callback-busy";
            "auth-failed": "auth-failed";
            denied: "denied";
            timeout: "timeout";
            cancelled: "cancelled";
            "storage-failed": "storage-failed";
            unsupported: "unsupported";
            busy: "busy";
            unloading: "unloading";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export declare const requests: {
    list: z.ZodObject<{}, z.core.$strict>;
    login: z.ZodObject<{
        platform: z.ZodEnum<{
            codex: "codex";
            cursor: "cursor";
            copilot: "copilot";
            grok: "grok";
        }>;
    }, z.core.$strict>;
    cancel: z.ZodObject<{
        platform: z.ZodEnum<{
            codex: "codex";
            cursor: "cursor";
            copilot: "copilot";
            grok: "grok";
        }>;
        attempt: z.core.$ZodBranded<z.ZodUUID, "SubscriptionAttemptId", "out">;
    }, z.core.$strict>;
    refresh: z.ZodObject<{
        platform: z.ZodEnum<{
            codex: "codex";
            cursor: "cursor";
            copilot: "copilot";
            grok: "grok";
        }>;
        target: z.ZodEnum<{
            models: "models";
            usage: "usage";
        }>;
    }, z.core.$strict>;
    logout: z.ZodObject<{
        platform: z.ZodEnum<{
            codex: "codex";
            cursor: "cursor";
            copilot: "copilot";
            grok: "grok";
        }>;
    }, z.core.$strict>;
};
export type Method = keyof typeof requests;
export declare const Failure: z.ZodObject<{
    ok: z.ZodLiteral<false>;
    code: z.ZodEnum<{
        network: "network";
        "invalid-response": "invalid-response";
        "invalid-request": "invalid-request";
        "auth-required": "auth-required";
        "reauth-required": "reauth-required";
        "callback-busy": "callback-busy";
        "auth-failed": "auth-failed";
        denied: "denied";
        timeout: "timeout";
        cancelled: "cancelled";
        "storage-failed": "storage-failed";
        unsupported: "unsupported";
        busy: "busy";
        unloading: "unloading";
    }>;
}, z.core.$strip>;
