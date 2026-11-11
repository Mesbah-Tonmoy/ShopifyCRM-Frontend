<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  sesTenantService,
  type MigrationStatus,
  type SesTenantList,
  type SesTenantRegion,
  type SesTenantSort,
  type SesTenantStatusFilter,
  type SesTenantType,
  type StoreMailTotals,
  type TenantMonitorOverview,
  type TenantMonitorSettings,
} from '@/services/sesTenantService';
import { smtpProviderService } from '@/services/smtpProviderService';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { confirmDialog, escapeHtml } from '@/utils/confirm';
import { toneBadgeClasses, toneDotClasses, type Tone } from '@/lib/tones';
import { LoadingIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import AppAlert from '@/components/common/AppAlert.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import AppPagination from '@/components/common/AppPagination.vue';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { errorMessage } from '@/utils/errors';

/**
 * SES tenants by plan, per region: a dedicated tenant for each premium store,
 * one shared free-pool tenant for every free-plan store.
 *
 * Tenants isolate sending reputation, so a single store with a bad list cannot
 * pause the whole SES account. AWS bills per tenant, so only paying stores get
 * their own; the app moves stores between the two as their plan changes. This
 * page is where an operator checks that, stops a store that is behaving badly,
 * sets up the daily check, and moves the whole estate to another AWS region.
 *
 * Two facts shape the layout:
 *
 *  - Provisioning targets **one region** — the active one — rather than every
 *    region at once. A second region is opt-in, so the page has to say which
 *    region any given number refers to, or every count is ambiguous.
 *  - Pausing is applied to **every tenant a store has**, not per region. A
 *    store paused for abuse must not resume by failing over.
 */

const authStore = useAuthStore();
const appsStore = useAppsStore();

const canEdit = computed(() => authStore.hasPermission('ses_tenants.edit'));

const selectedAppId = ref<number | null>(null);
const data = ref<SesTenantList | null>(null);
const search = ref('');
const loading = ref(false);
const loadError = ref<string | null>(null);
/** Shop domain while a per-row action runs. */
const busyShop = ref<string | null>(null);
const syncing = ref(false);

/**
 * Which region the table and the "missing" count describe.
 *
 * Starts null — meaning "whichever region is active" — and is replaced with
 * that region's actual key as soon as the first load reveals it. Naming the
 * region explicitly is what keeps the picker honest: an implicit "active"
 * entry alongside the real regions reads as a duplicate of one of them, since
 * both would carry the same label.
 */
const regionFilter = ref<string | null>(null);
/** Server-side, like the type filter and sort, so paging stays correct. */
const statusFilter = ref<'all' | SesTenantStatusFilter>('all');
const sortBy = ref<SesTenantSort>('shop');

/** Paging is by store; a store's rows in every region come together. */
const page = ref(1);
const pageSize = ref(50);
const PAGE_SIZES = [25, 50, 100, 200];
const pageCount = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / pageSize.value)));
const pageStart = computed(() => (data.value?.total ? (page.value - 1) * pageSize.value + 1 : 0));
const pageEnd = computed(() => Math.min(page.value * pageSize.value, data.value?.total ?? 0));

/**
 * Region details are collapsed by default: the table is what an operator
 * works in, and the one-line summary still flags a region needing attention.
 * Remembered per browser.
 */
const REGION_DETAILS_KEY = 'sesTenants.showRegionDetails';
const readFlag = (key: string) => {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};
const showRegionDetails = ref(readFlag(REGION_DETAILS_KEY));
watch(showRegionDetails, (open) => {
  try {
    window.localStorage.setItem(REGION_DETAILS_KEY, open ? '1' : '0');
  } catch {
    /* private mode: the toggle still works for this visit */
  }
});

/** Daily check panel: settings and run history on separate tabs. */
const monitorTab = ref<'settings' | 'runs'>('settings');

/** Server-side: which kind of rows to list. Free stores can be thousands. */
const typeFilter = ref<'all' | 'dedicated' | 'free' | 'system'>('all');

/** Backfill progress, non-null while it runs. */
const backfill = ref<{
  done: number;
  created: number;
  existing: number;
  failed: number;
  region: string;
} | null>(null);
const cancelBackfill = ref(false);

/** Region teardown progress, non-null while it runs. */
const teardown = ref<{ deleted: number; failed: number; remaining: number; region: string } | null>(
  null
);

const BACKFILL_PAGE = 25;
const TEARDOWN_PAGE = 25;

// --- Region migration ------------------------------------------------------

const showMigration = ref(false);
const migrateFrom = ref<string | null>(null);
const migrateTo = ref<string | null>(null);
const migration = ref<MigrationStatus | null>(null);
const migrationLoading = ref(false);
const migrationError = ref<string | null>(null);

const selectedApp = computed(() => appsStore.apps.find((a) => a.id === selectedAppId.value) || null);

const regions = computed(() => data.value?.regions ?? []);

/** The region the table is currently showing, resolved from the filter. */
const shownRegion = computed(
  () => regions.value.find((r) => r.providerKey === effectiveProviderKey.value) || null
);

/** Migration targets: every region except the one being migrated away from. */
const migrateToOptions = computed(() =>
  regions.value.filter((r) => r.providerKey !== migrateFrom.value)
);

const toRegionOption = (r: (typeof regions.value)[number]) => ({
  value: r.providerKey,
  label: `${r.region}${r.isActive ? ' (active)' : ''}`,
});
const regionOptions = computed(() => regions.value.map(toRegionOption));
const migrateToSelectOptions = computed(() => migrateToOptions.value.map(toRegionOption));

const effectiveProviderKey = computed(
  () => regionFilter.value ?? data.value?.activeProviderKey ?? null
);

/**
 * One row per store-in-this-region.
 *
 * The API groups regions under a store, but an operator reading a table wants
 * one line per thing that can be broken — and a tenant is broken per region.
 * Flattening here keeps the table honest about which region a status belongs
 * to; the store-wide facts (pause) ride along on every one of its rows.
 */
interface TenantRow {
  shop: string;
  isPlatform: boolean;
  isPool: boolean;
  /** This row's own type, which can differ from the store's tier in another region. */
  tenantType: SesTenantType;
  /** The store's last 7 days through SES (or since its last resume). */
  reputation: StoreMailTotals | null;
  reputationSince: string | null;
  /** Against the Daily check limits; null when too little mail to judge. */
  risk: 'ok' | 'warn' | 'pause' | null;
  localStatus: string;
  pausedReason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  region: SesTenantRegion;
  /** Every region this store has a tenant in, for the move/delete dialogs. */
  allRegions: SesTenantRegion[];
}

const allRows = computed<TenantRow[]>(() => {
  const shops = data.value?.shops ?? [];
  const key = effectiveProviderKey.value;

  const rows: TenantRow[] = [];

  for (const shop of shops) {
    // When a region is selected, a store with no tenant there simply has no
    // row — it belongs in "stores without tenants", not in the table as a
    // blank.
    const matching = key ? shop.regions.filter((r) => r.providerKey === key) : shop.regions;

    for (const region of matching) {
      rows.push({
        shop: shop.shop,
        isPlatform: shop.shop === '__platform__',
        isPool: shop.shop === '__free__',
        tenantType: region.tenantType,
        reputation: shop.reputation ?? null,
        reputationSince: shop.reputationSince ?? null,
        risk: shop.risk ?? null,
        localStatus: shop.localStatus,
        pausedReason: shop.pausedReason,
        pausedBy: shop.pausedBy,
        pausedAt: shop.pausedAt,
        region,
        allRegions: shop.regions,
      });
    }
  }

  return rows;
});

const typeLabel = (type: SesTenantType) =>
  ({ dedicated: 'Dedicated', free: 'Free (shared)', pool: 'Free pool', platform: 'Platform' })[type] ||
  type;

const typeTone = (type: SesTenantType): Tone =>
  ({ dedicated: 'info', free: 'neutral', pool: 'success', platform: 'neutral' } as const)[type] ||
  'neutral';

/** Human name for the shared sentinels in lists and dialogs. */
const shopLabel = (shop: string) =>
  shop === '__free__' ? 'Free pool tenant' : shop === '__platform__' ? 'Platform tenant' : shop;

/**
 * A store's rates for display, and how the app judged them against the
 * configured limits: 'pause', 'warn', 'ok', or null when it sent too little.
 */
const rates = (row: TenantRow) => {
  const totals = row.reputation;
  if (!totals || !totals.sent) return null;
  const fmt = (v: number) => (v < 1 ? v.toFixed(2) : v.toFixed(1));
  return {
    bounce: fmt((totals.bounced / totals.sent) * 100),
    complaint: fmt((totals.complained / totals.sent) * 100),
    sent: totals.sent,
    bounced: totals.bounced,
    complained: totals.complained,
    level: row.risk,
  };
};

