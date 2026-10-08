import { apiService } from '@/config/api';

/**
 * SES tenants live in the connected app's database; the CRM backend proxies
 * every call. So each method takes an `appId`, and a failure can mean the app
 * is unreachable rather than that the request was wrong.
 */

/**
 * What a tenant row is:
 *  - `dedicated` — a premium store's own tenant.
 *  - `free`      — a free-plan store sending under the shared pool. Owns nothing
 *                  in AWS; `poolStatus` is what decides whether it can send.
 *  - `pool`      — the shared free tenant itself (shop `__free__`).
 *  - `platform`  — our own operational mail (shop `__platform__`).
 */
export type SesTenantType = 'dedicated' | 'free' | 'pool' | 'platform';

/** One region's tenant for a store. */
export interface SesTenantRegion {
  id: string;
  providerKey: string;
  region: string;
  tenantName: string;
  tenantType: SesTenantType;
  /** A dedicated tenant given up on downgrade that AWS has not deleted yet. */
  retiredTenantName: string | null;
  /** For `free` rows: the region's pool status (or PAUSED). Null otherwise. */
  poolStatus: string | null;
  /**
   * Whether an ARN is on record. The ARN itself stays server-side: it embeds
   * the AWS account id and the tenant's internal id, and nothing in the UI
   * needs either.
   */
  hasArn: boolean;
  /** Mirror of AWS: PENDING | ENABLED | DISABLED | REINSTATED | ERROR | MISSING, or SHARED for `free` rows. */
  sendingStatus: string;
  /** False means SES will reject sends — identity/config set not associated. */
  resourcesLinked: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}

/** A store, with one tenant per region. */
export interface SesTenantShop {
  shop: string;
  /** The store's tier: `dedicated` if any region holds a dedicated row. */
  tenantType: SesTenantType;
  /** Last 7 days through SES (or since `reputationSince`); null when it sent nothing tracked. */
  reputation: StoreMailTotals | null;
  /** Set when the store was resumed within the last 7 days: its numbers count from then. */
  reputationSince: string | null;
  bouncePct: number;
  complaintPct: number;
  /** Against the Daily check limits; null when it sent too little to be judged. */
  risk: 'ok' | 'warn' | 'pause' | null;
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
  /** Tenants that exist in AWS here (dedicated + pool + platform) — what is billed. */
  tenantCount: number;
  /** Tenants SES would actually accept a send for. */
  healthyCount: number;
  dedicatedCount: number;
  /** Free-plan stores with a row here; all send under the pool. */
  freeStoreCount: number;
  /** ENABLED / DISABLED / … / PAUSED, or null when there is no pool tenant here. */
  poolStatus: string | null;
  platformStatus: string | null;
}

export type SesTenantStatusFilter = 'paused' | 'broken' | 'healthy' | 'risky';
export type SesTenantSort = 'shop' | 'bounce' | 'complaint' | 'sent';

export interface SesTenantList {
  /** Stores matching the filters (all pages). */
  total: number;
  /** Stores per status filter, before the status filter and paging. */
  counts: { all: number; paused: number; broken: number; healthy: number; risky: number };
  /** This page's stores. */
  shops: SesTenantShop[];
  /**
   * Tenants that should exist and do not work, counted against `missingFor`:
   * the shared pool/platform tenants (`__free__`, `__platform__`) and premium
   * stores' dedicated tenants. Free stores are never listed — they send under
   * the pool regardless.
   */
  missingCount: number;
  /** The actual domains, so each can be given a tenant from the UI. */
  missing: string[];
  /** Free stores with no pool row yet. They still send; the backfill adds rows. */
  unassignedCount: number;
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
    params?: {
      search?: string;
      limit?: number;
      skip?: number;
      type?: 'dedicated' | 'free' | 'system';
      /** Only stores with a row in this region (status is judged there). */
      region?: string;
      status?: SesTenantStatusFilter;
      sort?: SesTenantSort;
    } & RegionTarget
  ) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.skip) qs.set('skip', String(params.skip));
    if (params?.providerKey) qs.set('providerKey', params.providerKey);
    if (params?.allProviders) qs.set('allProviders', 'true');
    if (params?.type) qs.set('type', params.type);
    if (params?.region) qs.set('region', params.region);
    if (params?.status) qs.set('status', params.status);
    if (params?.sort && params.sort !== 'shop') qs.set('sort', params.sort);
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

  /** Re-checks one store's plan against Shopify and moves its tenant to match. */
  async reconcile(appId: number, shop: string) {
    return apiService.post<PlanReconcileResult>(`/apps/${appId}/ses-tenants/reconcile`, { shop });
  },

  /** The daily check's settings and recent runs. */
  async monitor(appId: number) {
    return apiService.get<TenantMonitorOverview>(`/apps/${appId}/ses-tenants/monitor`);
  },

  async saveMonitor(appId: number, settings: Partial<TenantMonitorSettings>) {
    return apiService.put<TenantMonitorSettings>(`/apps/${appId}/ses-tenants/monitor`, settings);
  },

  /** Starts the daily check now; poll `monitor` for the outcome. */
  async runCheck(appId: number) {
    return apiService.post<null>(`/apps/${appId}/ses-tenants/monitor/run`, {});
  },
};

export interface PlanReconcileResult {
  shop: string;
  action: 'none' | 'upgraded' | 'downgraded' | 'repaired' | 'assigned' | 'skipped' | 'error';
  tier?: 'dedicated' | 'free';
  ok: boolean;
  detail?: string;
}

export interface TenantMonitorSettings {
  enabled: boolean;
  /** "HH:MM", 24-hour, in `timezone`. */
  runAt: string;
  /** IANA zone, e.g. "Asia/Dhaka". */
  timezone: string;
  recipients: string[];
  /** Email as soon as AWS reports a status change, not only in the daily report. */
  realtimeAlerts: boolean;
  /** Send the daily report even when nothing changed. */
  emailWhenUnchanged: boolean;
  /** Per-store bounce/complaint limits, checked hourly over the last 7 days. */
  reputation: StoreReputationSettings;
}

export interface StoreReputationSettings {
  enabled: boolean;
  /** Stores with fewer recipients in the window are not judged. */
  minSends: number;
  /** Percentages. Over a warn limit: email. Over a pause limit: free stores paused, premium emailed. */
  warnBouncePct: number;
  warnComplaintPct: number;
  pauseBouncePct: number;
  pauseComplaintPct: number;
}

/** A store's last 7 days of mail through SES (recipients). */
export interface StoreMailTotals {
  sent: number;
  bounced: number;
  complained: number;
}

export interface TenantStatusChange {
  shop: string;
  tenantType: string;
  providerKey: string;
  region: string;
  tenantName: string;
  field: 'sendingStatus' | 'resourcesLinked';
  from: string;
  to: string;
  note?: string | null;
}

export interface TenantMonitorRun {
  id: string;
  trigger: 'schedule' | 'manual';
  status: 'running' | 'ok' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  summary: {
    day: string;
    timezone: string;
    emailed: boolean;
    emailError?: string;
    storesChecked: number;
    tenantsSynced: number;
    statusChanges: TenantStatusChange[];
    planChanges: PlanReconcileResult[];
    counts: { statusChanges: number; planChanges: number; syncFailures: number; planErrors: number };
  } | null;
}

export interface TenantMonitorOverview {
  settings: TenantMonitorSettings;
  running: boolean;
  runs: TenantMonitorRun[];
}
