<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { pricingPlanService, type PricingPlan, type PlanFeature } from '@/services/pricingPlanService';
import { useAuthStore } from '@/stores/auth';
import { Toast } from '@/utils/toast';
import { LoadingIcon, CloseIcon } from '@/components/icons';
import PageHeader from '@/components/common/PageHeader.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const planId = parseInt(route.params.id as string);

const plan = ref<PricingPlan | null>(null);
const features = ref<PlanFeature[]>([]);
const originalFeatures = ref<string>('');
const loading = ref(true);
const saving = ref(false);

const isDirty = computed(() => {
  return JSON.stringify(features.value.map(f => ({ id: f.id, value: f.value }))) !== originalFeatures.value;
});

onMounted(() => {
  fetchFeatures();
});

const fetchFeatures = async () => {
  try {
    loading.value = true;
    const response = await pricingPlanService.getFeatures(planId);
    if (response.success) {
      plan.value = response.data.plan;
      // Initialize features with their current values
      features.value = response.data.features.map((pf: any) => ({
        ...pf,
      }));
      // Keep track of original values for dirty checking
      originalFeatures.value = JSON.stringify(features.value.map(f => ({ id: f.id, value: f.value })));
    }
  } catch (err: any) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err.message || 'Failed to load plan features'
    });
    router.push({ name: 'pricing-plan' });
  } finally {
    loading.value = false;
  }
};

const saveFeatures = async () => {
  try {
    saving.value = true;
    const featuresToUpdate = features.value.map(f => ({
      id: f.id,
      value: f.value
    }));

    const response = await pricingPlanService.updateFeatures(planId, featuresToUpdate);
    if (response.success) {
      // Update original values after successful save
      originalFeatures.value = JSON.stringify(features.value.map(f => ({ id: f.id, value: f.value })));
      Toast.fire({
        icon: 'success',
        title: 'Plan features updated successfully'
      });
    }
  } catch (err: any) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err.message || 'Failed to update features'
    });
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  router.push({ name: 'pricing-plan' });
};
</script>

<template>
  <div>
    <!-- <PageHeader 
      :title="plan ? `Edit Features - ${plan.display_name || plan.name}` : 'Edit Plan Features'" 
      :description="plan ? `Manage features for ${plan.app?.app_name} - ${plan.display_name || plan.name}` : ''"
    >
      <template #actions>
        <button 
          @click="goBack"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-all flex items-center gap-2"
        >
          <CloseIcon class="w-4 h-4" />
          Cancel
        </button>
        <button 
          v-if="authStore.hasPermission('pricing_plans.edit')"
          @click="saveFeatures"
          :disabled="saving || loading"
          class="px-4 py-2 bg-teal text-white rounded-lg font-medium hover:shadow-lg hover:shadow-teal/20 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <LoadingIcon v-if="saving" size="sm" color-class="text-white" />
          {{ saving ? 'Saving...' : 'Save Features' }}
        </button>
      </template>
    </PageHeader> -->

    <div v-if="loading" class="flex justify-center py-20">
      <LoadingIcon size="lg" color-class="text-teal" />
    </div>

    <div v-else class="bg-white max-w-[650px] rounded-lg border border-gray-200 overflow-hidden">
      <div class="p-6 border-b border-gray-100 bg-gray-50/50">
        <h3 class="text-lg font-bold text-gray-900">Plan Features - {{ plan?.name }}</h3>
        <p class="text-sm text-gray-500">Manage features for {{ plan?.app?.app_name }} - {{ plan?.display_name || plan?.name }}</p>
      </div>

      <div class="divide-y divide-gray-100">
        <div v-for="pf in features" :key="pf.id" class="p-6 hover:bg-gray-50/30 transition-colors">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex-1">
              <h4 class="text-sm font-bold text-gray-900">{{ pf.feature?.name }}</h4>
              <p class="text-xs text-gray-500 mt-1">{{ pf.feature?.description }}</p>
              <div class="mt-1">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  Key: {{ pf.feature?.key }}
                </span>
              </div>
            </div>

            <div class="w-full md:w-64">
              <!-- BOOLEAN Type -->
              <div v-if="pf.feature?.value_type === 'BOOLEAN'" class="flex justify-end">
                <button
                  @click="pf.value = pf.value === '1' || pf.value === 'true' ? 'false' : 'true'"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  :class="[
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                    (pf.value === '1' || pf.value === 'true') ? 'bg-teal' : 'bg-gray-200'
                  ]"
                >
                  <span :class="[
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out',
                    (pf.value === '1' || pf.value === 'true') ? 'translate-x-5' : 'translate-x-0'
                  ]" />
                </button>
              </div>

              <!-- NUMBER Type -->
              <div v-else-if="pf.feature?.value_type === 'NUMBER' || pf.feature?.value_type === 'INTEGER'">
                <input
                  v-model="pf.value"
                  type="number"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all text-sm"
                  placeholder="Enter number"
                />
              </div>

              <!-- STRING/DEFAULT Type -->
              <div v-else>
                <input
                  v-model="pf.value"
                  type="text"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all text-sm"
                  placeholder="Enter value"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-if="features.length === 0" class="p-20 text-center text-gray-400">
          <p class="text-sm italic">No features defined for this plan.</p>
        </div>
      </div>

      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
        <button 
          @click="goBack"
          class="px-8 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-all flex items-center gap-2"
        >
          Cancel
        </button>
        <button 
          v-if="authStore.hasPermission('pricing_plans.edit')"
          @click="saveFeatures"
          :disabled="saving || loading || !isDirty"
          class="px-8 py-2.5 bg-teal text-white rounded-lg font-bold hover:shadow-lg hover:shadow-teal/20 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <LoadingIcon v-if="saving" size="sm" color-class="text-white" />
          {{ saving ? 'Saving Changes...' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>
</template>
