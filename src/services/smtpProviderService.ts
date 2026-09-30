import { apiService } from '@/config/api';

/**
 * SMTP providers belong to the connected app, not to the CRM — the CRM backend
 * proxies every call through to `{app_url}/api/smtp-providers`. So each method
 * takes an `appId`, and a failure can mean the app is unreachable rather than
 * that the request was wrong.
 */

export interface SmtpProvider {
  id: string;
  key: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  /** A mask, never the real password. Use `hasPassword` to know if one is set. */
  password: string;
  hasPassword: boolean;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  /** SES configuration set, sent as the X-SES-CONFIGURATION-SET header. */
  configurationSet: string | null;
  isActive: boolean;
  isEnabled: boolean;
  /** Failover order behind the active provider: lower is tried first. */
  priority: number;
  // SES tenant management. Tenant operations are SES API calls, so they need an
  // IAM key pair -- SMTP credentials cannot call the API.
  awsRegion: string | null;
  awsAccessKeyId: string | null;
  /** A mask, never the real secret. */
  awsSecretAccessKey: string;
  hasAwsSecret: boolean;
  /**
   * ARNs themselves are not returned - they embed the AWS account id, and the
   * UI only needs to know whether they were set.
   */
  hasIdentityArn: boolean;
  hasConfigurationSetArn: boolean;
  /**
   * True when this provider is SES with tenant management configured, in which
   * case every send must name a tenant. Derived from the AWS credentials by the
   * app, not a setting - SES rejects untenanted mail outright.
   */
  requiresTenant: boolean;
  extra: Record<string, any> | null;
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string | null;
  created_at?: string;
  createdAt?: string;
  updatedAt?: string | null;
}

/** What the app is actually sending through right now. */
export interface SmtpStatus {
  activeKey: string | null;
  /** 'db' = a provider row, 'env' = the app's SMTP_* / MAILTRAP_* fallback. */
  source: 'db' | 'env' | null;
  host: string | null;
  fromEmail: string | null;
  configurationSet: string | null;
  /** The failover order actually in effect, primary first. */
  chain: { key: string; name: string; host: string; source: 'db' | 'env' }[];
  envFallbackConfigured: boolean;
  /** False means the app cannot encrypt passwords and saves will be rejected. */
  encryptionConfigured: boolean;
  /** Key-rotation state. Secrets are sealed per key, so progress is countable. */
  encryption: {
    currentKeyId: string | null;
    previousKeyIds: string[];
    /** True while SHOPIFY_API_SECRET is doing the work of a dedicated key. */
    usingLegacyKey: boolean;
    sealedCurrent: number;
    /** Still under an old key: the previous key cannot be removed yet. */
    sealedStale: number;
    /** No configured key opens these; they must be re-entered by hand. */
    unreadable: number;
  };
}

export interface SmtpProviderPayload {
  key: string;
  name?: string;
  host: string;
  port?: number;
  secure?: boolean;
  username?: string | null;
  /** Omit to keep the stored password; send '' to clear it. */
  password?: string;
  fromEmail?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  configurationSet?: string | null;
  isEnabled?: boolean;
  isActive?: boolean;
  priority?: number;
  awsRegion?: string | null;
  awsAccessKeyId?: string | null;
  /** Omit to keep the stored secret; send '' to clear it. */
  awsSecretAccessKey?: string;
  sesIdentityArn?: string | null;
  sesConfigurationSetArn?: string | null;
  extra?: Record<string, any> | null;
}

export const smtpProviderService = {
  async getAll(appId: number) {
    return apiService.get<{ providers: SmtpProvider[]; status: SmtpStatus }>(
      `/apps/${appId}/smtp-providers`
    );
  },

  async save(appId: number, payload: SmtpProviderPayload) {
    return apiService.post<{ provider: SmtpProvider; status: SmtpStatus }>(
      `/apps/${appId}/smtp-providers`,
      payload
    );
  },

  async activate(appId: number, id: string) {
    return apiService.post<{ provider: SmtpProvider; status: SmtpStatus }>(
      `/apps/${appId}/smtp-providers/activate`,
      { id }
    );
  },

  /**
   * Connects and authenticates without sending mail. A failed connection comes
   * back as `success: false` with the SMTP error, not as a thrown error.
   */
  async test(appId: number, id: string) {
    return apiService.post<null>(`/apps/${appId}/smtp-providers/test`, { id });
  },

  /**
   * Rewrites every stored secret under the app's current encryption key. Safe
   * to run repeatedly; safe to run while the previous key is still configured,
   * which is what makes rotation possible without downtime.
   */
  async reencrypt(appId: number) {
    return apiService.post<{
      result: {
        rewritten: number;
        alreadyCurrent: number;
        unreadable: { providerKey: string; field: string; keyId: string | null }[];
      };
      status: SmtpStatus;
    }>(`/apps/${appId}/smtp-providers/reencrypt`, {});
  },

  async remove(appId: number, id: string) {
    return apiService.delete<{ wasActive: boolean; status: SmtpStatus }>(
      `/apps/${appId}/smtp-providers/${id}`
    );
  },
};
