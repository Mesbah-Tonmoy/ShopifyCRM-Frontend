<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useInstallationsStore } from '@/stores/installations.ts';
import { useAuthStore } from '@/stores/auth';
import { SortIcon, ChevronDown } from '@/components/icons';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import dayjs from 'dayjs';
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns';
import { exportToCSV } from '@/utils/export';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';

const installationsStore = useInstallationsStore();
const authStore = useAuthStore();
const route = useRoute();
const searchQuery = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const date = ref<Date[] | null>(null);
const sortBy = ref<string>('');
const sortOrder = ref<'asc' | 'desc'>('asc');
const currentPage = ref(1);
const perPage = ref(50);
const totalInstallations = ref(0);

// Filter States
const selectedPlans = ref<string[]>([]);
const selectedShopifyPlans = ref<string[]>([]);
const selectedStatuses = ref<boolean[]>([]);
const installCountMin = ref<number | null>(null);
const installCountMax = ref<number | null>(null);

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

// Handle date range changes
const handleDateChange = (newDate: Date[] | null) => {
  if (newDate && newDate.length === 2 && newDate[0] && newDate[1]) {
    // Both dates selected - fetch data
    dateFrom.value = dayjs(newDate[0]).format('YYYY-MM-DD');
    dateTo.value = dayjs(newDate[1]).format('YYYY-MM-DD');
    currentPage.value = 1;
    fetchData();
  } else if (!newDate || newDate.length === 0) {
    // Dates cleared - fetch all data
    dateFrom.value = '';
    dateTo.value = '';
    currentPage.value = 1;
    fetchData();
  }
  // Don't fetch when only one date is selected (length === 1)
};

onMounted(() => {
  fetchData();
  installationsStore.fetchFilters();
});

// Watch for route query changes (when clicking apps in Sidebar)
watch(() => route.query.app_id, () => {
  currentPage.value = 1;
  fetchData();
});

// Watch for per page changes and refetch
watch(perPage, () => {
  currentPage.value = 1;
  fetchData();
});

const dateRangePlaceholderText = computed(() => {
  const firstDay = dayjs().startOf('month');
  const lastDay = dayjs().endOf('month');

  const formattedFirstDay = firstDay.format('MMM DD, YYYY');
  const formattedLastDay = lastDay.format('MMM DD, YYYY');

  return `${formattedFirstDay} - ${formattedLastDay}`
});

const presetDates = ref([
  {
    label: 'Today (Slot)',
    value: [new Date(), new Date()],
    slot: 'preset-date-range-button'
  },
  { label: 'Today', value: [new Date(), new Date()] },
  { label: 'Last 7 Days', value: [subDays(new Date(), 7), new Date()] },
  { label: 'This Month', value: [startOfMonth(new Date()), endOfMonth(new Date())] },
  {
    label: 'Last Month',
    value: [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))],
  },
  { label: 'This Year', value: [startOfYear(new Date()), endOfYear(new Date())] },
]);

const setDateRange = (direction: 'previous' | 'next') => {
    let currentRange = date.value;
    if (!currentRange || currentRange.length < 2) return;
    
    let startDate = currentRange[0];
    let endDate = currentRange[1];

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
    
    handleDateChange(date.value);
}

