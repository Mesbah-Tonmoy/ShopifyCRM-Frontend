<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
  sesTenantService,
  type MigrationStatus,
  type SesTenantList,
  type SesTenantRegion,
  type SesTenantShop,
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
import { Toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';
import PageHeader from '@/components/common/PageHeader.vue';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';

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

const typeClass = (type: SesTenantType) =>
  ({
    dedicated: 'bg-indigo-100 text-indigo-800',
    free: 'bg-gray-100 text-gray-700',
    pool: 'bg-teal-100 text-teal-800',
    platform: 'bg-gray-200 text-gray-700',
  })[type] || 'bg-gray-100 text-gray-600';

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
  } catch (err: any) {
    if (requestId !== tenantsRequest) return;
    loadError.value = err.message || 'Failed to load tenants';
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
    Swal.fire({
      icon: 'error',
      title: 'No AWS credentials',
      text: 'No SMTP provider has an AWS region and access key configured. Add those on the SMTP Setup page first — tenant operations are SES API calls and cannot use SMTP credentials.',
    });
    return;
  }

  const target = providerKey ?? effectiveProviderKey.value ?? undefined;
  const targetRegion = regions.value.find((r) => r.providerKey === target);
  const label = targetRegion?.region || 'the active region';

  const confirmed = await Swal.fire({
    icon: 'question',
    titleText: `Fill ${label}?`,
    html: `For every installed store, in <b>${label}</b> only:<br><br>
           <b>Premium stores</b> get (or keep) a dedicated SES tenant.<br>
           <b>Free stores</b> are added to the shared free pool — no AWS call, no charge.<br>
           The free-pool and platform tenants are created if missing.<br><br>
           <b>${data.value.missingCount}</b> tenant(s) currently need attention there.<br><br>
           <span style="color:#b45309">AWS charges per tenant per month, per region — dedicated tenants only.</span>`,
    showCancelButton: true,
    confirmButtonText: 'Start',
    confirmButtonColor: '#0d9488',
  });

  if (!confirmed.isConfirmed) return;

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
        Swal.fire({ icon: 'error', title: 'Backfill stopped', text: response.message });
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
    Toast.fire({
      icon: done && done.failed ? 'warning' : 'success',
      title: `Backfill finished: ${done?.created ?? 0} created, ${done?.failed ?? 0} failed`,
    });
    await fetchTenants();
    if (migration.value) await loadMigration();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Backfill failed', text: err.message || 'Request failed' });
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

    Swal.fire({
      icon: response.success ? 'success' : 'error',
      title: response.success
        ? rotate
          ? 'Tenant replaced'
          : 'Tenant ready'
        : 'Provisioning incomplete',
      text: response.message,
    });

    await fetchTenants();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Failed', text: err.message || 'Request failed' });
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

  const confirmed = await Swal.fire({
    icon: 'warning',
    titleText: `Replace the ${row.isPool ? 'free pool tenant' : `tenant for ${shopLabel(row.shop)}`}?`,
    html: `A new tenant is created in <b>${row.region.region}</b> under a new name and takes over as soon
           as it can send; then the current one is <b>deleted</b>. Mail keeps flowing throughout.
           <br><br>Its sending history and reputation in SES start over. Use "Re-provision" instead if
           you only want to repair a broken tenant.
           ${
             row.isPool
               ? `<br><br><span style="color:#b45309"><b>Every free-plan store moves to the new tenant.</b>
                  ${
                    poolDisabled
                      ? `AWS disabled the current one for its reputation. Pause the stores that caused it
                         first — otherwise the same mail disables the new tenant too, and the account-level
                         rates AWS also watches keep rising.`
                      : ''
                  }</span>`
               : ''
           }`,
    showCancelButton: true,
    confirmButtonText: 'Replace',
    confirmButtonColor: '#dc2626',
  });

  if (!confirmed.isConfirmed) return;
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
    Toast.fire({ icon: 'info', titleText: `${row.shop} already has a tenant in every region` });
    return;
  }

  const { value: providerKey } = await Swal.fire({
    icon: 'question',
    titleText: `Add a tenant for ${row.shop}`,
    input: 'select',
    inputOptions: Object.fromEntries(
      options.map((r) => [r.providerKey, `${r.region}${r.isActive ? ' (active)' : ''}`])
    ),
    inputPlaceholder: 'Choose a region',
    html: `Creates a tenant in a second region. The store keeps its existing tenant —
           nothing is deleted.<br><br><span style="color:#b45309">AWS charges per tenant per
           month, per region.</span>`,
    showCancelButton: true,
    confirmButtonText: 'Create tenant',
    confirmButtonColor: '#0d9488',
    inputValidator: (v) => (v ? null : 'Pick a region'),
  });

  if (!providerKey) return;
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
      ? `<br><br>This store has no tenant of its own — only its free-pool record is removed, and it
         keeps sending under the pool. Any pause on it is lost.`
      : row.isPool
        ? `<br><br><span style="color:#dc2626"><b>Every free-plan store in ${row.region.region} sends
           under this tenant.</b> They all stop sending from this region until it exists again
           (the daily check recreates it).</span>`
        : row.isPlatform
          ? `<br><br><span style="color:#dc2626">Our own alerts and notices send under this tenant.</span>`
          : isActiveRegion
            ? `<br><br>This is the active sending region: the store falls back to the free pool until
               the next plan check gives it a new tenant.`
            : '';

  const confirmed = await Swal.fire({
    icon: 'warning',
    titleText: `Delete the tenant for ${name}?`,
    html: `Permanently deletes its tenant in <b>${row.region.region}</b> and stops that
           per-tenant AWS charge.${consequence}`,
    input: 'checkbox',
    inputPlaceholder: 'Force: drop our record even if AWS refuses',
    showCancelButton: true,
    confirmButtonText: 'Delete permanently',
    confirmButtonColor: '#dc2626',
  });

  if (!confirmed.isConfirmed) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.remove(selectedAppId.value, row.shop, {
      providerKey: row.region.providerKey,
      force: confirmed.value === 1,
    });

    Swal.fire({
      icon: response.success ? 'success' : 'error',
      title: response.success ? 'Deleted' : 'Deletion incomplete',
      text: response.message,
    });

    await fetchTenants();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not delete', text: err.message || 'Request failed' });
  } finally {
    busyShop.value = null;
  }
};

