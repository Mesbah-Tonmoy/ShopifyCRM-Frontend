<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { pricingPlanService, type PricingPlan } from '@/services/pricingPlanService';
import { useAuthStore } from '@/stores/auth';
import { useAppsStore } from '@/stores/apps';
import { Toast } from '@/utils/toast';
import { EditIcon, CloseIcon, LoadingIcon } from '@/components/icons';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';

const router = useRouter();
const authStore = useAuthStore();
const appsStore = useAppsStore();

const plans = ref<PricingPlan[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');
const selectedAppId = ref<number | null>(null);
const selectedStatus = ref<boolean | null>(null);

const showEditModal = ref(false);
const editingPlan = ref<PricingPlan | null>(null);
const saving = ref(false);
const syncing = ref(false);

onMounted(() => {
  fetchPlans();
  if (appsStore.apps.length === 0) {
    appsStore.fetchApps(1, 100);
  }
});

// Watch filter changes and refetch
watch([selectedAppId, selectedStatus], () => {
  fetchPlans();
});

const fetchPlans = async () => {
  try {
    loading.value = true;
    error.value = null;
    
    const filters: any = {
      per_page: 100 // Get more for client-side search to work better
    };
    if (selectedAppId.value !== null) filters.app_id = selectedAppId.value;
    if (selectedStatus.value !== null) filters.is_active = selectedStatus.value ? 1 : 0;
    
    const response = await pricingPlanService.getAll(filters);
    if (response.success) {
      plans.value = response.data.data;
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to load pricing plans';
    error.value = errorMessage;
    console.error('Error fetching plans:', err);
  } finally {
    loading.value = false;
  }
};

const filteredPlans = computed(() => {
  let filtered = plans.value;

  // Filter by app
  if (selectedAppId.value !== null) {
    filtered = filtered.filter(plan => plan.app_id === selectedAppId.value);
  }

  // Filter by status
  if (selectedStatus.value !== null) {
    filtered = filtered.filter(plan => plan.is_active === selectedStatus.value);
  }

  // Search query filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(plan => 
      plan.display_name.toLowerCase().includes(query) ||
      plan.name.toLowerCase().includes(query) ||
      plan.app?.app_name.toLowerCase().includes(query)
    );
  }
  
  return filtered;
});

const appsWithPlans = computed(() => {
  return appsStore.apps.filter(app => (app as any).pricing_plans_count > 0);
});

const openEditModal = (plan: PricingPlan) => {
  editingPlan.value = { ...plan };
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingPlan.value = null;
};

const savePlan = async () => {
  if (!editingPlan.value) return;

  try {
    saving.value = true;
    const response = await pricingPlanService.update(editingPlan.value.id, {
      display_name: editingPlan.value.display_name,
      amount: editingPlan.value.amount,
      is_active: editingPlan.value.is_active
    });

    if (response.success) {
      await fetchPlans();
      closeEditModal();
      Toast.fire({
        icon: 'success',
        title: 'Pricing plan updated successfully'
      });
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to update plan';
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: errorMessage
    });
  } finally {
    saving.value = false;
  }
};

const toggleActive = async (plan: PricingPlan) => {
  try {
    const response = await pricingPlanService.toggleActive(plan.id);
    if (response.success) {
      plan.is_active = !plan.is_active;
      
      Toast.fire({
        icon: 'success',
        title: 'Status Updated',
        text: `Plan is now ${plan.is_active ? 'active' : 'inactive'}`
      });
    }
  } catch (err: any) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err.message || 'Failed to toggle status'
    });
  }
};

const goToFeatures = (planId: number) => {
  router.push({ name: 'PricingPlanFeatures', params: { id: planId } });
};

