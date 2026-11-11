<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useInstallationsStore } from '@/stores/installations.ts';
import { useAuthStore } from '@/stores/auth';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  ExternalLink,
  List,
  ShoppingBag,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import SearchInput from '@/components/common/SearchInput.vue';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toQuery } from '@/utils/query';
import DateRangePicker, { toDateFilter, type DateFilter } from '@/components/common/DateRangePicker.vue';
import dayjs from 'dayjs';
import { saveBlob } from '@/utils/export';
import { apiService } from '@/config/api';
import { toast } from '@/utils/toast';
import type { Tone } from '@/lib/tones';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import AppPagination from '@/components/common/AppPagination.vue';
import AppAlert from '@/components/common/AppAlert.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { toggleInList } from '@/lib/list';

const installationsStore = useInstallationsStore();
const authStore = useAuthStore();
const route = useRoute();
const searchQuery = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const date = ref<Date[] | null>(null);
const sortBy = ref<string>('installed_at');
const sortOrder = ref<'asc' | 'desc'>('desc');
const currentPage = ref(1);
const perPage = ref(50);

// Set when the list is opened for one app from the sidebar
const appId = computed(() => route.query.app_id ? Number(route.query.app_id) : undefined);

// Filter States
const selectedPlans = ref<string[]>([]);
const selectedShopifyPlans = ref<string[]>([]);
const selectedStatuses = ref<boolean[]>([]);
const installCountMin = ref<number | null>(null);
const installCountMax = ref<number | null>(null);

// Which advanced filter sections are expanded
const openSections = ref({
  status: true,
  plans: true,
  shopifyPlans: true,
  installCount: true,
});

/** Reads an install-count box; a cleared box means no bound. */
const toCount = (value: string | number): number | null => (value === '' ? null : Number(value));

// Options from Store
const appPlanOptions = computed(() => 
    (installationsStore.filterOptions?.app_plans || []).map(plan => ({
        label: plan || 'Unknown',
        value: plan
    }))
);

const shopifyPlanOptions = computed(() => 
    (installationsStore.filterOptions?.shopify_plans || []).map(plan => {
        // Format label: "partner_test" -> "Partner Test"
        const label = plan
            .split(/[_\s]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
            
        return {
            label: label,
            value: plan
        };
    })
);

const statusOptions = [
    { label: 'Installed', value: true },
    { label: 'Uninstalled', value: false }
];

/**
 * The viewer's IANA timezone, e.g. "Asia/Dhaka". Falls back to UTC on the rare
 * runtime that cannot report one, which is what the API assumes anyway.
 */
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// A full range was picked or the field was cleared
const handleDateChange = (range: DateFilter) => {
  dateFrom.value = range.from;
  dateTo.value = range.to;
  applyFilters();
};

onMounted(() => {
  fetchData();
  installationsStore.fetchFilters(appId.value);
});

// Switching app from the sidebar: the plan options change with it, so a plan
// picked for the previous app would only empty the list.
watch(appId, () => {
  selectedPlans.value = [];
  selectedShopifyPlans.value = [];
  applyFilters();
  installationsStore.fetchFilters(appId.value);
});

// Watch for per page changes and refetch
watch(perPage, () => applyFilters());

const setDateRange = (direction: 'previous' | 'next') => {
    const currentRange = date.value;
    if (!currentRange || currentRange.length < 2) return;
    
    const startDate = currentRange[0];
    const endDate = currentRange[1];

    if (direction === 'previous') {
        date.value = [
            dayjs(startDate).subtract(30, 'days').toDate(),
            dayjs(startDate).subtract(1, 'day').toDate()
        ]
    }

    if (direction === 'next') {
        date.value = [
            dayjs(endDate).add(1, 'day').toDate(),
            dayjs(endDate).add(30, 'days').toDate()
        ]
    }
    
    const range = toDateFilter(date.value);
    if (range) handleDateChange(range);
}

/**
 * Everything currently narrowing the list, minus pagination.
 *
 * Shared by the table and the export so a download cannot apply a different
 * set of filters from the one on screen.
 */
const currentFilters = () => ({
  search: searchQuery.value || undefined,
  date_from: dateFrom.value || undefined,
  date_to: dateTo.value || undefined,
  // The picker gives calendar days in the browser's zone and the table
  // renders install dates in it too, so the filter has to be read in the
  // same zone - otherwise an evening install east of UTC lands on the
  // neighbouring day on one side only. Sent whether or not a date filter is
  // set, because the export also writes its Installed column in this zone.
  timezone: browserTimezone,
  sort_by: sortBy.value || undefined,
  sort_order: sortOrder.value,
  plan_name: selectedPlans.value.length ? selectedPlans.value : undefined,
  shopify_plans: selectedShopifyPlans.value.length ? selectedShopifyPlans.value : undefined,
  is_active: selectedStatuses.value.length === 1 ? selectedStatuses.value[0] : undefined,
  // a cleared box is null (see toCount)
  install_count_min: typeof installCountMin.value === 'number' ? installCountMin.value : undefined,
  install_count_max: typeof installCountMax.value === 'number' ? installCountMax.value : undefined,
  app_id: appId.value,
});

const fetchData = async () => {
  await installationsStore.fetchInstallations({
    ...currentFilters(),
    per_page: perPage.value,
    page: currentPage.value,
  });
};

// Any filter change can shrink the result below the current page, so start
// again from page 1 (staying on page 3 of a 1-page result showed nothing).
const applyFilters = () => {
  currentPage.value = 1;
  fetchData();
};

const clearSearch = () => {
  searchQuery.value = '';
  applyFilters();
};

const resetFilters = () => {
  selectedPlans.value = [];
  selectedShopifyPlans.value = [];
  selectedStatuses.value = [];
  installCountMin.value = null;
  installCountMax.value = null;
  applyFilters();
};

const handleSort = (column: string) => {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = column;
    sortOrder.value = 'asc';
  }
  applyFilters();
};