/** One-line health of a region, for the collapsed summary. */
const regionNeedsAttention = (region: { poolStatus: string | null; platformStatus: string | null; healthyCount: number; tenantCount: number }) =>
  !['ENABLED', 'REINSTATED'].includes(region.poolStatus || '') ||
  !['ENABLED', 'REINSTATED'].includes(region.platformStatus || '') ||
  region.healthyCount < region.tenantCount;

/** The shared pool and platform rows: not stores, so no plan to check. */
const isSystemRow = (row: TenantRow) => row.isPlatform || row.isPool;

// Filtering happens in the app now (so it covers every page, not just this
// one); the table shows the page it was sent.
const rows = allRows;

const counts = computed(
  () => data.value?.counts ?? { all: 0, paused: 0, broken: 0, healthy: 0, risky: 0 }
);

const typeOptions: { value: typeof typeFilter.value; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'dedicated', label: 'Premium (dedicated)' },
  { value: 'free', label: 'Free (shared pool)' },
  { value: 'system', label: 'Pool & platform' },
];

const statusOptions = computed<{ value: typeof statusFilter.value; label: string }[]>(() => [
  { value: 'all', label: `All (${counts.value.all})` },
  { value: 'healthy', label: `Sendable (${counts.value.healthy})` },
  { value: 'broken', label: `Needs attention (${counts.value.broken})` },
  { value: 'paused', label: `Paused (${counts.value.paused})` },
  { value: 'risky', label: `At risk — bounce/complaints (${counts.value.risky})` },
]);

const sortOptions: { value: SesTenantSort; label: string }[] = [
  { value: 'shop', label: 'Store name' },
  { value: 'bounce', label: 'Bounce rate (highest first)' },
  { value: 'complaint', label: 'Complaint rate (highest first)' },
  { value: 'sent', label: 'Mail volume (highest first)' },
];

onMounted(async () => {
  if (!appsStore.apps.length) await appsStore.fetchApps(1, 100);
  if (appsStore.apps.length && selectedAppId.value === null) {
    selectedAppId.value = appsStore.apps[0]!.id;
  }
});

watch(selectedAppId, () => {
  data.value = null;
  loadError.value = null;
  regionFilter.value = null;
  migration.value = null;
  monitor.value = null;
  monitorForm.value = null;
  // Unsaved edits belonged to the previous app; keeping the flag would stop
  // this app's settings from ever filling the form.
  monitorDirty.value = false;
  window.clearTimeout(monitorPoll);
  if (selectedAppId.value !== null) {
    refetchFromFirstPage();
    loadMonitor();
  }
});

/** Any filter change starts again from page 1; changing page refetches. */
const refetchFromFirstPage = () => {
  if (page.value !== 1) page.value = 1; // the page watcher fetches
  else fetchTenants();
};

watch([typeFilter, statusFilter, sortBy, pageSize], refetchFromFirstPage);
watch(page, () => fetchTenants());

watch(regionFilter, () => {
  // Cleared when the app changes; that watcher does its own fetch.
  if (regionFilter.value === null) return;
  refetchFromFirstPage();
});

let searchTimer: number | undefined;
watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(refetchFromFirstPage, 350);
});

/**
 * Each load gets a number; a response that is not from the latest load (the
 * operator switched app, page or filter while it was in flight) is dropped,
 * so a slow answer cannot overwrite a newer one — or another app's data.
 */
let tenantsRequest = 0;

const fetchTenants = async () => {
  if (selectedAppId.value === null) return;
  const requestId = ++tenantsRequest;
  const appId = selectedAppId.value;

  try {
    loading.value = true;
    loadError.value = null;

    const response = await sesTenantService.getAll(appId, {
      search: search.value.trim() || undefined,
      limit: pageSize.value,
      skip: (page.value - 1) * pageSize.value,
      // The table shows one region; stores without a row there are left out
      // here, so the page count is right.
      region: regionFilter.value ?? undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      sort: sortBy.value,
      // Only the "stores without tenants" count is scoped by this — the tenant
      // rows always come back for every region, which is what lets the table
      // show a store's other-region tenants and the move dialog offer them.
      // Omitted means the active region, matching what provisioning would do.
      providerKey: regionFilter.value ?? undefined,
      type: typeFilter.value === 'all' ? undefined : typeFilter.value,
    });

    if (requestId !== tenantsRequest || appId !== selectedAppId.value) return;

    if (response.success && response.data) {
      data.value = response.data;

      // The set shrank under the current page (a resume or delete emptied the
      // last page of a filter): go to the last page that exists.
      const lastPage = Math.max(1, Math.ceil(response.data.total / pageSize.value));
      if (page.value > lastPage) {
        page.value = lastPage; // the page watcher refetches
        return;
      }

      // The first load is the earliest point the active region is known, so
      // that is where the picker's default stops being implicit.
      // Setting it refetches (via the watcher) so the first page is already
      // scoped to that region.
      if (regionFilter.value === null && response.data.activeProviderKey) {
        regionFilter.value = response.data.activeProviderKey;
      }
    } else {
      loadError.value = response.message || 'Failed to load tenants';
    }
  } catch (err) {
    if (requestId !== tenantsRequest) return;
    loadError.value = errorMessage(err, 'Failed to load tenants');
  } finally {
    if (requestId === tenantsRequest) loading.value = false;
  }
};

/**
 * Walks the backfill a page at a time, into one named region.
 *
 * The app provisions sequentially against the SES API — which throttles bursts
 * — so this is deliberately unhurried, and shows a running count so nobody
 * thinks it has hung.
 */
