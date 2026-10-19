import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { type Http } from './http.js';
export interface DeviceSpec {
    clientId: string;
    scope: string;
    start: string;
    token: string;
    verificationOrigin: string;
}
/** Keep device_code on Host; only user_code and the validated verification page cross to Client. */
export declare function device(session: AuthorizationSession, http: Http, spec: DeviceSpec): Promise<unknown>;