const exporting = ref(false);

/**
 * Download every row the current filters match, not just the page on screen.
 *
 * The server builds the file from the same query the list uses and streams
 * it back, so the size of the result does not depend on the page size and the
 * browser never has to hold the whole set.
 */
const handleExport = async () => {
  if ((installationsStore.pagination?.total ?? 0) === 0) {
    toast.info('Nothing to export for these filters');
    return;
  }

  exporting.value = true;

  try {
    const fallback = `installations_export_${dayjs().format('YYYY-MM-DD')}.csv`;
    const { blob, filename } = await apiService.download(
      `/installations/export${toQuery(currentFilters())}`,
      fallback
    );

    saveBlob(blob, filename);

    toast.success(`Exported ${(installationsStore.pagination?.total ?? 0).toLocaleString()} installations`);
  } catch (err) {
    toast.error((err as Error).message || 'Export failed');
  } finally {
    exporting.value = false;
  }
};

// Sortable table columns; the App column only shows across all apps
const columns = computed(() => [
  ...(appId.value ? [] : [{ key: 'app_name', label: 'App' }]),
  { key: 'store_name', label: 'Store' },
  { key: 'email', label: 'Email' },
  { key: 'app_plan', label: 'Plan' },
  { key: 'shopify_plan', label: 'Shopify Plan' },
  { key: 'is_active', label: 'Status' },
  { key: 'installed_at', label: 'Installed' },
]);

// No client-side sorting needed - handled by server
const paginatedInstallations = computed(() => {
  return installationsStore.installations;
});



const totalPages = computed(() => {
  if (!installationsStore.pagination) return 1;
  return installationsStore.pagination.last_page || 1;
});

const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
    fetchData();
  }
};

const getStatusTone = (isActive: boolean): Tone => {
  return isActive ? 'success' : 'danger';
};

const getStatusText = (isActive: boolean) => {
  return isActive ? 'Installed' : 'Uninstalled';
};

/**
 * Tint for the store-name badge.
 *
 * install_count is 1 for a store that installed once and stayed. Anything
 * higher is a reinstall, so the badge escalates with how often a store has
 * churned: grey for the ordinary case, amber for a few, red for a lot.
 *
 * Shared by the name badge and the count badge beside it, so the pair always
 * reads as one thing rather than two colours disagreeing.
 */
const getInstallCountTone = (count: number): Tone => {
  if (count > 5) return 'danger';
  if (count > 1) return 'warning';
  return 'neutral';
};

const getInstallCountTitle = (count: number) => {
  if (count <= 1) return 'Installed once, never reinstalled';

  return `Installed ${count} times (${count - 1} reinstall${count === 2 ? '' : 's'})`;
};