const runBackfill = async (providerKey?: string) => {
  if (selectedAppId.value === null || !data.value) return;

  if (!data.value.providerCount) {
    await confirmDialog({
      title: 'No AWS credentials',
      description:
        'No SMTP provider has an AWS region and access key configured. Add those on the SMTP Setup page first — tenant operations are SES API calls and cannot use SMTP credentials.',
      cancelText: false,
      confirmText: 'OK',
    });
    return;
  }

  const target = providerKey ?? effectiveProviderKey.value ?? undefined;
  const targetRegion = regions.value.find((r) => r.providerKey === target);
  const label = targetRegion?.region || 'the active region';

  const { confirmed } = await confirmDialog({
    title: `Fill ${label}?`,
    html: `<p>For every installed store, in <b>${escapeHtml(label)}</b> only:</p>
           <p><b>Premium stores</b> get (or keep) a dedicated SES tenant.<br>
           <b>Free stores</b> are added to the shared free pool — no AWS call, no charge.<br>
           The free-pool and platform tenants are created if missing.</p>
           <p><b>${escapeHtml(data.value.missingCount)}</b> tenant(s) currently need attention there.</p>
           <p><span class="text-amber-700 dark:text-amber-300">AWS charges per tenant per month, per region — dedicated tenants only.</span></p>`,
    confirmText: 'Start',
  });

  if (!confirmed) return;

  cancelBackfill.value = false;
  backfill.value = { done: 0, created: 0, existing: 0, failed: 0, region: label };

  let skip = 0;

  try {
    // Runs until a page comes back smaller than requested, which means the
    // store list is exhausted.
    for (;;) {
      if (cancelBackfill.value) break;

      const response = await sesTenantService.provisionAll(selectedAppId.value, {
        limit: BACKFILL_PAGE,
        skip,
        providerKey: target,
      });

      if (!response.success || !response.data) {
        toast.error('Backfill stopped', response.message ? { description: response.message } : undefined);
        break;
      }

      const summary = response.data;
      backfill.value = {
        ...backfill.value!,
        done: backfill.value!.done + summary.total,
        created: backfill.value!.created + summary.created,
        existing: backfill.value!.existing + summary.existing,
        failed: backfill.value!.failed + summary.failed,
      };

      // One region at a time now, so `total` is a store count directly.
      if (summary.total < BACKFILL_PAGE) break;

      skip += BACKFILL_PAGE;
    }

    const done = backfill.value;
    toast[done && done.failed ? 'warning' : 'success'](
      `Backfill finished: ${done?.created ?? 0} created, ${done?.failed ?? 0} failed`
    );
    await fetchTenants();
    if (migration.value) await loadMigration();
  } catch (err) {
    toast.error('Backfill failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    backfill.value = null;
  }
};

const provisionOne = async (shop: string, rotate = false, providerKey?: string) => {
  if (selectedAppId.value === null) return;

  try {
    busyShop.value = shop;
    const response = await sesTenantService.provisionShop(selectedAppId.value, shop, rotate, {
      providerKey,
    });

    toast[response.success ? 'success' : 'error'](
      response.success
        ? rotate
          ? 'Tenant replaced'
          : 'Tenant ready'
        : 'Provisioning incomplete',
      response.message ? { description: response.message } : undefined
    );

    await fetchTenants();
  } catch (err) {
    toast.error('Failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    busyShop.value = null;
  }
};

/**
 * Replaces a tenant with a freshly named one, in one region.
 *
 * Make before break: the app creates and links the new tenant while the old
 * one keeps sending, switches over only once the new one is sendable, then
 * deletes the old one (retried daily if AWS refuses). So replacing the free
 * pool does not interrupt free stores' mail.
 */
const rotateTenant = async (row: TenantRow) => {
  const poolDisabled = row.isPool && row.region.sendingStatus === 'DISABLED';

  const { confirmed } = await confirmDialog({
    title: `Replace the ${row.isPool ? 'free pool tenant' : `tenant for ${shopLabel(row.shop)}`}?`,
    html: `<p>A new tenant is created in <b>${escapeHtml(row.region.region)}</b> under a new name and takes over as soon
           as it can send; then the current one is <b>deleted</b>. Mail keeps flowing throughout.</p>
           <p>Its sending history and reputation in SES start over. Use "Re-provision" instead if
           you only want to repair a broken tenant.</p>
           ${
             row.isPool
               ? `<p><span class="text-amber-700 dark:text-amber-300"><b>Every free-plan store moves to the new tenant.</b>
                  ${
                    poolDisabled
                      ? `AWS disabled the current one for its reputation. Pause the stores that caused it
                         first — otherwise the same mail disables the new tenant too, and the account-level
                         rates AWS also watches keep rising.`
                      : ''
                  }</span></p>`
               : ''
           }`,
    confirmText: 'Replace',
    destructive: true,
  });

  if (!confirmed) return;
  await provisionOne(row.shop, true, row.region.providerKey);
};

/**
 * Gives one store a tenant in a region it does not have one in.
 *
 * The single-store counterpart of a migration: assign a store to another
 * region, or pre-stage it before switching regions wholesale.
 */
const addToRegion = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  const have = new Set(row.allRegions.map((r) => r.providerKey));
  const options = regions.value.filter((r) => !have.has(r.providerKey));

  if (!options.length) {
    toast.info(`${row.shop} already has a tenant in every region`);
    return;
  }

  const { confirmed, value: providerKey } = await confirmDialog({
    title: `Add a tenant for ${row.shop}`,
    input: {
      type: 'select',
      options: options.map(toRegionOption),
      placeholder: 'Choose a region',
      validate: (v) => (v ? null : 'Pick a region'),
    },
    html: `<p>Creates a tenant in a second region. The store keeps its existing tenant —
           nothing is deleted.</p><p><span class="text-amber-700 dark:text-amber-300">AWS charges per tenant per
           month, per region.</span></p>`,
    confirmText: 'Create tenant',
  });

  if (!confirmed || !providerKey) return;
  await provisionOne(row.shop, false, String(providerKey));
};

/**
 * Permanently deletes a store's tenant.
 *
 * Scoped to one region when the store has more than one, because deleting the
 * region an operator is looking at is almost never meant to mean "and the
 * other one too".
 */
const removeTenant = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  const isActiveRegion = row.region.providerKey === data.value?.activeProviderKey;
  const name = shopLabel(row.shop);

  const consequence =
    row.tenantType === 'free'
      ? `<p>This store has no tenant of its own — only its free-pool record is removed, and it
         keeps sending under the pool. Any pause on it is lost.</p>`
      : row.isPool
        ? `<p><span class="text-destructive"><b>Every free-plan store in ${escapeHtml(row.region.region)} sends
           under this tenant.</b> They all stop sending from this region until it exists again
           (the daily check recreates it).</span></p>`
        : row.isPlatform
          ? `<p><span class="text-destructive">Our own alerts and notices send under this tenant.</span></p>`
          : isActiveRegion
            ? `<p>This is the active sending region: the store falls back to the free pool until
               the next plan check gives it a new tenant.</p>`
            : '';

  const { confirmed, value: force } = await confirmDialog({
    title: `Delete the tenant for ${name}?`,
    html: `<p>Permanently deletes its tenant in <b>${escapeHtml(row.region.region)}</b> and stops that
           per-tenant AWS charge.</p>${consequence}`,
    input: { type: 'checkbox', label: 'Force: drop our record even if AWS refuses' },
    confirmText: 'Delete permanently',
    destructive: true,
  });

  if (!confirmed) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.remove(selectedAppId.value, row.shop, {
      providerKey: row.region.providerKey,
      force: force === true,
    });

    toast[response.success ? 'success' : 'error'](
      response.success ? 'Deleted' : 'Deletion incomplete',
      response.message ? { description: response.message } : undefined
    );

    await fetchTenants();
  } catch (err) {
    toast.error('Could not delete', { description: errorMessage(err, 'Request failed') });
  } finally {
    busyShop.value = null;
  }
};

const pause = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  const { confirmed, value: reason } = await confirmDialog({
    title: `Pause email for ${shopLabel(row.shop)}?`,
    description: row.isPool
      ? 'Every free-plan store stops sending immediately, in every region. Give a reason — it is recorded and shown here.'
      : row.tenantType === 'free'
        ? 'This store stops sending immediately. It shares the free pool, so the pause is ours alone — AWS and the other free stores are unaffected. Give a reason — it is recorded and shown here.'
        : 'All email for this store stops immediately, in every region it has a tenant in. Give a reason — it is recorded and shown here.',
    input: {
      type: 'textarea',
      placeholder: 'e.g. high complaint rate, suspected list purchase',
      validate: (value) =>
        typeof value === 'string' && value.trim() ? null : 'A reason is required',
    },
    confirmText: 'Pause sending',
    destructive: true,
  });

  if (!confirmed || typeof reason !== 'string' || !reason) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.pause(
      selectedAppId.value,
      row.shop,
      reason.trim()
    );

    toast[response.success ? 'success' : 'error'](response.message || 'Paused');
    await fetchTenants();
  } catch (err) {
    toast.error('Could not pause', { description: errorMessage(err, 'Request failed') });
  } finally {
    busyShop.value = null;
  }
};

const resume = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  const { confirmed } = await confirmDialog({
    title: `Resume email for ${row.shop}?`,
    description: row.pausedReason ? `It was paused because: ${row.pausedReason}` : undefined,
    confirmText: 'Resume sending',
  });

  if (!confirmed) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.resume(selectedAppId.value, row.shop);

    toast[response.success ? 'success' : 'error'](response.message || 'Resumed');
    await fetchTenants();
  } catch (err) {
    toast.error('Could not resume', { description: errorMessage(err, 'Request failed') });
  } finally {
    busyShop.value = null;
  }
};