const pause = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  const asked = await Swal.fire({
    icon: 'warning',
    titleText: `Pause email for ${shopLabel(row.shop)}?`,
    text: row.isPool
      ? 'Every free-plan store stops sending immediately, in every region. Give a reason — it is recorded and shown here.'
      : row.tenantType === 'free'
        ? 'This store stops sending immediately. It shares the free pool, so the pause is ours alone — AWS and the other free stores are unaffected. Give a reason — it is recorded and shown here.'
        : 'All email for this store stops immediately, in every region it has a tenant in. Give a reason — it is recorded and shown here.',
    input: 'textarea',
    inputPlaceholder: 'e.g. high complaint rate, suspected list purchase',
    inputValidator: (value) => (value && value.trim() ? null : 'A reason is required'),
    showCancelButton: true,
    confirmButtonText: 'Pause sending',
    confirmButtonColor: '#dc2626',
  });

  if (!asked.isConfirmed || !asked.value) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.pause(
      selectedAppId.value,
      row.shop,
      asked.value.trim()
    );

    Toast.fire({ icon: response.success ? 'success' : 'error', title: response.message || 'Paused' });
    await fetchTenants();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not pause', text: err.message || 'Request failed' });
  } finally {
    busyShop.value = null;
  }
};

const resume = async (row: TenantRow) => {
  if (selectedAppId.value === null) return;

  const confirmed = await Swal.fire({
    icon: 'question',
    titleText: `Resume email for ${row.shop}?`,
    text: row.pausedReason ? `It was paused because: ${row.pausedReason}` : undefined,
    showCancelButton: true,
    confirmButtonText: 'Resume sending',
    confirmButtonColor: '#0d9488',
  });

  if (!confirmed.isConfirmed) return;

  try {
    busyShop.value = row.shop;
    const response = await sesTenantService.resume(selectedAppId.value, row.shop);

    Toast.fire({
      icon: response.success ? 'success' : 'error',
      title: response.message || 'Resumed',
    });
    await fetchTenants();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not resume', text: err.message || 'Request failed' });
  } finally {
    busyShop.value = null;
  }
};

