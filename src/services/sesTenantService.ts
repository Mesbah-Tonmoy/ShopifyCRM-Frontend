import { apiService } from '@/config/api';

/**
 * SES tenants live in the connected app's database; the CRM backend proxies
 * every call. So each method takes an `appId`, and a failure can mean the app
 * is unreachable rather than that the request was wrong.
 */

/** One region's tenant for a store. */
export interface SesTenantRegion {
  id: string;
  providerKey: string;
  region: string;
  tenantName: string;
  /**
   * Whether an ARN is on record. The ARN itself stays server-side: it embeds
   * the AWS account id and the tenant's internal id, and nothing in the UI
   * needs either.
   */
  hasArn: boolean;
  /** Mirror of AWS: PENDING | ENABLED | DISABLED | REINSTATED | ERROR. */
  sendingStatus: string;
  /** False means SES will reject sends — identity/config set not associated. */
  resourcesLinked: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}

/** A store, with one tenant per region. */
export interface SesTenantShop {
  shop: string;
  /** Our own gate, applied across all regions at once: 'active' | 'paused'. */
  localStatus: string;
  pausedReason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  regions: SesTenantRegion[];
}

/** One region tenants can live in. */
export interface SesTenantRegionSummary {
  providerKey: string;
  region: string;
  /** The region mail currently leaves from. */
  isActive: boolean;
  priority: number;
  tenantCount: number;
  /** Tenants SES would actually accept a send for. */
  healthyCount: number;
}

export interface SesTenantList {
  total: number;
  shops: SesTenantShop[];
  /**
   * Active stores with no usable tenant yet — counted against `missingFor`,
   * not against every region, since provisioning only targets one.
   */
  missingCount: number;
  /** The actual domains, so each can be given a tenant from the UI. */
  missing: string[];
  /** How many tenant-capable providers (regions) are configured. */
  providerCount: number;
  /** The provider key(s) `missingCount` was computed against. */
  missingFor: string[];
  activeProviderKey: string | null;
  regions: SesTenantRegionSummary[];
}

export interface SesRegionList {
  activeProviderKey: string | null;
  regions: SesTenantRegionSummary[];
}

/** What a region move still needs before the active provider can be flipped. */
export interface MigrationStatus {
  from: { providerKey: string; region: string; isActive: boolean; tenantCount: number };
  to: {
    providerKey: string;
    region: string;
    isActive: boolean;
    tenantCount: number;
    healthyCount: number;
  };
  pendingCount: number;
  pending: string[];
  readyToCutOver: boolean;
  /** Why a cutover would be unsafe right now. Empty means it is safe. */
  blockers: string[];
  /** Steps outside this app's reach — suppression list, warm-up, event destinations. */
  warnings: string[];
}

export interface RegionDeleteSummary {
  providerKey: string;
  region: string;
  attempted: number;
  deleted: number;
  failed: number;
  /** Rows left after this page. Loop while `deleted > 0`, not until this is 0. */
  remaining: number;
  results: {
    providerKey: string;
    region: string;
    tenantName: string;
    awsDeleted: boolean;
    rowDeleted: boolean;
    error?: string;
  }[];
}

/** Which region(s) an operation targets. Omitted means the active one. */
export interface RegionTarget {
  providerKey?: string;
  allProviders?: boolean;
}

export interface ProvisionSummary {
  total: number;
  created: number;
  existing: number;
  failed: number;
  results: {
    shop: string;
    providerKey: string;
    region: string;
    tenantName: string;
    status: 'created' | 'existing' | 'failed';
    resourcesLinked: boolean;
    error?: string;
  }[];
}

export const sesTenantService = {
  async getAll(
    appId: number,
    params?: { search?: string; limit?: number; skip?: number } & RegionTarget
  ) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.skip) qs.set('skip', String(params.skip));
    if (params?.providerKey) qs.set('providerKey', params.providerKey);
    if (params?.allProviders) qs.set('allProviders', 'true');
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    return apiService.get<SesTenantList>(`/apps/${appId}/ses-tenants${suffix}`);
  },

  /**
   * One page of the backfill. Call repeatedly with a rising `skip`.
   *
   * Targets the active region unless `providerKey` names another — which is
   * also how the first act of a region migration is run.
   */
  async provisionAll(appId: number, page: { limit: number; skip: number } & RegionTarget) {
    return apiService.post<ProvisionSummary>(`/apps/${appId}/ses-tenants/provision-all`, page);
  },

  /**
   * Creates or repairs a store's tenant. `rotate` replaces an existing tenant
   * with a freshly named one, deleting the old so it cannot be left behind
   * still billing. Region defaults to the active one.
   */
  async provisionShop(appId: number, shop: string, rotate = false, target?: RegionTarget) {
    return apiService.post<{ results: ProvisionSummary['results'] }>(
      `/apps/${appId}/ses-tenants/provision-shop`,
      { shop, rotate, ...target }
    );
  },

  /** The regions tenants can live in, and which one is live. */
  async regions(appId: number) {
    return apiService.post<SesRegionList>(`/apps/${appId}/ses-tenants/regions`, {});
  },

  /** Read-only: what a move from one region to another still needs. */
  async migrationStatus(appId: number, from: string, to: string) {
    return apiService.post<MigrationStatus>(`/apps/${appId}/ses-tenants/migration-status`, {
      from,
      to,
    });
  },

  /**
   * Deletes every tenant in one region, one page at a time.
   *
   * The app refuses the region it is currently sending from unless
   * `allowActive` is passed — emptying it would stop all mail.
   */
  async removeRegion(
    appId: number,
    providerKey: string,
    opts?: { limit?: number; force?: boolean; allowActive?: boolean }
  ) {
    return apiService.delete<RegionDeleteSummary>(`/apps/${appId}/ses-tenants/region`, {
      providerKey,
      ...opts,
    });
  },

  /**
   * Permanently deletes a store's tenants. The app keeps a row when AWS refuses
   * the delete, so a failure stays visible; `force` drops the row anyway, for
   * when the tenant was already removed in the AWS console.
   */
  async remove(appId: number, shop: string, opts?: { providerKey?: string; force?: boolean }) {
    return apiService.delete<{
      results: {
        providerKey: string;
        region: string;
        tenantName: string;
        awsDeleted: boolean;
        rowDeleted: boolean;
        error?: string;
      }[];
    }>(`/apps/${appId}/ses-tenants`, { shop, ...opts });
  },

  /** Stops the store's email in every region. Reason is mandatory. */
  async pause(appId: number, shop: string, reason: string) {
    return apiService.post<unknown>(`/apps/${appId}/ses-tenants/pause`, { shop, reason });
  },

  async resume(appId: number, shop: string) {
    return apiService.post<unknown>(`/apps/${appId}/ses-tenants/resume`, { shop });
  },

  async sync(appId: number, shop?: string) {
    return apiService.post<{ checked: number; changed: number; errors: number }>(
      `/apps/${appId}/ses-tenants/sync`,
      shop ? { shop } : {}
    );
  },
};