const syncFromAws = async () => {
  if (selectedAppId.value === null) return;

  try {
    syncing.value = true;
    const response = await sesTenantService.sync(selectedAppId.value);
    toast.success(response.message || 'Synced');
    await fetchTenants();
    if (migration.value) await loadMigration();
  } catch (err) {
    toast.error('Sync failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    syncing.value = false;
  }
};

// --- Migration -------------------------------------------------------------

const openMigration = () => {
  showMigration.value = !showMigration.value;

  if (showMigration.value && !migrateFrom.value) {
    migrateFrom.value = data.value?.activeProviderKey ?? null;
    migrateTo.value =
      regions.value.find((r) => r.providerKey !== migrateFrom.value)?.providerKey ?? null;
    if (migrateFrom.value && migrateTo.value) loadMigration();
  }
};

watch([migrateFrom, migrateTo], () => {
  migration.value = null;
  if (migrateFrom.value && migrateTo.value && migrateFrom.value !== migrateTo.value) loadMigration();
});

const loadMigration = async () => {
  if (selectedAppId.value === null || !migrateFrom.value || !migrateTo.value) return;

  try {
    migrationLoading.value = true;
    migrationError.value = null;

    const response = await sesTenantService.migrationStatus(
      selectedAppId.value,
      migrateFrom.value,
      migrateTo.value
    );

    if (response.success && response.data) {
      migration.value = response.data;
    } else {
      migrationError.value = response.message || 'Could not read migration status';
    }
  } catch (err) {
    migrationError.value = errorMessage(err, 'Request failed');
  } finally {
    migrationLoading.value = false;
  }
};

/**
 * Flips which region mail leaves from.
 *
 * Gated on the app's own readiness check rather than on the operator's
 * judgement: cutting over to a region where some stores have no sendable
 * tenant silently stops their mail, and that is not visible until someone
 * complains.
 */
const cutOver = async () => {
  if (selectedAppId.value === null || !migration.value) return;

  const target = migration.value.to;

  const warnings = migration.value.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');

  const { confirmed } = await confirmDialog({
    title: `Send all mail from ${target.region}?`,
    html: `<p>Every store starts sending through
             <b>${escapeHtml(target.region)}</b> immediately.</p>
           <p class="mt-3"><b>Before you confirm:</b></p>
           <ul class="list-disc space-y-1 pl-5 text-[13px] text-amber-700 dark:text-amber-300">${warnings}</ul>`,
    input: {
      type: 'checkbox',
      label: 'I have copied the suppression list to the new region',
      validate: (v) => (v ? null : 'Confirm the suppression list has been copied'),
    },
    confirmText: `Switch to ${target.region}`,
    destructive: true,
  });

  if (!confirmed) return;

  try {
    // `activate` takes the provider's id, but everything on this page is keyed
    // by providerKey, so the id is looked up at the moment of use rather than
    // held in a second piece of state that could go stale.
    const response = await smtpProviderService.getAll(selectedAppId.value);
    const match = response.data?.providers.find((p) => p.key === target.providerKey);

    if (!match) {
      toast.error('Provider not found', {
        description: `No SMTP provider with key "${target.providerKey}" — it may have been renamed or removed.`,
      });
      return;
    }

    const activated = await smtpProviderService.activate(selectedAppId.value, match.id);

    toast[activated.success ? 'success' : 'error'](
      activated.success ? `Now sending from ${target.region}` : activated.message || 'Cutover failed'
    );

    await fetchTenants();
    await loadMigration();
  } catch (err) {
    toast.error('Cutover failed', { description: errorMessage(err, 'Request failed') });
  }
};

/**
 * Empties a region, a page at a time.
 *
 * The last act of a migration. Loops while a page still deletes something
 * rather than until nothing remains: rows AWS refuses stay behind, and a
 * "until zero" loop would spin on them forever.
 */
const tearDownRegion = async (providerKey: string) => {
  if (selectedAppId.value === null) return;

  const region = regions.value.find((r) => r.providerKey === providerKey);
  const isActive = providerKey === data.value?.activeProviderKey;
  const label = region?.region || providerKey;

  const { confirmed } = await confirmDialog({
    title: `Delete every tenant in ${label}?`,
    html: `<p>Permanently deletes <b>${escapeHtml(region?.tenantCount ?? 0)}</b> tenant(s) and stops their AWS
           charges.</p>
           ${
             isActive
               ? `<p><span class="text-destructive"><b>${escapeHtml(label)} is the active sending region.</b>
                  Doing this stops all mail — SES rejects sends that name no tenant. Switch the
                  active region first.</span></p>`
               : `<p>${escapeHtml(label)} is not the active region, so sending is unaffected. Failover
                  into it will no longer be possible.</p>`
           }`,
    input: {
      type: 'text',
      placeholder: `Type ${label} to confirm`,
      validate: (v) => (v === label ? null : `Type ${label} exactly`),
    },
    confirmText: 'Delete them all',
    destructive: true,
  });

  if (!confirmed) return;

  teardown.value = { deleted: 0, failed: 0, remaining: region?.tenantCount ?? 0, region: label };

  try {
    for (;;) {
      const response = await sesTenantService.removeRegion(selectedAppId.value, providerKey, {
        limit: TEARDOWN_PAGE,
        allowActive: isActive,
      });

      if (!response.data) {
        toast.error('Teardown stopped', response.message ? { description: response.message } : undefined);
        break;
      }

      const page = response.data;
      teardown.value = {
        ...teardown.value!,
        deleted: teardown.value!.deleted + page.deleted,
        failed: page.failed,
        remaining: page.remaining,
      };

      // Nothing deleted means every remaining row is stuck — stop rather than
      // loop on rows AWS keeps refusing.
      if (page.deleted === 0) break;
      if (page.remaining === 0) break;
    }

    const done = teardown.value;
    toast[done && done.failed ? 'warning' : 'success'](
      done && done.failed ? 'Teardown incomplete' : 'Region emptied',
      {
        description: `${done?.deleted ?? 0} deleted, ${done?.remaining ?? 0} left${
          done?.failed ? ` (${done.failed} refused by AWS)` : ''
        }`,
      }
    );

    await fetchTenants();
    if (migration.value) await loadMigration();
  } catch (err) {
    toast.error('Teardown failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    teardown.value = null;
  }
};

// --- Plan check --------------------------------------------------------------

/**
 * Asks the app to look up the store's plan in Shopify now and move its tenant
 * to match, instead of waiting for the daily check.
 */
const recheckPlan = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.reconcile(selectedAppId.value, row.shop);
    toast[response.success ? 'success' : 'error'](
      response.success ? 'Plan checked' : 'Plan check incomplete',
      response.message ? { description: response.message } : undefined
    );
    await fetchTenants();
  } catch (err) {
    toast.error('Plan check failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    busyShop.value = null;
  }
};

// --- Daily check -------------------------------------------------------------

const showMonitor = ref(false);
const monitor = ref<TenantMonitorOverview | null>(null);
const monitorError = ref<string | null>(null);
const monitorSaving = ref(false);
const monitorStarting = ref(false);
/** Editable copy of the settings; recipients as text, one per line. */
const monitorForm = ref<(Omit<TenantMonitorSettings, 'recipients'> & { recipients: string }) | null>(
  null
);
/** Set once the operator edits the form, so a background refresh keeps their edits. */
const monitorDirty = ref(false);
let monitorPoll: number | undefined;

const timeZones = computed<string[]>(() => {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const all: string[] = intl.supportedValuesOf?.('timeZone') ?? [
    'UTC',
    'Asia/Dhaka',
    'Asia/Kolkata',
    'Europe/London',
    'America/New_York',
  ];
  const current = monitorForm.value?.timezone;
  return current && !all.includes(current) ? [current, ...all] : all;
});

const timeZoneOptions = computed(() => timeZones.value.map((zone) => ({ value: zone, label: zone })));

const lastRun = computed(() => monitor.value?.runs[0] ?? null);

/**
 * The form marks itself dirty on native input/change events, which the
 * checkbox and select controls do not fire, so their handlers mark it too.
 */
const markMonitorDirty = () => {
  monitorDirty.value = true;
};

const setTimezone = (value: string) => {
  if (!monitorForm.value) return;
  monitorForm.value.timezone = value;
  markMonitorDirty();
};

let monitorRequest = 0;
let unmounted = false;

const loadMonitor = async () => {
  if (selectedAppId.value === null) return;
  const requestId = ++monitorRequest;
  const appId = selectedAppId.value;

  try {
    monitorError.value = null;
    const response = await sesTenantService.monitor(appId);
    // Another app's settings must never land in this app's form: saving would
    // write them here.
    if (requestId !== monitorRequest || appId !== selectedAppId.value) return;
    if (response.success && response.data) {
      monitor.value = response.data;
      if (!monitorDirty.value) {
        const settings = response.data.settings;
        monitorForm.value = { ...settings, recipients: settings.recipients.join('\n') };
      }
      schedulePoll();
    } else {
      monitorError.value = response.message || 'Could not load the daily check';
      schedulePoll(); // a failed refresh mid-run keeps trying, not freezes
    }
  } catch (err) {
    if (requestId !== monitorRequest) return;
    monitorError.value = errorMessage(err, 'Could not load the daily check');
    schedulePoll();
  }
};

/** While a run is going, refresh every 10s so its result shows when it lands. */
const schedulePoll = () => {
  window.clearTimeout(monitorPoll);
  if (!unmounted && monitor.value?.running) {
    monitorPoll = window.setTimeout(async () => {
      await loadMonitor();
      if (!monitor.value?.running) await fetchTenants();
    }, 10000);
  }
};

const saveMonitor = async () => {
  if (selectedAppId.value === null || !monitorForm.value) return;

  const recipients = monitorForm.value.recipients
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);

  try {
    monitorSaving.value = true;
    const reputation = Object.fromEntries(
      Object.entries(monitorForm.value.reputation).filter(
        ([key, value]) => key === 'enabled' || (typeof value === 'number' && Number.isFinite(value))
      )
    );
    const response = await sesTenantService.saveMonitor(selectedAppId.value, {
      ...monitorForm.value,
      reputation: reputation as unknown as TenantMonitorSettings['reputation'],
      recipients,
    });

    if (response.success) {
      toast.success(response.message || 'Saved');
      monitorDirty.value = false;
      await loadMonitor();
    } else {
      toast.error('Not saved', response.message ? { description: response.message } : undefined);
    }
  } catch (err) {
    toast.error('Not saved', { description: errorMessage(err, 'Request failed') });
  } finally {
    monitorSaving.value = false;
  }
};

const runCheckNow = async () => {
  if (selectedAppId.value === null) return;

  const { confirmed } = await confirmDialog({
    title: 'Run the daily check now?',
    description:
      "Checks every store's plan against Shopify, moves tenants to match, retries old tenant deletions, and syncs every tenant from AWS. It can take a few minutes with many stores. An email goes out if anything changed.",
    confirmText: 'Run now',
  });
  if (!confirmed) return;

  try {
    monitorStarting.value = true;
    const response = await sesTenantService.runCheck(selectedAppId.value);
    toast[response.success ? 'success' : 'error'](response.message || 'Started');
    await loadMonitor();
  } catch (err) {
    toast.error('Could not start', { description: errorMessage(err, 'Request failed') });
  } finally {
    monitorStarting.value = false;
  }
};

