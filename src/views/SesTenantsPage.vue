<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
  sesTenantService,
  type MigrationStatus,
  type SesTenantList,
  type SesTenantRegion,
  type SesTenantShop,
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
 * One SES tenant per Shopify store, per region.
 *
 * Tenants isolate sending reputation, so a single store with a bad list cannot
 * pause the whole SES account. This page is where an operator creates them for
 * existing stores, stops a store that is behaving badly, and moves the whole
 * estate from one AWS region to another.
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

/**
 * Set while the default above is being materialised, so resolving "active"
 * into a concrete key does not fire a second identical fetch.
 */
const applyingDefaultRegion = ref(false);
const statusFilter = ref<string>('all');

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

/** True when SES would reject a send for this tenant right now. */
const isBroken = (row: TenantRow) =>
  row.region.sendingStatus === 'ERROR' ||
  row.region.sendingStatus === 'MISSING' ||
  row.region.sendingStatus === 'PENDING' ||
  !row.region.resourcesLinked;

const rows = computed(() => {
  const list = allRows.value;

  if (statusFilter.value === 'paused') return list.filter((r) => r.localStatus === 'paused');
  if (statusFilter.value === 'broken') return list.filter(isBroken);
  if (statusFilter.value === 'healthy')
    return list.filter((r) => r.localStatus !== 'paused' && !isBroken(r));

  return list;
});

const pausedCount = computed(() => allRows.value.filter((r) => r.localStatus === 'paused').length);
const brokenCount = computed(() => allRows.value.filter(isBroken).length);

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
  if (selectedAppId.value !== null) fetchTenants();
});

watch(regionFilter, () => {
  if (applyingDefaultRegion.value) {
    applyingDefaultRegion.value = false;
    return;
  }
  fetchTenants();
});

let searchTimer: number | undefined;
watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => fetchTenants(), 350);
});