const fetchData = async () => {
  await installationsStore.fetchInstallations({
    search: searchQuery.value || undefined,
    date_from: dateFrom.value || undefined,
    date_to: dateTo.value || undefined,
    per_page: perPage.value,
    page: currentPage.value,
    sort_by: sortBy.value || undefined,
    sort_order: sortOrder.value,
    plan_name: selectedPlans.value.length ? selectedPlans.value : undefined,
    shopify_plans: selectedShopifyPlans.value.length ? selectedShopifyPlans.value : undefined,
    is_active: selectedStatuses.value.length === 1 ? selectedStatuses.value[0] : undefined,
    install_count_min: installCountMin.value !== null ? installCountMin.value : undefined,
    install_count_max: installCountMax.value !== null ? installCountMax.value : undefined,
    app_id: route.query.app_id ? Number(route.query.app_id) : undefined,
  });
  
  // Update total from API response
  if (installationsStore.pagination) {
    totalInstallations.value = installationsStore.pagination.total;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  fetchData();
};

const clearSearch = () => {
  searchQuery.value = '';
  currentPage.value = 1;
  fetchData();
};

const clearDates = () => {
  date.value = null;
  dateFrom.value = '';
  dateTo.value = '';
  currentPage.value = 1;
  fetchData();
};

const resetFilters = () => {
  selectedPlans.value = [];
  selectedShopifyPlans.value = [];
  selectedStatuses.value = [];
  installCountMin.value = null;
  installCountMax.value = null;
  currentPage.value = 1;
  fetchData();
};

const handleSort = (column: string) => {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = column;
    sortOrder.value = 'asc';
  }
  fetchData();
};

const handleExport = () => {
  if (paginatedInstallations.value.length === 0) {
    alert('No data to export');
    return;
  }

  // Define headers
  const headers = ['App', 'Store', 'Email', 'Plan', 'Shopify Plan', 'Status', 'Installs', 'Created'];
  
  // Map data to rows
  const rows = paginatedInstallations.value.map((item: any) => [
    item.app?.app_name || 'N/A',
    item.store_name,
    item.email,
    getPlanDetails(item.app_plan)?.name || 'No plan',
    getShopifyPlan(item.shopify_plan),
    getStatusText(item.is_active),
    item.install_count,
    new Date(item.created_at).toLocaleDateString()
  ]);

  const filename = `installations_export_${new Date().toISOString().split('T')[0]}`;
  exportToCSV(filename, headers, rows);
};

// No client-side sorting needed - handled by server
const paginatedInstallations = computed(() => {
  return installationsStore.installations;
});



const totalPages = computed(() => {
  if (!installationsStore.pagination) return 1;
  return installationsStore.pagination.last_page || 1;
});

const paginationInfo = computed(() => {
  if (!installationsStore.pagination) return 'Showing 0 installations';
  
  const { from, to, total } = installationsStore.pagination;
  if (total === 0) return 'Showing 0 installations';
  
  return `Showing ${from} to ${to} of ${total} installations`;
});

const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
    fetchData();
  }
};

const visiblePages = computed(() => {
  const pages = [];
  const total = totalPages.value;
  const current = currentPage.value;
  
  if (total <= 7) {
    // Show all pages if total is 7 or less
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);
    
    if (current > 3) {
      pages.push('...');
    }
    
    // Show pages around current page
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    if (current < total - 2) {
      pages.push('...');
    }
    
    // Always show last page
    pages.push(total);
  }
  
  return pages;
});

const getStatusColor = (isActive: boolean) => {
  return isActive 
    ? 'bg-green-lighter text-green' 
    : 'bg-red-100 text-red-800';
};