onBeforeUnmount(() => {
  unmounted = true;
  window.clearTimeout(monitorPoll);
});

const runStatusTone = (status: string): Tone =>
  status === 'ok' ? 'success' : status === 'failed' ? 'danger' : 'warning';

/** Header button dot: running, switched off, last run failed, or fine. */
const monitorTone = computed<Tone>(() =>
  !monitor.value
    ? 'neutral'
    : monitor.value.running
      ? 'warning'
      : !monitor.value.settings.enabled
        ? 'neutral'
        : lastRun.value?.status === 'failed'
          ? 'danger'
          : 'success'
);

// --- Presentation ----------------------------------------------------------

const statusTone = (status: string): Tone => {
  if (status === 'ENABLED') return 'success';
  if (status === 'REINSTATED') return 'info';
  if (status === 'DISABLED') return 'danger';
  if (status === 'ERROR') return 'danger';
  // Gone from AWS, so amber rather than red: the store still exists, and
  // Re-provision fixes it.
  if (status === 'MISSING') return 'warning';
  if (status === 'PAUSED') return 'danger';
  return 'neutral';
};

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

const relative = (value: string | null) => {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
</script>

<template>
  <div>
    <PageHeader
      title="SES Tenants"
      description="A dedicated SES tenant per premium store and one shared pool for free stores, so no single store's reputation can pause the whole account"
    >
      <template #actions>
        <Button
          v-if="selectedAppId !== null"
          @click="showMonitor = !showMonitor"
          variant="outline"
        >
          <span v-if="monitor" class="size-2 rounded-full" :class="toneDotClasses[monitorTone]" />
          {{ showMonitor ? 'Hide daily check' : 'Daily check' }}
        </Button>
        <Button
          v-if="selectedAppId !== null && regions.length > 1"
          @click="openMigration"
          variant="outline"
        >
          {{ showMigration ? 'Hide' : 'Move region' }}
        </Button>
        <Button
          v-if="selectedAppId !== null"
          @click="syncFromAws"
          :disabled="syncing || loading"
          variant="outline"
        >
          <Spinner v-if="syncing" />
          Sync from AWS
        </Button>
        <Button
          v-if="canEdit && selectedAppId !== null"
          @click="runBackfill()"
          :disabled="!!backfill || !!teardown || loading"
        >
          Fill active region
        </Button>
      </template>
    </PageHeader>

    <!-- App picker, region lens, search, status filter -->
    <Card class="mb-6 py-4">
      <CardContent class="flex flex-wrap items-center gap-4 px-4">
        <SelectInput v-model="selectedAppId" :options="appsStore.appOptions" label="App" placeholder="Select App" select-class="w-56" />

        <SelectInput v-if="regions.length" v-model="regionFilter" :options="regionOptions" label="Region" select-class="w-52" />

        <SelectInput v-if="data" v-model="typeFilter" :options="typeOptions" label="Type" select-class="w-44" />

        <SelectInput v-if="data" v-model="statusFilter" :options="statusOptions" label="Status" select-class="w-48" />

        <SelectInput v-if="data" v-model="sortBy" :options="sortOptions" label="Sort" select-class="w-48" />

        <SearchInput
          v-if="selectedAppId !== null"
          v-model="search"
          placeholder="Search by store domain..."
          container-class="max-w-[280px] flex-1"
        />
      </CardContent>
    </Card>

    <!-- Progress banners -->
    <AppAlert v-if="backfill" tone="info" class="mb-6 py-4">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <LoadingIcon size="sm" />
          <p>
            Provisioning in <b>{{ backfill.region }}</b>… <b>{{ backfill.created }}</b> created,
            <b>{{ backfill.existing }}</b> already existed,
            <b>{{ backfill.failed }}</b> failed
            <span class="text-muted-foreground">({{ backfill.done }} processed)</span>
          </p>
        </div>
        <Button
          @click="cancelBackfill = true"
          variant="outline"
          size="sm"
        >
          Stop after this page
        </Button>
      </div>
    </AppAlert>

    <AppAlert v-if="teardown" tone="danger" class="mb-6 py-4">
      <div class="flex items-center gap-3">
        <LoadingIcon size="sm" />
        <p>
          Deleting tenants in <b>{{ teardown.region }}</b>… <b>{{ teardown.deleted }}</b> deleted,
          <b>{{ teardown.remaining }}</b> left
          <span v-if="teardown.failed" class="font-medium text-destructive">
            ({{ teardown.failed }} refused by AWS)
          </span>
        </p>
      </div>
    </AppAlert>

    <Empty v-if="selectedAppId === null" class="border p-8">
      <EmptyHeader>
        <EmptyDescription>Select an app to manage its SES tenants.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <AppAlert v-else-if="loadError" tone="danger" title="Could not reach the app" class="p-6">
      <div class="mt-0.5">{{ loadError }}</div>
      <div class="mt-2">Tenants live in the app's own database, so this page needs the app online.</div>
    </AppAlert>

    <template v-else>
      <!-- Daily check: schedule, recipients, recent runs -->
      <Card v-if="showMonitor" class="mb-6">
        <CardHeader>
          <CardTitle class="font-heading font-semibold">Daily tenant check</CardTitle>
          <CardDescription class="max-w-2xl">
            Once a day the app checks every store's plan in Shopify and moves its tenant to match
            (premium → dedicated, free → shared pool), retries old tenant deletions, and syncs every
            tenant's status from AWS. If anything changed or failed, the recipients get one email.
            Every hour it also checks each store's bounce and complaint rate.
          </CardDescription>
          <CardAction v-if="canEdit">
            <Button
              @click="runCheckNow"
              :disabled="monitorStarting || !!monitor?.running"
              variant="outline"
              size="sm"
            >
              <Spinner v-if="monitorStarting || monitor?.running" />
              {{ monitor?.running ? 'Running…' : 'Run now' }}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <AppAlert v-if="monitorError" tone="danger" class="mb-4">{{ monitorError }}</AppAlert>

          <Tabs v-model="monitorTab">
            <TabsList variant="line">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="runs">
                Recent runs{{ monitor ? ` (${monitor.runs.length})` : '' }}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings">
              <form
                v-if="monitorForm"
                class="grid gap-4 mt-2 md:grid-cols-2"
                @submit.prevent="saveMonitor"
                @input="monitorDirty = true"
                @change="monitorDirty = true"
              >
                <div class="flex flex-col gap-3">
                  <Field orientation="horizontal">
                    <Checkbox
                      id="monitor-enabled"
                      v-model="monitorForm.enabled"
                      :disabled="!canEdit"
                      @update:model-value="markMonitorDirty"
                    />
                    <FieldLabel for="monitor-enabled" class="font-normal">Run the check every day</FieldLabel>
                  </Field>

                  <div class="flex flex-wrap items-end gap-3">
                    <Field class="w-auto">
                      <FieldLabel for="monitor-run-at">Time</FieldLabel>
                      <Input
                        id="monitor-run-at"
                        v-model="monitorForm.runAt"
                        type="time"
                        required
                        :disabled="!canEdit || !monitorForm.enabled"
                      />
                    </Field>
                    <Field class="w-56">
                      <FieldLabel for="monitor-timezone">Time zone</FieldLabel>
                      <SelectInput
                        id="monitor-timezone"
                        :model-value="monitorForm.timezone"
                        :options="timeZoneOptions"
                        :disabled="!canEdit || !monitorForm.enabled"
                        select-class="w-full"
                        @update:model-value="setTimezone"
                      />
                    </Field>
                  </div>

                  <Field orientation="horizontal">
                    <Checkbox
                      id="monitor-realtime-alerts"
                      v-model="monitorForm.realtimeAlerts"
                      :disabled="!canEdit"
                      @update:model-value="markMonitorDirty"
                    />
                    <FieldLabel for="monitor-realtime-alerts" class="font-normal">
                      Also email the moment AWS pauses or resumes a tenant
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="monitor-email-unchanged"
                      v-model="monitorForm.emailWhenUnchanged"
                      :disabled="!canEdit"
                      @update:model-value="markMonitorDirty"
                    />
                    <FieldLabel for="monitor-email-unchanged" class="font-normal">
                      Send the daily email even when nothing changed
                    </FieldLabel>
                  </Field>

                  <FieldSet class="mt-1 gap-3 rounded-lg border p-3">
                    <FieldLegend variant="label" class="px-1">Store reputation (hourly)</FieldLegend>
                    <Field orientation="horizontal">
                      <Checkbox
                        id="monitor-reputation-enabled"
                        v-model="monitorForm.reputation.enabled"
                        :disabled="!canEdit"
                        @update:model-value="markMonitorDirty"
                      />
                      <FieldLabel for="monitor-reputation-enabled" class="font-normal">
                        Watch each store's bounce and complaint rate (last 7 days)
                      </FieldLabel>
                    </Field>
                    <FieldDescription class="text-xs">
                      Over a pause limit, a <b>free</b> store is paused so the shared pool stays healthy; a
                      premium store only triggers an email. A pause also needs at least 3 hard bounces or 2
                      complaints. Over a warning limit: email, once a day per store.
                      AWS reviews at 5% bounce / 0.1% complaints.
                    </FieldDescription>
                    <div class="grid grid-cols-2 gap-2">
                      <Field class="gap-1.5">
                        <FieldLabel for="monitor-warn-bounce" class="text-xs font-normal text-muted-foreground">Warn: bounce %</FieldLabel>
                        <Input id="monitor-warn-bounce" v-model.number="monitorForm.reputation.warnBouncePct" type="number" step="0.1" min="0.1" max="50" :disabled="!canEdit || !monitorForm.reputation.enabled" />
                      </Field>
                      <Field class="gap-1.5">
                        <FieldLabel for="monitor-pause-bounce" class="text-xs font-normal text-muted-foreground">Pause: bounce %</FieldLabel>
                        <Input id="monitor-pause-bounce" v-model.number="monitorForm.reputation.pauseBouncePct" type="number" step="0.1" min="0.1" max="50" :disabled="!canEdit || !monitorForm.reputation.enabled" />
                      </Field>
                      <Field class="gap-1.5">
                        <FieldLabel for="monitor-warn-complaint" class="text-xs font-normal text-muted-foreground">Warn: complaint %</FieldLabel>
                        <Input id="monitor-warn-complaint" v-model.number="monitorForm.reputation.warnComplaintPct" type="number" step="0.01" min="0.01" max="5" :disabled="!canEdit || !monitorForm.reputation.enabled" />
                      </Field>
                      <Field class="gap-1.5">
                        <FieldLabel for="monitor-pause-complaint" class="text-xs font-normal text-muted-foreground">Pause: complaint %</FieldLabel>
                        <Input id="monitor-pause-complaint" v-model.number="monitorForm.reputation.pauseComplaintPct" type="number" step="0.01" min="0.01" max="5" :disabled="!canEdit || !monitorForm.reputation.enabled" />
                      </Field>
                      <Field class="col-span-2 gap-1.5">
                        <FieldLabel for="monitor-min-sends" class="text-xs font-normal text-muted-foreground">Ignore stores with fewer recipients than</FieldLabel>
                        <Input id="monitor-min-sends" v-model.number="monitorForm.reputation.minSends" type="number" step="1" min="1" :disabled="!canEdit || !monitorForm.reputation.enabled" class="w-32" />
                      </Field>
                    </div>
                  </FieldSet>
                </div>

                <div class="flex flex-col gap-2">
                  <Field>
                    <FieldLabel for="monitor-recipients">Recipients (one per line)</FieldLabel>
                    <Textarea
                      id="monitor-recipients"
                      v-model="monitorForm.recipients"
                      rows="4"
                      :disabled="!canEdit"
                      placeholder="ops@example.com"
                      class="font-mono"
                    />
                  </Field>
                  <div v-if="canEdit" class="flex justify-end">
                    <Button
                      type="submit"
                      :disabled="monitorSaving"
                      size="sm"
                    >
                      {{ monitorSaving ? 'Saving…' : 'Save settings' }}
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="runs">
              <div v-if="monitor?.runs.length" class="mt-2">
                <p class="text-xs text-muted-foreground">The last 10 runs, newest first — scheduled and manual.</p>
                <div class="mt-2 overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader class="bg-muted/50">
                      <TableRow class="text-xs">
                        <TableHead class="h-9 text-muted-foreground">Started</TableHead>
                        <TableHead class="h-9 text-muted-foreground">Trigger</TableHead>
                        <TableHead class="h-9 text-muted-foreground">Result</TableHead>
                        <TableHead class="h-9 text-muted-foreground">Stores</TableHead>
                        <TableHead class="h-9 text-muted-foreground">Status changes</TableHead>
                        <TableHead class="h-9 text-muted-foreground">Plan changes</TableHead>
                        <TableHead class="h-9 text-muted-foreground">Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="run in monitor.runs" :key="run.id">
                        <TableCell class="align-top" :title="formatDate(run.startedAt)">
                          {{ relative(run.startedAt) }}
                        </TableCell>
                        <TableCell class="align-top text-muted-foreground">{{ run.trigger === 'schedule' ? 'scheduled' : 'manual' }}</TableCell>
                        <TableCell class="align-top whitespace-normal">
                          <StatusBadge :tone="runStatusTone(run.status)">{{ run.status }}</StatusBadge>
                          <p v-if="run.error" class="text-xs text-destructive mt-1 max-w-xs">{{ run.error }}</p>
                        </TableCell>
                        <TableCell class="align-top">{{ run.summary?.storesChecked ?? '—' }}</TableCell>
                        <TableCell class="align-top whitespace-normal">
                          {{ run.summary?.counts.statusChanges ?? '—' }}
                          <ul v-if="run.summary?.statusChanges.length" class="mt-1 text-xs text-muted-foreground">
                            <li v-for="(c, i) in run.summary.statusChanges.slice(0, 5)" :key="i">
                              {{ shopLabel(c.shop) }} ({{ c.region }}): {{ c.from }} → <b>{{ c.to }}</b>
                            </li>
                          </ul>
                        </TableCell>
                        <TableCell class="align-top whitespace-normal">
                          {{ run.summary?.counts.planChanges ?? '—' }}
                          <span v-if="run.summary?.counts.planErrors" class="text-destructive">
                            ({{ run.summary.counts.planErrors }} failed)
                          </span>
                          <ul v-if="run.summary?.planChanges.length" class="mt-1 text-xs text-muted-foreground">
                            <li v-for="(c, i) in run.summary.planChanges.slice(0, 5)" :key="i">
                              {{ c.shop }}: {{ c.action }}
                            </li>
                          </ul>
                        </TableCell>
                        <TableCell class="align-top text-xs">
                          <span v-if="!run.summary">—</span>
                          <StatusBadge v-else-if="run.summary.emailed" tone="success">sent</StatusBadge>
                          <StatusBadge v-else-if="run.summary.emailError" tone="danger" :title="run.summary.emailError">failed</StatusBadge>
                          <span v-else class="text-muted-foreground">nothing to report</span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              <p v-else-if="monitor" class="text-sm text-muted-foreground mt-2">No runs yet.</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <!-- Region summary: one line per region; details on demand -->
      <Card v-if="regions.length" class="mb-4 py-2.5">
        <CardContent class="flex items-center gap-x-5 gap-y-2 flex-wrap px-4">
          <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Regions</span>
          <div
            v-for="region in regions"
            :key="region.providerKey"
            class="flex items-center gap-2 text-xs"
          >
            <span
              class="size-2 rounded-full"
              :class="toneDotClasses[regionNeedsAttention(region) ? 'danger' : 'success']"
              :title="regionNeedsAttention(region) ? 'Pool, platform or a tenant here needs attention' : 'All tenants here can send'"
            />
            <span class="font-mono font-semibold">{{ region.region }}</span>
            <StatusBadge :tone="region.isActive ? 'success' : 'neutral'">
              {{ region.isActive ? 'sending' : 'standby' }}
            </StatusBadge>
            <span class="text-muted-foreground">
              {{ region.dedicatedCount }} premium · {{ region.freeStoreCount }} free ·
              {{ region.healthyCount }}/{{ region.tenantCount }} tenants sendable
            </span>
            <StatusBadge
              v-if="!['ENABLED', 'REINSTATED'].includes(region.poolStatus || '')"
              :tone="statusTone(region.poolStatus || 'MISSING')"
            >
              pool: {{ region.poolStatus || 'none' }}
            </StatusBadge>
          </div>
          <Button
            type="button"
            @click="showRegionDetails = !showRegionDetails"
            variant="link"
            size="xs"
            class="ml-auto h-auto p-0"
          >
            {{ showRegionDetails ? 'Hide details' : 'Details & actions' }}
          </Button>
        </CardContent>
      </Card>

      <!-- Region cards: which region is live, and how full each one is -->
      <div v-if="regions.length && showRegionDetails" class="grid gap-4 mb-6" :class="regions.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'">
        <Card
          v-for="region in regions"
          :key="region.providerKey"
          size="sm"
          :class="region.isActive ? 'ring-2 ring-primary' : ''"
        >
          <CardContent>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold font-mono">{{ region.region }}</p>
                  <StatusBadge
                    v-if="region.isActive"
                    tone="success"
                    title="Mail is sent from this region"
                  >
                    sending
                  </StatusBadge>
                  <StatusBadge
                    v-else
                    title="Only used if the active region fails, and only for stores that have a tenant here"
                  >
                    standby
                  </StatusBadge>
                </div>
                <p class="text-xs text-muted-foreground mt-1 font-mono">{{ region.providerKey }}</p>
                <p class="text-xs text-muted-foreground mt-2">
                  <b class="text-foreground">{{ region.dedicatedCount }}</b> premium ·
                  <b class="text-foreground">{{ region.freeStoreCount }}</b> on the free pool
                </p>
                <div class="flex flex-wrap gap-1.5 mt-1.5">
                  <StatusBadge
                    :tone="statusTone(region.poolStatus || 'MISSING')"
                    title="The shared tenant every free-plan store sends under"
                  >
                    pool: {{ region.poolStatus || 'none' }}
                  </StatusBadge>
                  <StatusBadge
                    :tone="statusTone(region.platformStatus || 'MISSING')"
                    title="Our own alerts and notices send under this tenant"
                  >
                    platform: {{ region.platformStatus || 'none' }}
                  </StatusBadge>
                </div>
              </div>

              <div class="text-right flex-shrink-0">
                <p class="text-2xl font-bold leading-none" title="Tenants in AWS here — what is billed">
                  {{ region.tenantCount }}
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  <span :class="region.healthyCount < region.tenantCount ? 'text-amber-700 dark:text-amber-300 font-medium' : ''">
                    {{ region.healthyCount }} sendable
                  </span>
                </p>
              </div>
            </div>

            <div v-if="canEdit" class="flex items-center gap-2 mt-3 pt-3 border-t">
              <Button
                @click="runBackfill(region.providerKey)"
                :disabled="!!backfill || !!teardown"
                variant="outline"
                size="xs"
              >
                Fill this region
              </Button>
              <Button
                v-if="region.tenantCount"
                @click="tearDownRegion(region.providerKey)"
                :disabled="!!backfill || !!teardown"
                variant="destructive"
                size="xs"
              >
                Empty it
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Region migration -->
      <Card v-if="showMigration" class="mb-6">
        <CardHeader>
          <CardTitle class="font-heading font-semibold">Move every store to another region</CardTitle>
          <CardDescription>
            Three steps: fill the target region, switch sending to it, then empty the old one.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div class="flex flex-wrap items-center gap-4">
            <SelectInput v-model="migrateFrom" :options="regionOptions" label="From" select-class="w-52" />
            <SelectInput v-model="migrateTo" :options="migrateToSelectOptions" label="To" select-class="w-52" />
            <LoadingIcon v-if="migrationLoading" size="sm" />
          </div>

          <AppAlert v-if="migrationError" tone="danger" class="mt-3">{{ migrationError }}</AppAlert>

          <template v-if="migration">
            <!-- Step 1 -->
            <div class="mt-5 flex items-start gap-3">
              <span
                class="size-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                :class="toneBadgeClasses[migration.pendingCount ? 'warning' : 'success']"
              >
                {{ migration.pendingCount ? '1' : '✓' }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">
                  Fill {{ migration.to.region }}
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ migration.to.healthyCount }} of {{ migration.to.tenantCount }} tenant(s) sendable.
                  <span v-if="migration.pendingCount" class="text-amber-700 dark:text-amber-300">
                    {{ migration.pendingCount }} store(s) still need one.
                  </span>
                </p>
                <Button
                  v-if="canEdit && migration.pendingCount"
                  @click="runBackfill(migration.to.providerKey)"
                  :disabled="!!backfill || !!teardown"
                  variant="outline"
                  size="xs"
                  class="mt-2"
                >
                  Provision {{ migration.pendingCount }} store(s)
                </Button>
              </div>
            </div>

            <!-- Step 2 -->
            <div class="mt-4 flex items-start gap-3">
              <span
                class="size-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                :class="toneBadgeClasses[migration.to.isActive ? 'success' : 'neutral']"
              >
                {{ migration.to.isActive ? '✓' : '2' }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">Switch sending to {{ migration.to.region }}</p>

                <ul v-if="migration.blockers.length" class="mt-1 flex flex-col gap-0.5">
                  <li v-for="b in migration.blockers" :key="b" class="text-xs text-destructive">— {{ b }}</li>
                </ul>

                <AppAlert tone="warning" title="Do these by hand first — this app cannot:" class="mt-2">
                  <ul class="mt-0.5 flex flex-col gap-1 text-xs">
                    <li v-for="w in migration.warnings" :key="w">• {{ w }}</li>
                  </ul>
                </AppAlert>

                <Button
                  v-if="canEdit && !migration.to.isActive"
                  @click="cutOver"
                  :disabled="!migration.readyToCutOver || !!backfill || !!teardown"
                  variant="destructive"
                  size="xs"
                  class="mt-2"
                  :title="migration.readyToCutOver ? '' : 'Resolve the blockers above first'"
                >
                  Switch to {{ migration.to.region }}
                </Button>
              </div>
            </div>

            <!-- Step 3 -->
            <div class="mt-4 flex items-start gap-3">
              <span
                class="size-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                :class="toneBadgeClasses[migration.from.tenantCount ? 'neutral' : 'success']"
              >
                {{ migration.from.tenantCount ? '3' : '✓' }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">Empty {{ migration.from.region }}</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ migration.from.tenantCount }} tenant(s) still there, still billing monthly.
                  <span v-if="migration.from.isActive" class="text-destructive">
                    Still the active region — switch first.
                  </span>
                </p>
                <Button
                  v-if="canEdit && migration.from.tenantCount"
                  @click="tearDownRegion(migration.from.providerKey)"
                  :disabled="migration.from.isActive || !!backfill || !!teardown"
                  variant="destructive"
                  size="xs"
                  class="mt-2"
                >
                  Delete {{ migration.from.tenantCount }} tenant(s)
                </Button>
              </div>
            </div>
          </template>
        </CardContent>
      </Card>

      <!-- Stores with no tenant in the region being shown -->
      <AppAlert v-if="data && data.missingCount > 0" tone="warning" class="mb-6 py-4">
        <div class="text-foreground">
          <b>{{ data.missingCount }}</b> tenant(s) need attention in
          <b class="font-mono">{{ shownRegion?.region || 'the active region' }}</b
          >.
        </div>
        <div class="text-xs mt-1">
          <template v-if="data.missing.includes('__free__')">
            <b class="text-destructive">The free pool has no working tenant here — free-plan stores cannot
            send from this region.</b>
          </template>
          Premium stores listed here have no working dedicated tenant and are sending under the free
          pool meanwhile. The free-pool and platform tenants appear here when they are missing.
        </div>

        <div v-if="data.missing.length" class="mt-3 flex flex-wrap gap-2">
          <div
            v-for="shop in data.missing.slice(0, 40)"
            :key="shop"
            class="flex items-center gap-2 bg-card border rounded-lg pl-3 pr-1 py-1"
          >
            <span class="text-xs text-foreground font-mono">{{ shopLabel(shop) }}</span>
            <LoadingIcon v-if="busyShop === shop" size="xs" />
            <Button
              v-else-if="canEdit"
              @click="provisionOne(shop, false, effectiveProviderKey ?? undefined)"
              :disabled="busyShop !== null"
              variant="outline"
              size="xs"
            >
              Create
            </Button>
          </div>
          <span v-if="data.missing.length > 40" class="text-xs self-center">
            +{{ data.missing.length - 40 }} more — use "Fill active region"
          </span>
        </div>
      </AppAlert>

      <p v-if="data && data.unassignedCount > 0" class="text-xs text-muted-foreground mb-4">
        {{ data.unassignedCount }} free store(s) have no pool record in this region yet. They still
        send under the pool; "Fill active region" or the daily check adds the records.
      </p>

      <!-- Tenant table -->
      <Card class="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader class="bg-muted/50">
            <TableRow>
              <TableHead class="px-6 text-muted-foreground">Store</TableHead>
              <TableHead class="px-6 text-muted-foreground">Type</TableHead>
              <TableHead class="px-6 text-muted-foreground">Region</TableHead>
              <TableHead class="px-6 text-muted-foreground">Tenant</TableHead>
              <TableHead class="px-6 text-muted-foreground">SES status</TableHead>
              <TableHead class="px-6 text-muted-foreground">Resources</TableHead>
              <TableHead class="px-6 text-muted-foreground">Synced</TableHead>
              <TableHead class="px-6 text-right text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <template v-if="loading && !data">
              <TableRow v-for="i in 6" :key="i">
                <TableCell class="px-6 py-4"><SkeletonLoader width="180px" height="16px" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="70px" height="20px" custom-class="rounded-full" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="80px" height="16px" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="150px" height="16px" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="70px" height="24px" custom-class="rounded-full" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="60px" height="16px" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="60px" height="16px" /></TableCell>
                <TableCell class="px-6 py-4"><SkeletonLoader width="140px" height="24px" /></TableCell>
              </TableRow>
            </template>

            <TableEmpty v-else-if="!rows.length" :colspan="8" class="py-6">
              <p class="text-sm italic text-muted-foreground">
                <template v-if="statusFilter === 'risky'">No store is over a warning or pause limit.</template>
                <template v-else-if="statusFilter !== 'all'">No tenants match this filter.</template>
                <template v-else-if="search">No tenants match "{{ search }}".</template>
                <template v-else>
                  No tenants yet for {{ selectedApp?.app_name }}.
                  <span v-if="canEdit">Use "Fill active region" to set them up.</span>
                </template>
              </p>
            </TableEmpty>

            <TableRow
              v-for="row in rows"
              :key="row.region.id"
              :class="row.localStatus === 'paused' ? 'bg-destructive/5' : ''"
            >
              <!-- Store -->
              <TableCell class="px-6 py-4 whitespace-normal">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">
                    {{
                      row.isPlatform
                        ? 'Platform (our own mail)'
                        : row.isPool
                          ? 'Free pool (every free-plan store)'
                          : row.shop
                    }}
                  </span>
                  <StatusBadge v-if="row.localStatus === 'paused'" tone="danger">
                    Paused
                  </StatusBadge>
                </div>
                <p v-if="row.localStatus === 'paused'" class="text-xs text-destructive mt-1">
                  {{ row.pausedReason }}
                  <span class="text-muted-foreground">
                    — {{ row.pausedBy === 'reputation' ? 'auto (reputation check)' : row.pausedBy || 'unknown' }},
                    {{ formatDate(row.pausedAt) }}
                  </span>
                </p>
                <p
                  v-if="!isSystemRow(row) && rates(row)"
                  class="text-xs mt-1"
                  :class="
                    rates(row)!.level === 'pause'
                      ? 'text-destructive font-medium'
                      : rates(row)!.level === 'warn'
                        ? 'text-amber-700 dark:text-amber-300 font-medium'
                        : 'text-muted-foreground'
                  "
                  :title="`${rates(row)!.bounced} bounced and ${rates(row)!.complained} complaint(s) out of ${rates(row)!.sent} recipients, ${row.reputationSince ? 'since the store was resumed' : 'over the last 7 days'}. ${rates(row)!.level === null ? 'Too few recipients to be judged yet (see Daily check → Store reputation).' : 'Judged against the Daily check → Store reputation limits.'}`"
                >
                  {{ row.reputationSince ? 'since resume' : '7d' }}: {{ rates(row)!.sent }} sent · bounce {{ rates(row)!.bounce }}% ·
                  complaints {{ rates(row)!.complaint }}%
                  <span v-if="rates(row)!.level === null" class="text-muted-foreground">(too few to judge)</span>
                </p>
              </TableCell>

              <!-- Type -->
              <TableCell class="px-6 py-4">
                <StatusBadge
                  :tone="typeTone(row.tenantType)"
                  :title="
                    row.tenantType === 'free'
                      ? 'Free plan: sends under the shared free-pool tenant'
                      : row.tenantType === 'dedicated'
                        ? 'Premium: its own tenant and reputation'
                        : row.isPlatform
                          ? 'Install and uninstall notices, spam alerts and billing warnings send under this tenant'
                          : 'Shared by every free-plan store in this region'
                  "
                >
                  {{ typeLabel(row.tenantType) }}
                </StatusBadge>
                <p
                  v-if="row.region.retiredTenantName"
                  class="text-xs text-amber-700 dark:text-amber-300 mt-1"
                  title="Given up on downgrade; AWS has not confirmed the delete yet. Retried daily."
                >
                  old tenant pending delete
                </p>
              </TableCell>

              <!-- Region -->
              <TableCell class="px-6 py-4">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-mono">{{ row.region.region || '—' }}</span>
                  <span
                    v-if="row.region.providerKey === data?.activeProviderKey"
                    class="size-1.5 rounded-full bg-primary"
                    title="Active sending region"
                  />
                </div>
              </TableCell>

              <!-- Tenant name -->
              <TableCell class="px-6 py-4 whitespace-normal">
                <span class="text-xs font-mono text-muted-foreground">{{ row.region.tenantName }}</span>
              </TableCell>

              <!-- SES status -->
              <TableCell class="px-6 py-4">
                <StatusBadge
                  v-if="row.tenantType === 'free'"
                  :tone="statusTone(row.region.poolStatus || 'MISSING')"
                  title="A free-plan store sends as well as its region's pool does"
                >
                  via pool: {{ row.region.poolStatus || 'no pool' }}
                </StatusBadge>
                <StatusBadge v-else :tone="statusTone(row.region.sendingStatus)">
                  {{ row.region.sendingStatus }}
                </StatusBadge>
                <p v-if="row.region.lastError" class="text-xs text-destructive mt-1 max-w-xs">
                  {{ row.region.lastError }}
                </p>
              </TableCell>

              <!-- Resource associations -->
              <TableCell class="px-6 py-4">
                <span v-if="row.tenantType === 'free'" class="text-xs text-muted-foreground">—</span>
                <span
                  v-else-if="row.region.resourcesLinked"
                  class="text-xs text-emerald-700 dark:text-emerald-300"
                  title="Identity and configuration set are both associated with this tenant"
                >
                  linked
                </span>
                <span
                  v-else
                  class="text-xs text-amber-700 dark:text-amber-300 font-medium"
                  title="SES rejects sends for a tenant without both an identity and a configuration set associated. Check the IAM key has ses:CreateTenantResourceAssociation on both ARNs, then re-provision."
                >
                  not linked
                </span>
              </TableCell>

              <!-- Last synced -->
              <TableCell class="px-6 py-4">
                <span class="text-xs text-muted-foreground" :title="formatDate(row.region.lastSyncedAt)">
                  {{ relative(row.region.lastSyncedAt) }}
                </span>
              </TableCell>

              <!-- Actions -->
              <TableCell class="px-6 py-4 text-right">
                <div v-if="canEdit" class="flex items-center justify-end gap-1.5">
                  <LoadingIcon v-if="busyShop === row.shop" size="xs" />

                  <Button
                    v-if="!isSystemRow(row)"
                    @click="recheckPlan(row)"
                    :disabled="busyShop !== null"
                    variant="outline"
                    size="xs"
                    title="Look up this store's plan in Shopify now and move it to match: premium gets a dedicated tenant, free goes to the shared pool."
                  >
                    Check plan
                  </Button>

                  <Button
                    v-if="row.tenantType !== 'free'"
                    @click="provisionOne(row.shop, false, row.region.providerKey)"
                    :disabled="busyShop !== null"
                    variant="outline"
                    size="xs"
                    title="Repair: re-runs create and resource association under the same tenant name. Nothing is deleted and SES history is kept."
                  >
                    Re-provision
                  </Button>

                  <Button
                    v-if="row.localStatus !== 'paused'"
                    @click="pause(row)"
                    :disabled="busyShop !== null"
                    variant="outline"
                    size="xs"
                    title="Stops this store's mail in every region it has a tenant in. Reversible — nothing is deleted."
                  >
                    Pause
                  </Button>
                  <Button
                    v-else
                    @click="resume(row)"
                    :disabled="busyShop !== null"
                    variant="outline"
                    size="xs"
                  >
                    Resume
                  </Button>

                  <Button
                    v-if="regions.length > 1 && row.tenantType !== 'free'"
                    @click="addToRegion(row)"
                    :disabled="busyShop !== null"
                    variant="outline"
                    size="xs"
                    title="Create a tenant for this store in another region"
                  >
                    Add region
                  </Button>

                  <Button
                    v-if="row.tenantType !== 'free'"
                    @click="rotateTenant(row)"
                    :disabled="busyShop !== null"
                    variant="destructive"
                    size="xs"
                    title="Creates a new tenant under a new name, switches to it once it can send, then deletes this one. SES reputation and history start over — use Re-provision to repair a broken tenant instead."
                  >
                    Replace
                  </Button>

                  <Button
                    @click="removeTenant(row)"
                    :disabled="busyShop !== null"
                    variant="destructive"
                    size="xs"
                    title="Permanently deletes this store's tenant and stops the per-tenant AWS charge."
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <AppPagination
          v-if="data && data.total"
          v-model:current-page="page"
          v-model:per-page="pageSize"
          :last-page="pageCount"
          :total="data.total"
          :from="pageStart"
          :to="pageEnd"
          :item-label="regionFilter && shownRegion ? `stores in ${shownRegion.region}` : 'stores'"
          :per-page-options="PAGE_SIZES"
        />
      </Card>
    </template>
  </div>
</template>