const handleSyncPlans = async () => {
  if (!selectedAppId.value) {
    Swal.fire({
      icon: 'warning',
      title: 'No App Selected',
      text: 'Please select an app first to sync its pricing plans.'
    });
    return;
  }

  const app = appsStore.apps.find(a => a.id === selectedAppId.value);
  
  const result = await Swal.fire({
    title: 'Sync Pricing Plans?',
    text: `This will push the current pricing plans and features to ${app?.app_name}. Proceed?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#008080',
    cancelButtonColor: '#6B7280',
    confirmButtonText: 'Yes, sync them!'
  });

  if (result.isConfirmed) {
    try {
      syncing.value = true;
      const response = await pricingPlanService.syncPlans(selectedAppId.value);
      
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Synced!',
          text: 'Pricing plans have been pushed to the app successfully.',
          timer: 2000,
          showConfirmButton: false
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        text: err.response?.data?.message || err.message || 'Failed to sync plans'
      });
    } finally {
      syncing.value = false;
    }
  }
};
</script>

<template>
  <div>
    <PageHeader title="Pricing Plans" description="Manage your pricing plans and features">
      <template #actions>
        <button
          @click="handleSyncPlans"
          :disabled="syncing || !selectedAppId || !authStore.hasPermission('pricing_plans.edit')"
          class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all flex items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LoadingIcon v-if="syncing" size="xs" color-class="text-white" />
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ syncing ? 'Syncing...' : 'Sync Plans' }}
        </button>
      </template>
    </PageHeader>

    <!-- Filter/Search Bar -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div class="flex flex-wrap items-center gap-4">
        <!-- Search Field -->
        <SearchInput 
          v-model="searchQuery" 
          placeholder="Search plans..." 
          container-class="max-w-[300px] flex-1"
        />

        <!-- Dropdowns Container -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- App Filter -->
          <SelectInput
            v-model="selectedAppId"
            label="App"
            placeholder="Select App"
            select-class="w-48"
          >
            <option v-for="app in appsWithPlans" :key="app.id" :value="app.id">
              {{ app.app_name }}
            </option>
          </SelectInput>

          <!-- Status Filter -->
          <SelectInput
            v-model="selectedStatus"
            label="Status"
            placeholder="Select Status"
            select-class="w-48"
          >
            <option :value="true">Active</option>
            <option :value="false">Inactive</option>
          </SelectInput>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="bg-white rounded-lg border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">App Name</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Plan Name</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Amount</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Interval</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Status</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <template v-if="loading">
              <tr v-for="i in 5" :key="i">
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="120px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="100px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="80px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="80px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm"><SkeletonLoader width="24px" height="24px" /></td>
              </tr>
            </template>
            <tr v-else-if="filteredPlans.length === 0">
              <td colspan="6" class="py-20 text-center text-gray-400">
                <p class="text-sm italic">No pricing plans found</p>
              </td>
            </tr>
            <template v-else>
              <tr 
                v-for="plan in filteredPlans" 
                :key="plan.id" 
                class="hover:bg-gray-50/50 transition-colors cursor-pointer"
                @click="goToFeatures(plan.id)"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">{{ plan.app?.app_name }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900 font-medium">{{ plan.name || plan.display_name }}</div>
                  <div v-if="plan.name && plan.name !== plan.display_name" class="text-xs text-gray-500 font-mono">{{ plan.display_name }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ plan.amount }} {{ plan.currency_code }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900 capitalize">{{ plan.interval }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap" @click.stop>
                   <button
                    @click="toggleActive(plan)"
                    :disabled="!authStore.hasPermission('pricing_plans.edit')"
                    :class="[
                      'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                      plan.is_active ? 'bg-teal' : 'bg-gray-200'
                    ]"
                  >
                    <span :class="[
                      'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out',
                      plan.is_active ? 'translate-x-4' : 'translate-x-0'
                    ]" />
                  </button>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" @click.stop>
                  <div class="flex items-center gap-3">
                    <button
                      v-if="authStore.hasPermission('pricing_plans.edit')"
                      @click="openEditModal(plan)"
                      class="text-teal hover:text-teal-dark transition-colors"
                      title="Edit"
                    >
                      <EditIcon class="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="showEditModal && editingPlan" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-dark/20 backdrop-blur-sm transition-opacity" @click="closeEditModal"></div>

        <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-lg w-full overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Edit Pricing Plan</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ editingPlan.app?.app_name }} • {{ editingPlan.name }}</p>
            </div>
            <button @click="closeEditModal" class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1">
              <CloseIcon class="w-6 h-6" />
            </button>
          </div>

          <div class="p-6 space-y-5">
            <!-- Active Toggle -->
            <div class="flex items-center justify-between p-4 bg-teal/5 rounded-xl border border-teal/10">
              <div>
                <label class="text-sm font-bold text-gray-900">Plan Status</label>
                <p class="text-xs text-gray-500">Enable or disable this pricing plan</p>
              </div>
              <button
                @click="editingPlan.is_active = !editingPlan.is_active"
                :class="[
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  editingPlan.is_active ? 'bg-teal' : 'bg-gray-200'
                ]"
              >
                <span :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out',
                  editingPlan.is_active ? 'translate-x-5' : 'translate-x-0'
                ]" />
              </button>
            </div>

            <!-- Name Field -->
            <div class="space-y-1.5">
              <label for="display_name" class="block text-sm font-bold text-gray-700">Display Name</label>
              <input
                id="display_name"
                v-model="editingPlan.display_name"
                type="text"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all"
                placeholder="Enter plan name"
              />
            </div>

            <!-- Amount Field -->
            <div class="space-y-1.5">
              <label for="amount" class="block text-sm font-bold text-gray-700">Amount ({{ editingPlan.currency_code }})</label>
              <input
                id="amount"
                v-model.number="editingPlan.amount"
                type="number"
                step="0.01"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <button @click="closeEditModal" class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-all">
              Cancel
            </button>
            <button
              @click="savePlan"
              :disabled="saving"
              class="px-6 py-2 bg-teal text-white rounded-lg font-medium hover:shadow-lg hover:shadow-teal/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <LoadingIcon v-if="saving" size="sm" color-class="text-white" />
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