const syncFromAws = async () => {
  if (selectedAppId.value === null) return;

  try {
    syncing.value = true;
    const response = await sesTenantService.sync(selectedAppId.value);
    Toast.fire({ icon: 'success', title: response.message || 'Synced' });
    await fetchTenants();
    if (migration.value) await loadMigration();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Sync failed', text: err.message || 'Request failed' });
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
  } catch (err: any) {
    migrationError.value = err.message || 'Request failed';
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

  const warnings = migration.value.warnings.map((w) => `<li>${w}</li>`).join('');

  const confirmed = await Swal.fire({
    icon: 'warning',
    titleText: `Send all mail from ${target.region}?`,
    html: `<p style="text-align:left">Every store starts sending through
             <b>${target.region}</b> immediately.</p>
           <p style="text-align:left;margin-top:12px"><b>Before you confirm:</b></p>
           <ul style="text-align:left;font-size:13px;color:#b45309">${warnings}</ul>`,
    input: 'checkbox',
    inputPlaceholder: 'I have copied the suppression list to the new region',
    inputValidator: (v) => (v ? null : 'Confirm the suppression list has been copied'),
    showCancelButton: true,
    confirmButtonText: `Switch to ${target.region}`,
    confirmButtonColor: '#dc2626',
    width: 640,
  });

  if (!confirmed.isConfirmed) return;

  try {
    // `activate` takes the provider's id, but everything on this page is keyed
    // by providerKey, so the id is looked up at the moment of use rather than
    // held in a second piece of state that could go stale.
    const response = await smtpProviderService.getAll(selectedAppId.value);
    const match = response.data?.providers.find((p) => p.key === target.providerKey);

    if (!match) {
      Swal.fire({
        icon: 'error',
        title: 'Provider not found',
        text: `No SMTP provider with key "${target.providerKey}" — it may have been renamed or removed.`,
      });
      return;
    }

    const activated = await smtpProviderService.activate(selectedAppId.value, match.id);

    Toast.fire({
      icon: activated.success ? 'success' : 'error',
      title: activated.success ? `Now sending from ${target.region}` : activated.message,
    });

    await fetchTenants();
    await loadMigration();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Cutover failed', text: err.message || 'Request failed' });
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

  const confirmed = await Swal.fire({
    icon: 'warning',
    titleText: `Delete every tenant in ${label}?`,
    html: `Permanently deletes <b>${region?.tenantCount ?? 0}</b> tenant(s) and stops their AWS
           charges.
           ${
             isActive
               ? `<br><br><span style="color:#dc2626"><b>${label} is the active sending region.</b>
                  Doing this stops all mail — SES rejects sends that name no tenant. Switch the
                  active region first.</span>`
               : `<br><br>${label} is not the active region, so sending is unaffected. Failover
                  into it will no longer be possible.`
           }`,
    input: 'text',
    inputPlaceholder: `Type ${label} to confirm`,
    inputValidator: (v) => (v === label ? null : `Type ${label} exactly`),
    showCancelButton: true,
    confirmButtonText: 'Delete them all',
    confirmButtonColor: '#dc2626',
  });

  if (!confirmed.isConfirmed) return;

  teardown.value = { deleted: 0, failed: 0, remaining: region?.tenantCount ?? 0, region: label };

  try {
    for (;;) {
      const response = await sesTenantService.removeRegion(selectedAppId.value, providerKey, {
        limit: TEARDOWN_PAGE,
        allowActive: isActive,
      });

      if (!response.data) {
        Swal.fire({ icon: 'error', title: 'Teardown stopped', text: response.message });
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
    Swal.fire({
      icon: done && done.failed ? 'warning' : 'success',
      title: done && done.failed ? 'Teardown incomplete' : 'Region emptied',
      text: `${done?.deleted ?? 0} deleted, ${done?.remaining ?? 0} left${
        done?.failed ? ` (${done.failed} refused by AWS)` : ''
      }`,
    });

    await fetchTenants();
    if (migration.value) await loadMigration();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Teardown failed', text: err.message || 'Request failed' });
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
    Swal.fire({
      icon: response.success ? 'success' : 'error',
      title: response.success ? 'Plan checked' : 'Plan check incomplete',
      text: response.message,
    });
    await fetchTenants();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Plan check failed', text: err.message || 'Request failed' });
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

const lastRun = computed(() => monitor.value?.runs[0] ?? null);

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
  } catch (err: any) {
    if (requestId !== monitorRequest) return;
    monitorError.value = err.message || 'Could not load the daily check';
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
      Toast.fire({ icon: 'success', title: response.message || 'Saved' });
      monitorDirty.value = false;
      await loadMonitor();
    } else {
      Swal.fire({ icon: 'error', title: 'Not saved', text: response.message });
    }
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Not saved', text: err.message || 'Request failed' });
  } finally {
    monitorSaving.value = false;
  }
};

const runCheckNow = async () => {
  if (selectedAppId.value === null) return;

  const confirmed = await Swal.fire({
    icon: 'question',
    title: 'Run the daily check now?',
    html: `Checks every store's plan against Shopify, moves tenants to match, retries old
           tenant deletions, and syncs every tenant from AWS. It can take a few minutes with
           many stores. An email goes out if anything changed.`,
    showCancelButton: true,
    confirmButtonText: 'Run now',
    confirmButtonColor: '#0d9488',
  });
  if (!confirmed.isConfirmed) return;

  try {
    monitorStarting.value = true;
    const response = await sesTenantService.runCheck(selectedAppId.value);
    Toast.fire({ icon: response.success ? 'success' : 'error', title: response.message || 'Started' });
    await loadMonitor();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not start', text: err.message || 'Request failed' });
  } finally {
    monitorStarting.value = false;
  }
};

onBeforeUnmount(() => {
  unmounted = true;
  window.clearTimeout(monitorPoll);
});

const runStatusClass = (status: string) =>
  status === 'ok'
    ? 'bg-green-100 text-green-800'
    : status === 'failed'
      ? 'bg-red-100 text-red-800'
      : 'bg-amber-100 text-amber-800';

// --- Presentation ----------------------------------------------------------

const statusClass = (status: string) => {
  if (status === 'ENABLED') return 'bg-green-100 text-green-800';
  if (status === 'REINSTATED') return 'bg-blue-100 text-blue-800';
  if (status === 'DISABLED') return 'bg-red-100 text-red-800';
  if (status === 'ERROR') return 'bg-red-100 text-red-800';
  // Gone from AWS, so amber rather than red: the store still exists, and
  // Re-provision fixes it.
  if (status === 'MISSING') return 'bg-amber-100 text-amber-800';
  if (status === 'PAUSED') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
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
        <button
          v-if="selectedAppId !== null"
          @click="showMonitor = !showMonitor"
          class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <span
            v-if="monitor"
            class="w-2 h-2 rounded-full"
            :class="
              monitor.running
                ? 'bg-amber-500'
                : !monitor.settings.enabled
                  ? 'bg-gray-400'
                  : lastRun?.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-green-500'
            "
          />
          {{ showMonitor ? 'Hide daily check' : 'Daily check' }}
        </button>
        <button
          v-if="selectedAppId !== null && regions.length > 1"
          @click="openMigration"
          class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          {{ showMigration ? 'Hide' : 'Move region' }}
        </button>
        <button
          v-if="selectedAppId !== null"
          @click="syncFromAws"
          :disabled="syncing || loading"
          class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
        >
          <LoadingIcon v-if="syncing" size="xs" />
          Sync from AWS
        </button>
        <button
          v-if="canEdit && selectedAppId !== null"
          @click="runBackfill()"
          :disabled="!!backfill || !!teardown || loading"
          class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all disabled:opacity-50"
        >
          Fill active region
        </button>
      </template>
    </PageHeader>

    <!-- App picker, region lens, search, status filter -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-4">
      <SelectInput v-model="selectedAppId" label="App" placeholder="Select App" select-class="w-56">
        <option v-for="app in appsStore.apps" :key="app.id" :value="app.id">{{ app.app_name }}</option>
      </SelectInput>

      <SelectInput v-if="regions.length" v-model="regionFilter" label="Region" select-class="w-52">
        <option v-for="region in regions" :key="region.providerKey" :value="region.providerKey">
          {{ region.region }}{{ region.isActive ? ' (active)' : '' }}
        </option>
      </SelectInput>

      <SelectInput v-if="data" v-model="typeFilter" label="Type" select-class="w-44">
        <option value="all">All types</option>
        <option value="dedicated">Premium (dedicated)</option>
        <option value="free">Free (shared pool)</option>
        <option value="system">Pool &amp; platform</option>
      </SelectInput>

      <SelectInput v-if="data" v-model="statusFilter" label="Status" select-class="w-48">
        <option value="all">All ({{ counts.all }})</option>
        <option value="healthy">Sendable ({{ counts.healthy }})</option>
        <option value="broken">Needs attention ({{ counts.broken }})</option>
        <option value="paused">Paused ({{ counts.paused }})</option>
        <option value="risky">At risk — bounce/complaints ({{ counts.risky }})</option>
      </SelectInput>

      <SelectInput v-if="data" v-model="sortBy" label="Sort" select-class="w-48">
        <option value="shop">Store name</option>
        <option value="bounce">Bounce rate (highest first)</option>
        <option value="complaint">Complaint rate (highest first)</option>
        <option value="sent">Mail volume (highest first)</option>
      </SelectInput>

      <SearchInput
        v-if="selectedAppId !== null"
        v-model="search"
        placeholder="Search by store domain..."
        container-class="max-w-[280px] flex-1"
      />
    </div>

    <!-- Progress banners -->
    <div v-if="backfill" class="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <LoadingIcon size="sm" />
          <p class="text-sm text-gray-700">
            Provisioning in <b>{{ backfill.region }}</b>… <b>{{ backfill.created }}</b> created,
            <b>{{ backfill.existing }}</b> already existed,
            <b>{{ backfill.failed }}</b> failed
            <span class="text-gray-500">({{ backfill.done }} processed)</span>
          </p>
        </div>
        <button
          @click="cancelBackfill = true"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-white"
        >
          Stop after this page
        </button>
      </div>
    </div>

    <div v-if="teardown" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <div class="flex items-center gap-3">
        <LoadingIcon size="sm" />
        <p class="text-sm text-gray-700">
          Deleting tenants in <b>{{ teardown.region }}</b>… <b>{{ teardown.deleted }}</b> deleted,
          <b>{{ teardown.remaining }}</b> left
          <span v-if="teardown.failed" class="text-red-700">
            ({{ teardown.failed }} refused by AWS)
          </span>
        </p>
      </div>
    </div>

    <div
      v-if="selectedAppId === null"
      class="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500"
    >
      Select an app to manage its SES tenants.
    </div>

    <div v-else-if="loadError" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <h3 class="text-base font-semibold text-red-800">Could not reach the app</h3>
      <p class="text-sm text-red-700 mt-1">{{ loadError }}</p>
      <p class="text-sm text-red-700 mt-2">
        Tenants live in the app's own database, so this page needs the app online.
      </p>
    </div>

    <template v-else>
      <!-- Daily check: schedule, recipients, recent runs -->
      <div v-if="showMonitor" class="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 class="text-base font-semibold text-dark">Daily tenant check</h3>
            <p class="text-sm text-gray-600 mt-1 max-w-2xl">
              Once a day the app checks every store's plan in Shopify and moves its tenant to match
              (premium → dedicated, free → shared pool), retries old tenant deletions, and syncs every
              tenant's status from AWS. If anything changed or failed, the recipients get one email.
              Every hour it also checks each store's bounce and complaint rate.
            </p>
          </div>
          <button
            v-if="canEdit"
            @click="runCheckNow"
            :disabled="monitorStarting || !!monitor?.running"
            class="px-3 py-1.5 rounded-lg text-sm font-medium border border-teal text-teal hover:bg-teal-50 disabled:opacity-40 flex items-center gap-2"
          >
            <LoadingIcon v-if="monitorStarting || monitor?.running" size="xs" />
            {{ monitor?.running ? 'Running…' : 'Run now' }}
          </button>
        </div>

        <p v-if="monitorError" class="text-sm text-red-600 mt-3">{{ monitorError }}</p>

        <div class="flex gap-1 mt-4 border-b border-gray-200">
          <button
            v-for="tab in ([['settings', 'Settings'], ['runs', `Recent runs${monitor ? ` (${monitor.runs.length})` : ''}`]] as const)"
            :key="tab[0]"
            type="button"
            @click="monitorTab = tab[0]"
            class="px-3 py-2 text-sm font-medium -mb-px border-b-2"
            :class="
              monitorTab === tab[0]
                ? 'border-teal text-teal'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            "
          >
            {{ tab[1] }}
          </button>
        </div>

        <form
          v-if="monitorForm && monitorTab === 'settings'"
          class="grid gap-4 mt-4 md:grid-cols-2"
          @submit.prevent="saveMonitor"
          @input="monitorDirty = true"
          @change="monitorDirty = true"
        >
          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-2 text-sm text-gray-800">
              <input v-model="monitorForm.enabled" type="checkbox" :disabled="!canEdit" />
              Run the check every day
            </label>

            <div class="flex flex-wrap items-end gap-3">
              <label class="flex flex-col text-xs text-gray-600 gap-1">
                Time
                <input
                  v-model="monitorForm.runAt"
                  type="time"
                  required
                  :disabled="!canEdit || !monitorForm.enabled"
                  class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-dark disabled:bg-gray-50"
                />
              </label>
              <label class="flex flex-col text-xs text-gray-600 gap-1">
                Time zone
                <select
                  v-model="monitorForm.timezone"
                  :disabled="!canEdit || !monitorForm.enabled"
                  class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-dark w-56 disabled:bg-gray-50"
                >
                  <option v-for="zone in timeZones" :key="zone" :value="zone">{{ zone }}</option>
                </select>
              </label>
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-800">
              <input v-model="monitorForm.realtimeAlerts" type="checkbox" :disabled="!canEdit" />
              Also email the moment AWS pauses or resumes a tenant
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-800">
              <input v-model="monitorForm.emailWhenUnchanged" type="checkbox" :disabled="!canEdit" />
              Send the daily email even when nothing changed
            </label>

            <fieldset class="border border-gray-200 rounded-lg p-3 mt-1">
              <legend class="text-xs font-semibold text-gray-600 px-1">Store reputation (hourly)</legend>
              <label class="flex items-center gap-2 text-sm text-gray-800">
                <input v-model="monitorForm.reputation.enabled" type="checkbox" :disabled="!canEdit" />
                Watch each store's bounce and complaint rate (last 7 days)
              </label>
              <p class="text-xs text-gray-500 mt-1">
                Over a pause limit, a <b>free</b> store is paused so the shared pool stays healthy; a
                premium store only triggers an email. A pause also needs at least 3 hard bounces or 2
                complaints. Over a warning limit: email, once a day per store.
                AWS reviews at 5% bounce / 0.1% complaints.
              </p>
              <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-600">
                <label class="flex flex-col gap-1">
                  Warn: bounce %
                  <input v-model.number="monitorForm.reputation.warnBouncePct" type="number" step="0.1" min="0.1" max="50" :disabled="!canEdit || !monitorForm.reputation.enabled" class="border border-gray-300 rounded-lg px-2 py-1 text-sm text-dark disabled:bg-gray-50" />
                </label>
                <label class="flex flex-col gap-1">
                  Pause: bounce %
                  <input v-model.number="monitorForm.reputation.pauseBouncePct" type="number" step="0.1" min="0.1" max="50" :disabled="!canEdit || !monitorForm.reputation.enabled" class="border border-gray-300 rounded-lg px-2 py-1 text-sm text-dark disabled:bg-gray-50" />
                </label>
                <label class="flex flex-col gap-1">
                  Warn: complaint %
                  <input v-model.number="monitorForm.reputation.warnComplaintPct" type="number" step="0.01" min="0.01" max="5" :disabled="!canEdit || !monitorForm.reputation.enabled" class="border border-gray-300 rounded-lg px-2 py-1 text-sm text-dark disabled:bg-gray-50" />
                </label>
                <label class="flex flex-col gap-1">
                  Pause: complaint %
                  <input v-model.number="monitorForm.reputation.pauseComplaintPct" type="number" step="0.01" min="0.01" max="5" :disabled="!canEdit || !monitorForm.reputation.enabled" class="border border-gray-300 rounded-lg px-2 py-1 text-sm text-dark disabled:bg-gray-50" />
                </label>
                <label class="flex flex-col gap-1 col-span-2">
                  Ignore stores with fewer recipients than
                  <input v-model.number="monitorForm.reputation.minSends" type="number" step="1" min="1" :disabled="!canEdit || !monitorForm.reputation.enabled" class="border border-gray-300 rounded-lg px-2 py-1 text-sm text-dark w-32 disabled:bg-gray-50" />
                </label>
              </div>
            </fieldset>
          </div>

          <div class="flex flex-col gap-2">
            <label class="flex flex-col text-xs text-gray-600 gap-1">
              Recipients (one per line)
              <textarea
                v-model="monitorForm.recipients"
                rows="4"
                :disabled="!canEdit"
                placeholder="ops@example.com"
                class="border border-gray-300 rounded-lg px-3 py-2 text-sm text-dark font-mono disabled:bg-gray-50"
              />
            </label>
            <div v-if="canEdit" class="flex justify-end">
              <button
                type="submit"
                :disabled="monitorSaving"
                class="bg-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-dark disabled:opacity-50"
              >
                {{ monitorSaving ? 'Saving…' : 'Save settings' }}
              </button>
            </div>
          </div>
        </form>

        <div v-if="monitorTab === 'runs' && monitor?.runs.length" class="mt-4">
          <p class="text-xs text-gray-500">The last 10 runs, newest first — scheduled and manual.</p>
          <div class="overflow-x-auto mt-2">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-500">
                  <th class="py-1.5 pr-4 font-medium">Started</th>
                  <th class="py-1.5 pr-4 font-medium">Trigger</th>
                  <th class="py-1.5 pr-4 font-medium">Result</th>
                  <th class="py-1.5 pr-4 font-medium">Stores</th>
                  <th class="py-1.5 pr-4 font-medium">Status changes</th>
                  <th class="py-1.5 pr-4 font-medium">Plan changes</th>
                  <th class="py-1.5 pr-4 font-medium">Email</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="run in monitor.runs" :key="run.id" class="align-top">
                  <td class="py-1.5 pr-4 whitespace-nowrap text-gray-700" :title="formatDate(run.startedAt)">
                    {{ relative(run.startedAt) }}
                  </td>
                  <td class="py-1.5 pr-4 text-gray-600">{{ run.trigger === 'schedule' ? 'scheduled' : 'manual' }}</td>
                  <td class="py-1.5 pr-4">
                    <span class="text-xs font-medium px-2 py-0.5 rounded-full" :class="runStatusClass(run.status)">
                      {{ run.status }}
                    </span>
                    <p v-if="run.error" class="text-xs text-red-600 mt-1 max-w-xs">{{ run.error }}</p>
                  </td>
                  <td class="py-1.5 pr-4 text-gray-700">{{ run.summary?.storesChecked ?? '—' }}</td>
                  <td class="py-1.5 pr-4 text-gray-700">
                    {{ run.summary?.counts.statusChanges ?? '—' }}
                    <ul v-if="run.summary?.statusChanges.length" class="mt-1 text-xs text-gray-500">
                      <li v-for="(c, i) in run.summary.statusChanges.slice(0, 5)" :key="i">
                        {{ shopLabel(c.shop) }} ({{ c.region }}): {{ c.from }} → <b>{{ c.to }}</b>
                      </li>
                    </ul>
                  </td>
                  <td class="py-1.5 pr-4 text-gray-700">
                    {{ run.summary?.counts.planChanges ?? '—' }}
                    <span v-if="run.summary?.counts.planErrors" class="text-red-600">
                      ({{ run.summary.counts.planErrors }} failed)
                    </span>
                    <ul v-if="run.summary?.planChanges.length" class="mt-1 text-xs text-gray-500">
                      <li v-for="(c, i) in run.summary.planChanges.slice(0, 5)" :key="i">
                        {{ c.shop }}: {{ c.action }}
                      </li>
                    </ul>
                  </td>
                  <td class="py-1.5 pr-4 text-xs">
                    <span v-if="!run.summary">—</span>
                    <span v-else-if="run.summary.emailed" class="text-green-700">sent</span>
                    <span v-else-if="run.summary.emailError" class="text-red-600" :title="run.summary.emailError">failed</span>
                    <span v-else class="text-gray-500">nothing to report</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else-if="monitorTab === 'runs' && monitor" class="text-sm text-gray-500 mt-4">No runs yet.</p>
      </div>

      <!-- Region summary: one line per region; details on demand -->
      <div v-if="regions.length" class="bg-white border border-gray-200 rounded-lg px-4 py-2.5 mb-4">
        <div class="flex items-center gap-x-5 gap-y-2 flex-wrap">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Regions</span>
          <div
            v-for="region in regions"
            :key="region.providerKey"
            class="flex items-center gap-2 text-xs text-gray-700"
          >
            <span
              class="w-2 h-2 rounded-full"
              :class="regionNeedsAttention(region) ? 'bg-red-500' : 'bg-green-500'"
              :title="regionNeedsAttention(region) ? 'Pool, platform or a tenant here needs attention' : 'All tenants here can send'"
            />
            <span class="font-mono font-semibold">{{ region.region }}</span>
            <span
              class="px-1.5 py-0.5 rounded-full"
              :class="region.isActive ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600'"
            >
              {{ region.isActive ? 'sending' : 'standby' }}
            </span>
            <span class="text-gray-500">
              {{ region.dedicatedCount }} premium · {{ region.freeStoreCount }} free ·
              {{ region.healthyCount }}/{{ region.tenantCount }} tenants sendable
            </span>
            <span
              v-if="!['ENABLED', 'REINSTATED'].includes(region.poolStatus || '')"
              class="px-1.5 py-0.5 rounded-full"
              :class="statusClass(region.poolStatus || 'MISSING')"
            >
              pool: {{ region.poolStatus || 'none' }}
            </span>
          </div>
          <button
            type="button"
            @click="showRegionDetails = !showRegionDetails"
            class="ml-auto text-xs text-teal hover:underline"
          >
            {{ showRegionDetails ? 'Hide details' : 'Details & actions' }}
          </button>
        </div>
      </div>

      <!-- Region cards: which region is live, and how full each one is -->
      <div v-if="regions.length && showRegionDetails" class="grid gap-4 mb-6" :class="regions.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'">
        <div
          v-for="region in regions"
          :key="region.providerKey"
          class="bg-white border rounded-lg p-4"
          :class="region.isActive ? 'border-teal ring-1 ring-teal-200' : 'border-gray-200'"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-dark font-mono">{{ region.region }}</p>
                <span
                  v-if="region.isActive"
                  class="text-xs font-medium px-2 py-0.5 rounded-full bg-teal text-white"
                  title="Mail is sent from this region"
                >
                  sending
                </span>
                <span
                  v-else
                  class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                  title="Only used if the active region fails, and only for stores that have a tenant here"
                >
                  standby
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1 font-mono">{{ region.providerKey }}</p>
              <p class="text-xs text-gray-600 mt-2">
                <b>{{ region.dedicatedCount }}</b> premium ·
                <b>{{ region.freeStoreCount }}</b> on the free pool
              </p>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="statusClass(region.poolStatus || 'MISSING')"
                  title="The shared tenant every free-plan store sends under"
                >
                  pool: {{ region.poolStatus || 'none' }}
                </span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full"
                  :class="statusClass(region.platformStatus || 'MISSING')"
                  title="Our own alerts and notices send under this tenant"
                >
                  platform: {{ region.platformStatus || 'none' }}
                </span>
              </div>
            </div>

            <div class="text-right flex-shrink-0">
              <p class="text-2xl font-bold text-dark leading-none" title="Tenants in AWS here — what is billed">
                {{ region.tenantCount }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                <span :class="region.healthyCount < region.tenantCount ? 'text-amber-600 font-medium' : ''">
                  {{ region.healthyCount }} sendable
                </span>
              </p>
            </div>
          </div>

          <div v-if="canEdit" class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              @click="runBackfill(region.providerKey)"
              :disabled="!!backfill || !!teardown"
              class="text-xs px-2.5 py-1 rounded-lg border border-teal text-teal hover:bg-teal-50 disabled:opacity-40"
            >
              Fill this region
            </button>
            <button
              v-if="region.tenantCount"
              @click="tearDownRegion(region.providerKey)"
              :disabled="!!backfill || !!teardown"
              class="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Empty it
            </button>
          </div>
        </div>
      </div>

      <!-- Region migration -->
      <div v-if="showMigration" class="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 class="text-base font-semibold text-dark">Move every store to another region</h3>
        <p class="text-sm text-gray-600 mt-1">
          Three steps: fill the target region, switch sending to it, then empty the old one.
        </p>

        <div class="flex flex-wrap items-center gap-4 mt-4">
          <SelectInput v-model="migrateFrom" label="From" select-class="w-52">
            <option v-for="r in regions" :key="r.providerKey" :value="r.providerKey">
              {{ r.region }}{{ r.isActive ? ' (active)' : '' }}
            </option>
          </SelectInput>
          <SelectInput v-model="migrateTo" label="To" select-class="w-52">
            <option
              v-for="r in migrateToOptions"
              :key="r.providerKey"
              :value="r.providerKey"
            >
              {{ r.region }}{{ r.isActive ? ' (active)' : '' }}
            </option>
          </SelectInput>
          <LoadingIcon v-if="migrationLoading" size="sm" />
        </div>

        <p v-if="migrationError" class="text-sm text-red-600 mt-3">{{ migrationError }}</p>

        <template v-if="migration">
          <!-- Step 1 -->
          <div class="mt-5 flex items-start gap-3">
            <span
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              :class="migration.pendingCount ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'"
            >
              {{ migration.pendingCount ? '1' : '✓' }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-dark">
                Fill {{ migration.to.region }}
              </p>
              <p class="text-xs text-gray-600 mt-0.5">
                {{ migration.to.healthyCount }} of {{ migration.to.tenantCount }} tenant(s) sendable.
                <span v-if="migration.pendingCount" class="text-amber-700">
                  {{ migration.pendingCount }} store(s) still need one.
                </span>
              </p>
              <button
                v-if="canEdit && migration.pendingCount"
                @click="runBackfill(migration.to.providerKey)"
                :disabled="!!backfill || !!teardown"
                class="mt-2 text-xs px-3 py-1.5 rounded-lg border border-teal text-teal hover:bg-teal-50 disabled:opacity-40"
              >
                Provision {{ migration.pendingCount }} store(s)
              </button>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="mt-4 flex items-start gap-3">
            <span
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              :class="migration.to.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'"
            >
              {{ migration.to.isActive ? '✓' : '2' }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-dark">Switch sending to {{ migration.to.region }}</p>

              <ul v-if="migration.blockers.length" class="mt-1 flex flex-col gap-0.5">
                <li v-for="b in migration.blockers" :key="b" class="text-xs text-red-600">— {{ b }}</li>
              </ul>

              <div class="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p class="text-xs font-medium text-amber-900">Do these by hand first — this app cannot:</p>
                <ul class="mt-1 flex flex-col gap-1">
                  <li v-for="w in migration.warnings" :key="w" class="text-xs text-amber-800">• {{ w }}</li>
                </ul>
              </div>

              <button
                v-if="canEdit && !migration.to.isActive"
                @click="cutOver"
                :disabled="!migration.readyToCutOver || !!backfill || !!teardown"
                class="mt-2 text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                :title="migration.readyToCutOver ? '' : 'Resolve the blockers above first'"
              >
                Switch to {{ migration.to.region }}
              </button>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="mt-4 flex items-start gap-3">
            <span
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              :class="migration.from.tenantCount ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-800'"
            >
              {{ migration.from.tenantCount ? '3' : '✓' }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-dark">Empty {{ migration.from.region }}</p>
              <p class="text-xs text-gray-600 mt-0.5">
                {{ migration.from.tenantCount }} tenant(s) still there, still billing monthly.
                <span v-if="migration.from.isActive" class="text-red-600">
                  Still the active region — switch first.
                </span>
              </p>
              <button
                v-if="canEdit && migration.from.tenantCount"
                @click="tearDownRegion(migration.from.providerKey)"
                :disabled="migration.from.isActive || !!backfill || !!teardown"
                class="mt-2 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete {{ migration.from.tenantCount }} tenant(s)
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Stores with no tenant in the region being shown -->
      <div
        v-if="data && data.missingCount > 0"
        class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6"
      >
        <p class="text-sm text-gray-800">
          <b>{{ data.missingCount }}</b> tenant(s) need attention in
          <b class="font-mono">{{ shownRegion?.region || 'the active region' }}</b
          >.
        </p>
        <p class="text-xs text-gray-600 mt-1">
          <template v-if="data.missing.includes('__free__')">
            <b class="text-red-700">The free pool has no working tenant here — free-plan stores cannot
            send from this region.</b>
          </template>
          Premium stores listed here have no working dedicated tenant and are sending under the free
          pool meanwhile. The free-pool and platform tenants appear here when they are missing.
        </p>

        <div v-if="data.missing.length" class="mt-3 flex flex-wrap gap-2">
          <div
            v-for="shop in data.missing.slice(0, 40)"
            :key="shop"
            class="flex items-center gap-2 bg-white border border-gray-200 rounded-lg pl-3 pr-1 py-1"
          >
            <span class="text-xs text-dark font-mono">{{ shopLabel(shop) }}</span>
            <LoadingIcon v-if="busyShop === shop" size="xs" />
            <button
              v-else-if="canEdit"
              @click="provisionOne(shop, false, effectiveProviderKey ?? undefined)"
              :disabled="busyShop !== null"
              class="text-xs px-2 py-0.5 rounded border border-teal text-teal hover:bg-teal-50 disabled:opacity-40"
            >
              Create
            </button>
          </div>
          <span v-if="data.missing.length > 40" class="text-xs text-gray-500 self-center">
            +{{ data.missing.length - 40 }} more — use "Fill active region"
          </span>
        </div>
      </div>

      <p v-if="data && data.unassignedCount > 0" class="text-xs text-gray-500 mb-4">
        {{ data.unassignedCount }} free store(s) have no pool record in this region yet. They still
        send under the pool; "Fill active region" or the daily check adds the records.
      </p>

      <!-- Tenant table -->
      <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Store</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Type</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Region</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Tenant</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">SES status</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Resources</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Synced</th>
                <th class="px-6 py-4 text-right text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>

            <tbody class="bg-white divide-y divide-gray-200">
              <template v-if="loading && !data">
                <tr v-for="i in 6" :key="i">
                  <td class="px-6 py-4"><SkeletonLoader width="180px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="70px" height="20px" custom-class="rounded-full" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="80px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="150px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="70px" height="24px" custom-class="rounded-full" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="60px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="60px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="140px" height="24px" /></td>
                </tr>
              </template>

              <tr v-else-if="!rows.length">
                <td colspan="8" class="py-16 text-center text-gray-400">
                  <p class="text-sm italic">
                    <template v-if="statusFilter === 'risky'">No store is over a warning or pause limit.</template>
                    <template v-else-if="statusFilter !== 'all'">No tenants match this filter.</template>
                    <template v-else-if="search">No tenants match "{{ search }}".</template>
                    <template v-else>
                      No tenants yet for {{ selectedApp?.app_name }}.
                      <span v-if="canEdit">Use "Fill active region" to set them up.</span>
                    </template>
                  </p>
                </td>
              </tr>

              <tr
                v-for="row in rows"
                :key="row.region.id"
                class="hover:bg-gray-50/50 transition-colors"
                :class="row.localStatus === 'paused' ? 'bg-red-50/40' : ''"
              >
                <!-- Store -->
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium text-gray-900">
                      {{
                        row.isPlatform
                          ? 'Platform (our own mail)'
                          : row.isPool
                            ? 'Free pool (every free-plan store)'
                            : row.shop
                      }}
                    </span>
                    <span
                      v-if="row.localStatus === 'paused'"
                      class="text-xs font-medium px-2 py-0.5 rounded-full bg-red-600 text-white"
                    >
                      Paused
                    </span>
                  </div>
                  <p v-if="row.localStatus === 'paused'" class="text-xs text-red-700 mt-1">
                    {{ row.pausedReason }}
                    <span class="text-gray-500">
                      — {{ row.pausedBy === 'reputation' ? 'auto (reputation check)' : row.pausedBy || 'unknown' }},
                      {{ formatDate(row.pausedAt) }}
                    </span>
                  </p>
                  <p
                    v-if="!isSystemRow(row) && rates(row)"
                    class="text-xs mt-1"
                    :class="
                      rates(row)!.level === 'pause'
                        ? 'text-red-700 font-medium'
                        : rates(row)!.level === 'warn'
                          ? 'text-amber-700 font-medium'
                          : 'text-gray-500'
                    "
                    :title="`${rates(row)!.bounced} bounced and ${rates(row)!.complained} complaint(s) out of ${rates(row)!.sent} recipients, ${row.reputationSince ? 'since the store was resumed' : 'over the last 7 days'}. ${rates(row)!.level === null ? 'Too few recipients to be judged yet (see Daily check → Store reputation).' : 'Judged against the Daily check → Store reputation limits.'}`"
                  >
                    {{ row.reputationSince ? 'since resume' : '7d' }}: {{ rates(row)!.sent }} sent · bounce {{ rates(row)!.bounce }}% ·
                    complaints {{ rates(row)!.complaint }}%
                    <span v-if="rates(row)!.level === null" class="text-gray-400">(too few to judge)</span>
                  </p>
                </td>

                <!-- Type -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    class="text-xs font-medium px-2 py-0.5 rounded-full"
                    :class="typeClass(row.tenantType)"
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
                  </span>
                  <p
                    v-if="row.region.retiredTenantName"
                    class="text-xs text-amber-700 mt-1"
                    title="Given up on downgrade; AWS has not confirmed the delete yet. Retried daily."
                  >
                    old tenant pending delete
                  </p>
                </td>

                <!-- Region -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-mono text-gray-700">{{ row.region.region || '—' }}</span>
                    <span
                      v-if="row.region.providerKey === data?.activeProviderKey"
                      class="w-1.5 h-1.5 rounded-full bg-teal"
                      title="Active sending region"
                    />
                  </div>
                </td>

                <!-- Tenant name -->
                <td class="px-6 py-4">
                  <span class="text-xs font-mono text-gray-600">{{ row.region.tenantName }}</span>
                </td>

                <!-- SES status -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    v-if="row.tenantType === 'free'"
                    class="text-xs font-medium px-2 py-0.5 rounded-full"
                    :class="statusClass(row.region.poolStatus || 'MISSING')"
                    title="A free-plan store sends as well as its region's pool does"
                  >
                    via pool: {{ row.region.poolStatus || 'no pool' }}
                  </span>
                  <span
                    v-else
                    class="text-xs font-medium px-2 py-0.5 rounded-full"
                    :class="statusClass(row.region.sendingStatus)"
                  >
                    {{ row.region.sendingStatus }}
                  </span>
                  <p v-if="row.region.lastError" class="text-xs text-red-600 mt-1 max-w-xs">
                    {{ row.region.lastError }}
                  </p>
                </td>

                <!-- Resource associations -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <span v-if="row.tenantType === 'free'" class="text-xs text-gray-400">—</span>
                  <span
                    v-else-if="row.region.resourcesLinked"
                    class="text-xs text-green-700"
                    title="Identity and configuration set are both associated with this tenant"
                  >
                    linked
                  </span>
                  <span
                    v-else
                    class="text-xs text-amber-700 font-medium"
                    title="SES rejects sends for a tenant without both an identity and a configuration set associated. Check the IAM key has ses:CreateTenantResourceAssociation on both ARNs, then re-provision."
                  >
                    not linked
                  </span>
                </td>

                <!-- Last synced -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-xs text-gray-500" :title="formatDate(row.region.lastSyncedAt)">
                    {{ relative(row.region.lastSyncedAt) }}
                  </span>
                </td>

                <!-- Actions -->
                <td class="px-6 py-4 whitespace-nowrap text-right">
                  <div v-if="canEdit" class="flex items-center justify-end gap-1.5">
                    <LoadingIcon v-if="busyShop === row.shop" size="xs" />

                    <button
                      v-if="!isSystemRow(row)"
                      @click="recheckPlan(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-40 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      title="Look up this store's plan in Shopify now and move it to match: premium gets a dedicated tenant, free goes to the shared pool."
                    >
                      Check plan
                    </button>

                    <button
                      v-if="row.tenantType !== 'free'"
                      @click="provisionOne(row.shop, false, row.region.providerKey)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-40 border-blue-200 text-blue-700 hover:bg-blue-50"
                      title="Repair: re-runs create and resource association under the same tenant name. Nothing is deleted and SES history is kept."
                    >
                      Re-provision
                    </button>

                    <button
                      v-if="row.localStatus !== 'paused'"
                      @click="pause(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-40 border-amber-300 text-amber-700 hover:bg-amber-50"
                      title="Stops this store's mail in every region it has a tenant in. Reversible — nothing is deleted."
                    >
                      Pause
                    </button>
                    <button
                      v-else
                      @click="resume(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border border-teal text-teal hover:bg-teal-50 disabled:opacity-40"
                    >
                      Resume
                    </button>

                    <button
                      v-if="regions.length > 1 && row.tenantType !== 'free'"
                      @click="addToRegion(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      title="Create a tenant for this store in another region"
                    >
                      Add region
                    </button>

                    <button
                      v-if="row.tenantType !== 'free'"
                      @click="rotateTenant(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-40 border-red-300 text-red-700 hover:bg-red-50"
                      title="Creates a new tenant under a new name, switches to it once it can send, then deletes this one. SES reputation and history start over — use Re-provision to repair a broken tenant instead."
                    >
                      Replace
                    </button>

                    <button
                      @click="removeTenant(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-40 border-red-300 text-red-700 hover:bg-red-50"
                      title="Permanently deletes this store's tenant and stops the per-tenant AWS charge."
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="data && data.total"
          class="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex items-center gap-4 flex-wrap"
        >
          <span>
            Stores {{ pageStart }}–{{ pageEnd }} of {{ data.total }}
            <span v-if="regionFilter"> in {{ shownRegion?.region }}</span>
          </span>

          <label class="flex items-center gap-1.5">
            Per page
            <select v-model.number="pageSize" class="border border-gray-300 rounded px-1.5 py-0.5 bg-white">
              <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
            </select>
          </label>

          <div class="ml-auto flex items-center gap-1">
            <button
              type="button"
              @click="page = 1"
              :disabled="page <= 1 || loading"
              class="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-40"
            >
              «
            </button>
            <button
              type="button"
              @click="page--"
              :disabled="page <= 1 || loading"
              class="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-40"
            >
              Previous
            </button>
            <span class="px-2">Page {{ page }} of {{ pageCount }}</span>
            <button
              type="button"
              @click="page++"
              :disabled="page >= pageCount || loading"
              class="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-40"
            >
              Next
            </button>
            <button
              type="button"
              @click="page = pageCount"
              :disabled="page >= pageCount || loading"
              class="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-40"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