const fetchTenants = async () => {
  if (selectedAppId.value === null) return;

  try {
    loading.value = true;
    loadError.value = null;

    const response = await sesTenantService.getAll(selectedAppId.value, {
      search: search.value.trim() || undefined,
      limit: 500,
      // Only the "stores without tenants" count is scoped by this — the tenant
      // rows always come back for every region, which is what lets the table
      // show a store's other-region tenants and the move dialog offer them.
      // Omitted means the active region, matching what provisioning would do.
      providerKey: regionFilter.value ?? undefined,
    });

    if (response.success && response.data) {
      data.value = response.data;

      // The first load is the earliest point the active region is known, so
      // that is where the picker's default stops being implicit.
      if (regionFilter.value === null && response.data.activeProviderKey) {
        applyingDefaultRegion.value = true;
        regionFilter.value = response.data.activeProviderKey;
      }
    } else {
      loadError.value = response.message || 'Failed to load tenants';
    }
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load tenants';
  } finally {
    loading.value = false;
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
    title: `Create tenants in ${label}?`,
    html: `This creates one SES tenant per store in <b>${label}</b> only.<br><br>
           About <b>${data.value.missingCount}</b> store(s) still need one there.<br><br>
           <span style="color:#b45309">Note: AWS charges per tenant per month, per region.</span>`,
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
 * Replaces a store's tenant with a freshly named one, in one region.
 *
 * For when the existing tenant should be abandoned rather than repaired — its
 * reputation history is unwanted, say. The old tenant is deleted as part of the
 * operation, so nothing is left behind billing.
 */
const rotateTenant = async (row: TenantRow) => {
  const confirmed = await Swal.fire({
    icon: 'warning',
    title: `Replace the tenant for ${row.shop}?`,
    html: `The tenant in <b>${row.region.region}</b> is <b>deleted</b> and a new one is created under a
           new name.<br><br>Its sending history and reputation in SES start over. Use
           "Re-provision" instead if you only want to repair a broken tenant.`,
    showCancelButton: true,
    confirmButtonText: 'Delete and recreate',
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
    Toast.fire({ icon: 'info', title: `${row.shop} already has a tenant in every region` });
    return;
  }

  const { value: providerKey } = await Swal.fire({
    icon: 'question',
    title: `Add a tenant for ${row.shop}`,
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

  const confirmed = await Swal.fire({
    icon: 'warning',
    title: `Delete the tenant for ${row.shop}?`,
    html: `Permanently deletes its tenant in <b>${row.region.region}</b> and stops that
           per-tenant AWS charge.
           ${
             isActiveRegion
               ? `<br><br><span style="color:#dc2626"><b>This is the active sending region.</b>
                  With a TENANT suppression scope, SES rejects mail that names no tenant — so this
                  store stops sending until it has one again.</span>`
               : ''
           }`,
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
    title: `Pause email for ${row.shop}?`,
    text: 'All email for this store stops immediately, in every region it has a tenant in. Give a reason — it is recorded and shown here.',
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
    title: `Resume email for ${row.shop}?`,
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
    title: `Send all mail from ${target.region}?`,
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
    title: `Delete every tenant in ${label}?`,
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

// --- Presentation ----------------------------------------------------------

const statusClass = (status: string) => {
  if (status === 'ENABLED') return 'bg-green-100 text-green-800';
  if (status === 'REINSTATED') return 'bg-blue-100 text-blue-800';
  if (status === 'DISABLED') return 'bg-red-100 text-red-800';
  if (status === 'ERROR') return 'bg-red-100 text-red-800';
  // Gone from AWS, so amber rather than red: the store still exists, and
  // Re-provision fixes it.
  if (status === 'MISSING') return 'bg-amber-100 text-amber-800';
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
      description="One SES tenant per store, so a single store's reputation cannot pause the whole account"
    >
      <template #actions>
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
          Create missing tenants
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

      <SelectInput v-if="data" v-model="statusFilter" label="Status" select-class="w-44">
        <option value="all">All ({{ allRows.length }})</option>
        <option value="healthy">Sendable</option>
        <option value="broken">Needs attention ({{ brokenCount }})</option>
        <option value="paused">Paused ({{ pausedCount }})</option>
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
      <!-- Region cards: which region is live, and how full each one is -->
      <div v-if="regions.length" class="grid gap-4 mb-6" :class="regions.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'">
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
            </div>

            <div class="text-right flex-shrink-0">
              <p class="text-2xl font-bold text-dark leading-none">{{ region.tenantCount }}</p>
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
          <b>{{ data.missingCount }}</b> active store(s) have no usable tenant in
          <b class="font-mono">{{ shownRegion?.region || 'the active region' }}</b
          >.
        </p>
        <p class="text-xs text-gray-600 mt-1">
          SES rejects mail that names no tenant, so these stores cannot send from this region until
          they have one. A store whose tenant was deleted appears here.
        </p>

        <div v-if="data.missing.length" class="mt-3 flex flex-wrap gap-2">
          <div
            v-for="shop in data.missing.slice(0, 40)"
            :key="shop"
            class="flex items-center gap-2 bg-white border border-gray-200 rounded-lg pl-3 pr-1 py-1"
          >
            <span class="text-xs text-dark font-mono">{{ shop }}</span>
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
            +{{ data.missing.length - 40 }} more — use "Create missing tenants"
          </span>
        </div>
      </div>

      <!-- Tenant table -->
      <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Store</th>
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
                  <td class="px-6 py-4"><SkeletonLoader width="80px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="150px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="70px" height="24px" custom-class="rounded-full" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="60px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="60px" height="16px" /></td>
                  <td class="px-6 py-4"><SkeletonLoader width="140px" height="24px" /></td>
                </tr>
              </template>

              <tr v-else-if="!rows.length">
                <td colspan="7" class="py-16 text-center text-gray-400">
                  <p class="text-sm italic">
                    <template v-if="statusFilter !== 'all'">No tenants match this filter.</template>
                    <template v-else-if="search">No tenants match "{{ search }}".</template>
                    <template v-else>
                      No tenants yet for {{ selectedApp?.app_name }}.
                      <span v-if="canEdit">Use "Create missing tenants" to provision them.</span>
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
                      {{ row.isPlatform ? 'Platform (our own mail)' : row.shop }}
                    </span>
                    <span
                      v-if="row.isPlatform"
                      class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-700"
                      title="Install and uninstall notices, spam alerts and billing warnings send under this tenant instead of borrowing a merchant's"
                    >
                      system
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
                      — {{ row.pausedBy || 'unknown' }}, {{ formatDate(row.pausedAt) }}
                    </span>
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
                  <span
                    v-if="row.region.resourcesLinked"
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
                      v-if="regions.length > 1"
                      @click="addToRegion(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      title="Create a tenant for this store in another region"
                    >
                      Add region
                    </button>

                    <button
                      @click="rotateTenant(row)"
                      :disabled="busyShop !== null"
                      class="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-40 border-red-300 text-red-700 hover:bg-red-50"
                      title="Deletes this tenant and creates a new one under a new name. SES reputation and history start over — use Re-provision to repair a broken tenant instead."
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
          v-if="data && rows.length"
          class="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500"
        >
          Showing {{ rows.length }} of {{ allRows.length }} tenant row(s)
          <span v-if="regionFilter"> in {{ shownRegion?.region }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