const getStatusText = (isActive: boolean) => {
  return isActive ? 'Active' : 'Inactive';
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
        
        const expiryDate = startDate.add(trialDays, 'day').add(isAnnual ? 1 : 1, isAnnual ? 'year' : 'month');
        validity = expiryDate.format('MMM DD, YYYY');
      }

      return {
        name,
        status,
        validity,
        isDetailed: true
      };
    }
  } catch (e) {
    // Fallback
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
    <div>
      <h1 class="text-2xl font-bold text-dark">Installation List</h1>
    </div>

    <!-- Main Content Area with Sidebar -->
    <div class="flex flex-col lg:flex-row gap-5">
      <!-- Sidebar Filters -->
      <div class="w-full lg:w-64 flex-shrink-0 space-y-5">
        <!-- Advance Filter -->
        <div class="p-5 bg-white rounded-lg border border-gray-200">
          <div class="flex items-center justify-between pb-2 mb-4 border-b border-gray-200">
             <h3 class="text-lg font-semibold text-gray-900">Advance Filter</h3>
             <button @click="resetFilters" class="text-sm text-teal hover:text-teal-dark font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-90">Reset</button>
          </div>

          <!-- App Plan Filter -->
          <div class="mb-4">
            <h4 class="flex items-center gap-x-[10px] px-[10px] py-[5px] mb-1 text-dark font-medium rounded-lg bg-background">
               <i class="icon-list-regular"></i>
               Plans
            </h4>
            <div>
               <label v-for="plan in appPlanOptions" :key="plan.value" class="w-full py-[5px] px-[10px] flex text-mid text-b4 transition hover:text-teal cursor-pointer">
                 <input type="checkbox" :value="plan.value" v-model="selectedPlans" @change="fetchData" class="h-4 w-4 mr-2 mt-[2px]">
                 <span class="text-sm">{{ plan.label }}</span>
               </label>
            </div>
          </div>

          <!-- Shopify Plan Filter -->
          <div class="mb-4">
            <h4 class="flex items-center gap-x-[10px] px-[10px] py-[5px] mb-1 text-dark font-medium rounded-lg bg-background">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
               Shopify Plan
            </h4>
            <div>
               <label v-for="plan in shopifyPlanOptions" :key="plan.value" class="w-full py-[5px] px-[10px] flex text-mid text-b4 transition hover:text-teal cursor-pointer">
                 <input type="checkbox" :value="plan.value" v-model="selectedShopifyPlans" @change="fetchData" class="h-4 w-4 mr-2 mt-[3px]">
                 <span class="text-sm">{{ plan.label }}</span>
               </label>
            </div>
          </div>

           <!-- Status Filter -->
          <div class="mb-4">
            <h4 class="flex items-center gap-x-[10px] px-[10px] py-[5px] mb-1 text-dark font-medium rounded-lg bg-background">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
               Status
            </h4>
            <div>
               <label v-for="status in statusOptions" :key="String(status.value)" class="w-full py-[5px] px-[10px] flex items-center text-mid text-b4 transition hover:text-teal cursor-pointer">
                 <input type="checkbox" :value="status.value" v-model="selectedStatuses" @change="fetchData" class="h-4 w-4 mr-2 mt-[2px]">
                 <span class="text-sm">{{ status.label }}</span>
               </label>
            </div>
          </div>

           <!-- Install Count Filter -->
          <div>
            <h4 class="flex items-center gap-x-[10px] px-[10px] py-[5px] mb-[10px] text-dark font-medium rounded-lg bg-background">
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path></svg>
               Install Count
            </h4>
            <div class="flex items-center gap-2">
                <input 
                    type="number" 
                    name="install_count_min"
                    placeholder="Min" 
                    v-model.number="installCountMin" 
                    @change="fetchData"
                    class="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-teal focus:border-teal"
                >
                <span class="text-gray-400">-</span>
                 <input 
                    type="number" 
                    name="install_count_max"
                    placeholder="Max" 
                    v-model.number="installCountMax" 
                    @change="fetchData"
                    class="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-teal focus:border-teal"
                >
            </div>
          </div>

        </div>
      </div>

      <!-- Right Column: Existing Content -->
      <div class="flex-1 min-w-0 space-y-6">
        <div class="bg-white rounded-lg p-5 border border-gray-200">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <!-- Left side: Search -->
            <div class="flex items-center gap-2 min-w-[250px] max-w-md">
              <div class="relative flex-1">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  v-model="searchQuery"
                  type="text"
                  name="search"
                  placeholder="Search"
                  class="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-teal focus:border-teal sm:text-sm"
                  @keyup.enter="handleSearch"
                />
                <!-- Clear button (shows when there's text) -->
                <button
                  v-if="searchQuery"
                  @click="clearSearch"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer hover:text-gray-600"
                  title="Clear search"
                >
                  <svg class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
               <!-- Total Count -->
               <div class="text-sm font-medium text-gray-700 whitespace-nowrap">
                 Showing <span class="font-semibold text-teal">{{ totalInstallations.toLocaleString() }}</span> items
               </div>
            </div>

            <!-- Right side: Export Button -->
            <div class="flex items-center gap-2">
              <!-- Navigation Arrows -->
              <div class="flex items-center gap-1">
                <button
                  @click="setDateRange('previous')"
                  :disabled="!date || date.length === 0 || date[0] === null"
                  class="p-1 rounded-lg hover:bg-gray-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <!-- Date Range -->
                <div class="flex items-center gap-2">
                  <VueDatePicker
                      v-model="date"
                      multi-calendars
                      auto-apply
                      :range="true"
                      :time-config="{ enableTimePicker: false }"
                      :placeholder="dateRangePlaceholderText"
                      :preset-dates="presetDates"
                      @update:model-value="handleDateChange"
                  >
                    <template #arrow-left>
                        <i class="icon-chevron-left-regular"/>
                    </template>
                    <template #arrow-right>
                        <i class="icon-chevron-right-regular"/>
                    </template>
                    <template
                        v-if="date"
                        #preset-date-range-button="{ label, value, presetDate }"
                    >
                        <span
                            role="button"
                            :tabindex="0"
                            @click="presetDate(value)"
                            @keyup.enter.prevent="presetDate(value)"
                            @keyup.space.prevent="presetDate(value)"
                        >
                          {{ label }}
                        </span>
                    </template>
                  </VueDatePicker>
                </div>
                
                <button
                  @click="setDateRange('next')"
                  :disabled="!date || date.length === 0 || date[0] === null"
                  class="p-1 rounded-lg hover:bg-gray-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next date range"
                >
                  <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <button
                v-if="authStore.hasPermission('installations.export')"
                @click="handleExport"
                class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal cursor-pointer"
              >
                <svg class="-ml-1 mr-2 h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>



        <!-- Error State -->
        <div v-if="installationsStore.error" class="bg-red-50 p-4 rounded-lg">
          <p class="text-red-800">{{ installationsStore.error }}</p>
        </div>

        <!-- Installations Table -->
        <div v-else class="bg-white overflow-hidden rounded-lg border border-gray-200">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('app_name')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>App</span>
                      <SortIcon v-if="sortBy !== 'app_name'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('store_name')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Store</span>
                      <SortIcon v-if="sortBy !== 'store_name'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('email')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Email</span>
                      <SortIcon v-if="sortBy !== 'email'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('app_plan')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Plan</span>
                      <SortIcon v-if="sortBy !== 'app_plan'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('shopify_plan')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Shopify Plan</span>
                      <SortIcon v-if="sortBy !== 'shopify_plan'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('is_active')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Status</span>
                      <SortIcon v-if="sortBy !== 'is_active'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('install_count')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Installs</span>
                      <SortIcon v-if="sortBy !== 'install_count'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    class="px-6 py-3 text-left text-sm font-semibold text-gray-600 tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    @click="handleSort('created_at')"
                  >
                    <div class="flex items-center space-x-1">
                      <span>Created</span>
                      <SortIcon v-if="sortBy !== 'created_at'" size="sm" class="text-gray-400" />
                      <ChevronDown v-else :class="['text-teal transition-transform duration-200', sortOrder === 'asc' ? 'rotate-180' : '']" size="sm" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <template v-if="installationsStore.loading">
                  <tr v-for="i in 5" :key="i">
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="100px" height="16px" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="150px" height="16px" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="200px" height="16px" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="80px" height="24px" custom-class="rounded-full" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="100px" height="24px" custom-class="rounded-full" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="40px" height="16px" /></td>
                    <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="100px" height="16px" /></td>
                  </tr>
                </template>
                <tr v-else v-for="installation in paginatedInstallations" :key="installation.id" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">{{ installation.app?.app_name || 'N/A' }}</div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">
                      {{ installation.store_name }}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-500">
                      {{ installation.email }}
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <div v-if="getPlanDetails(installation.app_plan)" class="flex flex-col gap-1.5">
                      <span class="px-2 w-max inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-light text-blue">
                        {{ getPlanDetails(installation.app_plan)?.name }}
                      </span>
                      <template v-if="getPlanDetails(installation.app_plan)?.isDetailed">
                        <span 
                          :class="[
                            'px-2 w-max text-[10px] leading-5 font-semibold rounded-full capitalize',
                            getPlanDetails(installation.app_plan)?.status?.toLowerCase() === 'cancelled' 
                              ? 'bg-red-50 text-red-600' 
                              : 'bg-blue-light text-teal'
                          ]"
                        >
                          {{ getPlanDetails(installation.app_plan)?.status?.toLowerCase() }}
                        </span>
                        <span v-if="getPlanDetails(installation.app_plan)?.validity" class="px-2 w-max text-[10px] leading-5 font-semibold rounded-full bg-blue-light text-teal">
                          Valid until {{ getPlanDetails(installation.app_plan)?.validity }}
                        </span>
                      </template>
                    </div>
                    <span v-else class="text-sm text-gray-400 italic">No plan</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-violet-light text-violet-100">
                      {{ getShopifyPlan(installation.shopify_plan) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="['px-2 inline-flex text-xs leading-5 font-semibold rounded-full', getStatusColor(installation.is_active)]">
                      {{ getStatusText(installation.is_active) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ installation.install_count }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ new Date(installation.created_at).toLocaleDateString() }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Empty State -->
          <div v-if="paginatedInstallations.length === 0" class="text-center py-12">
            <p class="text-gray-500">No installations found</p>
          </div>

          <!-- Pagination -->
          <div v-if="paginatedInstallations.length > 0" class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div class="flex-1 flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <p class="text-sm text-gray-700">
                  {{ paginationInfo }}
                </p>
                <div class="flex items-center space-x-2">
                  <label for="perPage" class="text-sm text-gray-700">Per Page</label>
                  <select
                    id="perPage"
                    v-model.number="perPage"
                    class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-teal focus:border-teal"
                  >
                    <option :value="1">1</option>
                    <option :value="25">25</option>
                    <option :value="50">50</option>
                    <option :value="100">100</option>
                  </select>
                </div>
              </div>
              <div>
                <nav class="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                  <!-- Previous Button -->
                  <button
                    @click="goToPage(currentPage - 1)"
                    :disabled="currentPage === 1"
                    :class="[
                      'relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium',
                      currentPage === 1 
                        ? 'text-gray-300 cursor-not-allowed' 
                        : 'text-gray-500 hover:bg-gray-50 cursor-pointer'
                    ]"
                  >
                    <span class="sr-only">Previous</span>
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  </button>

                  <!-- Page Numbers -->
                  <template v-for="(page, index) in visiblePages" :key="index">
                    <button
                      v-if="page !== '...'"
                      @click="goToPage(page as number)"
                      :class="[
                        'relative inline-flex items-center px-4 py-2 border text-sm font-medium cursor-pointer',
                        page === currentPage
                          ? 'z-10 bg-teal border-teal text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      ]"
                    >
                      {{ page }}
                    </button>
                    <span
                      v-else
                      class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700"
                    >
                      ...
                    </span>
                  </template>

                  <!-- Next Button -->
                  <button
                    @click="goToPage(currentPage + 1)"
                    :disabled="currentPage === totalPages"
                    :class="[
                      'relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium',
                      currentPage === totalPages 
                        ? 'text-gray-300 cursor-not-allowed' 
                        : 'text-gray-500 hover:bg-gray-50 cursor-pointer'
                    ]"
                  >
                    <span class="sr-only">Next</span>
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>