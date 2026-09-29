import { apiService } from '@/config/api';

/**
 * Email providers for the CRM's own mail. Exactly one is active at a time (or
 * none, which means the backend's .env mailer).
 *
 * The field schema comes from the backend, so this page renders whatever
 * providers it lists. Secrets are write-only: `secrets_set` says which are
 * stored, and a blank secret in a save keeps the stored value.
 */

export interface MailProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select';
  group: 'connection' | 'sender';
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  /** Display text per option value; the value itself is shown when absent. */
  option_labels?: Record<string, string>;
  default?: string | number;
  /** Shown (and required, if `required`) only while these fields have these values. */
  visible_when?: Record<string, string>;
  /** Always shown, but required only while these fields have these values. */
  required_when?: Record<string, string>;
}

export interface SesTenantState {
  /** This environment's tenant, from SES_TENANT_NAME (or shopify-crm-{APP_ENV}). */
  name: string;
  name_valid: boolean;
  /** False when the name is the derived default rather than set in .env. */
  name_from_env: boolean;
  environment: string;
  identity: string | null;
  /** True when sends carry the tenant right now. */
  in_use: boolean;
  /** Why they don't, when they don't. */
  issue: string | null;
  provisioned: {
    name: string | null;
    region: string | null;
    identity: string | null;
    configuration_set: string | null;
    sending_status: 'ENABLED' | 'REINSTATED' | 'DISABLED' | null;
    provisioned_at: string | null;
  } | null;
}

export interface SesTenantLive {
  exists: boolean;
  sending_status: 'ENABLED' | 'REINSTATED' | 'DISABLED' | null;
  /** null when the IAM key may not list the tenant's resources. */
  identity_associated: boolean | null;
  configuration_set_associated: boolean | null;
  associations_unknown_reason: string | null;
}

export interface MailProvider {
  key: string;
  name: string;
  description: string;
  fields: MailProviderField[];
  /** Non-secret settings only. */
  config: Record<string, string | number | null>;
  secrets_set: string[];
  missing: string[];
  is_configured: boolean;
  is_active: boolean;
  meta: { tenant?: SesTenantState };
  updated_at: string | null;
}

export interface MailProvidersOverview {
  providers: MailProvider[];
  active: string | null;
  /** Where mail goes when no provider is active. */
  fallback: { mailer: string; host: string | null };
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  warnings: string[];
  details: Record<string, unknown>;
}

type Config = Record<string, string | number | null>;

export const mailProviderService = {
  getAll() {
    return apiService.get<MailProvidersOverview>('/integrations/mail-providers');
  },

  save(key: string, config: Config) {
    return apiService.put<MailProvidersOverview>(`/integrations/mail-providers/${key}`, { config });
  },

  activate(key: string) {
    return apiService.post<MailProvidersOverview>(`/integrations/mail-providers/${key}/activate`, {});
  },

  deactivate() {
    return apiService.post<MailProvidersOverview>('/integrations/mail-providers/deactivate', {});
  },

  /** Checks settings, including unsaved edits, without sending any email. */
  test(key: string, config: Config) {
    return apiService.post<ConnectionTestResult>(`/integrations/mail-providers/${key}/test`, { config });
  },

  sesTenantStatus() {
    return apiService.get<{ tenant: SesTenantState; live: SesTenantLive }>('/integrations/mail-providers/ses/tenant');
  },

  provisionSesTenant() {
    return apiService.post<{ tenant: SesTenantState }>('/integrations/mail-providers/ses/tenant', {});
  },
};