const getPlanDetails = (appPlan: string | null) => {
  if (!appPlan) return null;
  
  try {
    const data = typeof appPlan === 'string' ? JSON.parse(appPlan) : appPlan;
    
    if (data && typeof data === 'object' && data.plan_name) {
      const name = data.plan_name;
      const status = data.status;
      const isFree = name.toLowerCase().includes('free');

      if (isFree) return { name, isDetailed: false };

      let validity = '';
      if (status?.toLowerCase() === 'active' && data.plan_started_at) {
        const startDate = dayjs(data.plan_started_at);
        const trialDays = data.trial_days || 0;
        const isAnnual = name.toLowerCase().includes('annual');
        
        const expiryDate = startDate.add(trialDays, 'day').add(1, isAnnual ? 'year' : 'month');
        validity = expiryDate.format('MMM DD, YYYY');
      }

      return {
        name,
        status,
        validity,
        isDetailed: true
      };
    }
  } catch {
    // Not JSON: fall through to the plain plan name
  }
  
  return { name: appPlan || 'No plan', isDetailed: false };
};

const getShopifyPlan = (shopifyPlan: string | null) => {
  if (!shopifyPlan) return 'N/A';
  return shopifyPlan;
};
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Installation List" />

    <!-- Main Content Area with Sidebar -->
    <div class="flex flex-col lg:flex-row gap-5">
      <!-- Sidebar Filters -->
      <div class="w-full lg:w-64 flex-shrink-0 space-y-5">
        <!-- Advance Filter -->
        <Card class="gap-0 p-5">
          <div class="mb-4 flex items-center justify-between border-b pb-2">
            <h3 class="font-heading text-lg font-semibold">Advance Filter</h3>
            <Button variant="link" class="h-auto p-0" @click="resetFilters">Reset</Button>
          </div>

          <div class="space-y-4">
            <!-- Status Filter -->
            <Collapsible v-model:open="openSections.status">
              <CollapsibleTrigger class="group mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm font-medium text-foreground">
                <CircleCheck class="size-4" />
                <span class="flex-1 text-left">Status</span>
                <span v-if="selectedStatuses.length" class="text-xs font-semibold text-primary">{{ selectedStatuses.length }}</span>
                <ChevronDown class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Label
                  v-for="status in statusOptions"
                  :key="String(status.value)"
                  class="w-full cursor-pointer px-2.5 py-1.5 font-normal text-foreground transition hover:text-primary"
                >
                  <Checkbox
                    :model-value="selectedStatuses.includes(status.value)"
                    class="mt-1"
                    @update:model-value="(checked) => { selectedStatuses = toggleInList(selectedStatuses, status.value, checked); applyFilters(); }"
                  />
                  {{ status.label }}
                </Label>
              </CollapsibleContent>
            </Collapsible>

            <!-- App Plan Filter -->
            <Collapsible v-model:open="openSections.plans">
              <CollapsibleTrigger class="group mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm font-medium text-foreground">
                <List class="size-4" />
                <span class="flex-1 text-left">Plans</span>
                <span v-if="selectedPlans.length" class="text-xs font-semibold text-primary">{{ selectedPlans.length }}</span>
                <ChevronDown class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Label
                  v-for="plan in appPlanOptions"
                  :key="plan.value"
                  class="w-full cursor-pointer px-2.5 py-1.5 font-normal text-foreground transition hover:text-primary"
                >
                  <Checkbox
                    :model-value="selectedPlans.includes(plan.value)"
                    class="mt-1"
                    @update:model-value="(checked) => { selectedPlans = toggleInList(selectedPlans, plan.value, checked); applyFilters(); }"
                  />
                  {{ plan.label }}
                </Label>
                <p v-if="appPlanOptions.length === 0" class="px-2.5 py-1.5 text-sm text-muted-foreground italic">No plans</p>
              </CollapsibleContent>
            </Collapsible>

            <!-- Shopify Plan Filter -->
            <Collapsible v-model:open="openSections.shopifyPlans">
              <CollapsibleTrigger class="group mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm font-medium text-foreground">
                <ShoppingBag class="size-4" />
                <span class="flex-1 text-left">Shopify Plan</span>
                <span v-if="selectedShopifyPlans.length" class="text-xs font-semibold text-primary">{{ selectedShopifyPlans.length }}</span>
                <ChevronDown class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Label
                  v-for="plan in shopifyPlanOptions"
                  :key="plan.value"
                  class="w-full cursor-pointer px-2.5 py-1.5 font-normal text-foreground transition hover:text-primary"
                >
                  <Checkbox
                    :model-value="selectedShopifyPlans.includes(plan.value)"
                    class="mt-1"
                    @update:model-value="(checked) => { selectedShopifyPlans = toggleInList(selectedShopifyPlans, plan.value, checked); applyFilters(); }"
                  />
                  {{ plan.label }}
                </Label>
                <p v-if="shopifyPlanOptions.length === 0" class="px-2.5 py-1.5 text-sm text-muted-foreground italic">No Shopify plans</p>
              </CollapsibleContent>
            </Collapsible>

            <!-- Install Count Filter -->
            <Collapsible v-model:open="openSections.installCount">
              <CollapsibleTrigger class="group mb-2.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm font-medium text-foreground">
                <ArrowLeftRight class="size-4" />
                <span class="flex-1 text-left">Install Count</span>
                <ChevronDown class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent class="flex items-center gap-2">
                <Input
                  :model-value="installCountMin ?? ''"
                  @update:model-value="(value) => (installCountMin = toCount(value))"
                  type="number"
                  name="install_count_min"
                  placeholder="Min"
                  aria-label="Minimum install count"
                  @change="applyFilters"
                />
                <span class="text-muted-foreground">-</span>
                <Input
                  :model-value="installCountMax ?? ''"
                  @update:model-value="(value) => (installCountMax = toCount(value))"
                  type="number"
                  name="install_count_max"
                  placeholder="Max"
                  aria-label="Maximum install count"
                  @change="applyFilters"
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </Card>
      </div>

      <!-- Right Column: Existing Content -->
      <div class="flex-1 min-w-0 space-y-6">
        <Card size="sm">
          <CardContent class="flex flex-wrap items-center justify-between gap-4">
            <!-- Left side: Search -->
            <div class="flex items-center gap-2 min-w-[250px] max-w-md">
              <SearchInput
                v-model="searchQuery"
                name="search"
                placeholder="Search"
                container-class="flex-1"
                clearable
                @search="applyFilters"
                @clear="clearSearch"
              />

              <!-- Total Count -->
              <div class="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Showing <span class="font-semibold text-primary">{{ (installationsStore.pagination?.total ?? 0).toLocaleString() }}</span> items
              </div>
            </div>

            <!-- Right side: Export Button -->
            <div class="flex items-center gap-2">
              <!-- Navigation Arrows -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  @click="setDateRange('previous')"
                  :disabled="!date || date.length === 0 || date[0] === null"
                  title="Previous page"
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>

                <!-- Date Range -->
                <div class="flex items-center gap-2">
                  <DateRangePicker v-model="date" @change="handleDateChange" />
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  @click="setDateRange('next')"
                  :disabled="!date || date.length === 0 || date[0] === null"
                  title="Next date range"
                  aria-label="Next date range"
                >
                  <ChevronRight />
                </Button>
              </div>

              <Button
                v-if="authStore.hasPermission('installations.export')"
                @click="handleExport"
                :disabled="exporting"
                :title="`Export all ${(installationsStore.pagination?.total ?? 0).toLocaleString()} matching installations`"
              >
                <Spinner v-if="exporting" />
                <Download v-else />
                {{ exporting ? 'Exporting...' : 'Export' }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Error State -->
        <AppAlert v-if="installationsStore.error" tone="danger">
          {{ installationsStore.error }}
        </AppAlert>

        <!-- Installations Table -->
        <Card v-else class="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader class="bg-muted/50">
              <TableRow class="hover:bg-transparent">
                <TableHead
                  v-for="column in columns"
                  :key="column.key"
                  scope="col"
                  class="cursor-pointer select-none px-6 text-muted-foreground font-semibold hover:bg-muted"
                  @click="handleSort(column.key)"
                >
                  <div class="flex items-center gap-1">
                    <span>{{ column.label }}</span>
                    <ArrowUpDown v-if="sortBy !== column.key" class="size-4 text-muted-foreground" />
                    <ArrowUp v-else-if="sortOrder === 'asc'" class="size-4 text-primary" />
                    <ArrowDown v-else class="size-4 text-primary" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="installationsStore.loading">
                <TableRow v-for="i in 5" :key="i">
                  <TableCell v-if="!appId" class="px-6 py-4"><SkeletonLoader width="100px" height="16px" /></TableCell>
                  <TableCell class="px-6 py-4"><SkeletonLoader width="150px" height="24px" custom-class="rounded-full" /></TableCell>
                  <TableCell class="px-6 py-4"><SkeletonLoader width="200px" height="16px" /></TableCell>
                  <TableCell class="px-6 py-4"><SkeletonLoader width="80px" height="24px" custom-class="rounded-full" /></TableCell>
                  <TableCell class="px-6 py-4"><SkeletonLoader width="100px" height="24px" custom-class="rounded-full" /></TableCell>
                  <TableCell class="px-6 py-4"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></TableCell>
                  <TableCell class="px-6 py-4"><SkeletonLoader width="100px" height="16px" /></TableCell>
                </TableRow>
              </template>
              <TableRow v-else v-for="installation in paginatedInstallations" :key="installation.id">
                <TableCell v-if="!appId" class="px-6 py-4 font-medium text-foreground">
                  {{ installation.app?.app_name || 'N/A' }}
                </TableCell>
                <TableCell class="px-6 py-4">
                  <div class="flex items-center gap-1.5">
                    <StatusBadge
                      :tone="getInstallCountTone(installation.install_count)"
                      :title="getInstallCountTitle(installation.install_count)"
                    >
                      {{ installation.store_name }}
                    </StatusBadge>
                    <StatusBadge
                      :tone="getInstallCountTone(installation.install_count)"
                      class="font-semibold tabular-nums"
                      :title="getInstallCountTitle(installation.install_count)"
                    >
                      {{ installation.install_count }}
                    </StatusBadge>
                    <a
                      v-if="installation.store_url"
                      :href="'https://' + installation.store_url"
                      target="_blank"
                      class="text-muted-foreground hover:text-primary transition-colors"
                      title="Open store in new tab"
                    >
                      <ExternalLink class="size-4" />
                    </a>
                  </div>
                </TableCell>
                <TableCell class="px-6 py-4 text-muted-foreground">
                  {{ installation.email }}
                </TableCell>
                <TableCell class="px-6 py-4 whitespace-normal">
                  <div v-if="getPlanDetails(installation.app_plan)" class="flex flex-col gap-1.5">
                    <StatusBadge tone="info">
                      {{ getPlanDetails(installation.app_plan)?.name }}
                    </StatusBadge>
                    <template v-if="getPlanDetails(installation.app_plan)?.isDetailed">
                      <StatusBadge
                        :tone="getPlanDetails(installation.app_plan)?.status?.toLowerCase() === 'cancelled' ? 'danger' : 'info'"
                        class="text-[10px] capitalize"
                      >
                        {{ getPlanDetails(installation.app_plan)?.status?.toLowerCase() }}
                      </StatusBadge>
                      <StatusBadge v-if="getPlanDetails(installation.app_plan)?.validity" tone="info" class="text-[10px]">
                        Valid until {{ getPlanDetails(installation.app_plan)?.validity }}
                      </StatusBadge>
                    </template>
                  </div>
                  <span v-else class="text-sm text-muted-foreground italic">No plan</span>
                </TableCell>
                <TableCell class="px-6 py-4">
                  <StatusBadge>
                    {{ getShopifyPlan(installation.shopify_plan) }}
                  </StatusBadge>
                </TableCell>
                <TableCell class="px-6 py-4">
                  <StatusBadge :tone="getStatusTone(installation.is_active)">
                    {{ getStatusText(installation.is_active) }}
                  </StatusBadge>
                </TableCell>
                <TableCell class="px-6 py-4 text-muted-foreground">
                  {{ installation.installed_at ? dayjs(installation.installed_at).format('MMM DD, YYYY') : 'N/A' }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <!-- Empty State -->
          <Empty v-if="paginatedInstallations.length === 0" class="py-12">
            <EmptyDescription>No installations found</EmptyDescription>
          </Empty>

          <!-- Pagination -->
          <AppPagination
            v-if="paginatedInstallations.length > 0"
            v-model:per-page="perPage"
            :current-page="currentPage"
            :last-page="totalPages"
            :total="installationsStore.pagination?.total ?? 0"
            :from="installationsStore.pagination?.from"
            :to="installationsStore.pagination?.to"
            item-label="installations"
            :per-page-options="[25, 50, 100]"
            @update:current-page="goToPage"
          />
        </Card>
      </div>
    </div>
  </div>
</template>
