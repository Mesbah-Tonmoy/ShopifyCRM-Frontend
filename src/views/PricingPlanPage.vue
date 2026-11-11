<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { pricingPlanService, type PricingPlan, type PricingPlanFilters } from '@/services/pricingPlanService';
import { useAuthStore } from '@/stores/auth';
import { useAppsStore } from '@/stores/apps';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { Pencil, RefreshCw } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import { errorMessage } from '@/utils/errors';

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
    
    const filters: PricingPlanFilters = {
      per_page: 100 // Get more for client-side search to work better
    };
    if (selectedAppId.value !== null) filters.app_id = selectedAppId.value;
    if (selectedStatus.value !== null) filters.is_active = selectedStatus.value ? 1 : 0;
    
    const response = await pricingPlanService.getAll(filters);
    if (response.success) {
      plans.value = response.data.data;
    }
  } catch (err) {
    const message = errorMessage(err, 'Failed to load pricing plans');
    error.value = message;
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
  return appsStore.apps.filter(app => (app.pricing_plans_count ?? 0) > 0);
});

const appOptions = computed(() => appsWithPlans.value.map((app) => ({ value: app.id, label: app.app_name })));

const statusOptions = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
];

const openEditModal = (plan: PricingPlan) => {
  editingPlan.value = { ...plan };
  showEditModal.value = true;
};

const closeEditModal = () => {
  // editingPlan is left in place so the dialog keeps its content while it animates out;
  // opening always loads a fresh copy.
  showEditModal.value = false;
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
      toast.success('Pricing plan updated successfully');
    }
  } catch (err) {
    const message = errorMessage(err, 'Failed to update plan');
    toast.error('Error', { description: message });
  } finally {
    saving.value = false;
  }
};

const toggleActive = async (plan: PricingPlan) => {
  try {
    const response = await pricingPlanService.toggleActive(plan.id);
    if (response.success) {
      plan.is_active = !plan.is_active;
      
      toast.success('Status Updated', { description: `Plan is now ${plan.is_active ? 'active' : 'inactive'}` });
    }
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to toggle status') });
  }
};

const goToFeatures = (planId: number) => {
  router.push({ name: 'PricingPlanFeatures', params: { id: planId } });
};

const handleSyncPlans = async () => {
  if (!selectedAppId.value) {
    toast.warning('No App Selected', { description: 'Please select an app first to sync its pricing plans.' });
    return;
  }

  const app = appsStore.apps.find(a => a.id === selectedAppId.value);
  
  const { confirmed } = await confirmDialog({
    title: 'Sync Pricing Plans?',
    description: `This will push the current pricing plans and features to ${app?.app_name}. Proceed?`,
    confirmText: 'Yes, sync them!'
  });

  if (confirmed) {
    try {
      syncing.value = true;
      const response = await pricingPlanService.syncPlans(selectedAppId.value);
      
      if (response.success) {
        toast.success('Synced!', { description: 'Pricing plans have been pushed to the app successfully.' });
      }
    } catch (err) {
      toast.error('Sync Failed', { description: errorMessage(err, 'Failed to sync plans') });
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
        <Button
          @click="handleSyncPlans"
          :disabled="syncing || !selectedAppId || !authStore.hasPermission('pricing_plans.edit')"
        >
          <Spinner v-if="syncing" />
          <RefreshCw v-else />
          {{ syncing ? 'Syncing...' : 'Sync Plans' }}
        </Button>
      </template>
    </PageHeader>

    <!-- Filter/Search Bar -->
    <Card class="mb-6 py-4">
      <CardContent class="flex flex-wrap items-center gap-4 px-4">
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
            :options="appOptions"
            label="App"
            placeholder="Select App"
            select-class="w-48"
          />

          <!-- Status Filter -->
          <SelectInput
            v-model="selectedStatus"
            :options="statusOptions"
            label="Status"
            placeholder="Select Status"
            select-class="w-48"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Content Area -->
    <Card class="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="px-6">App Name</TableHead>
            <TableHead class="px-6">Plan Name</TableHead>
            <TableHead class="px-6">Amount</TableHead>
            <TableHead class="px-6">Interval</TableHead>
            <TableHead class="px-6">Status</TableHead>
            <TableHead class="px-6">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell class="px-6 py-4"><SkeletonLoader width="120px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="100px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="80px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="80px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="24px" height="24px" /></TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else-if="filteredPlans.length === 0" :colspan="6" class="py-10 text-muted-foreground">
            <p class="text-sm italic">No pricing plans found</p>
          </TableEmpty>
          <template v-else>
            <TableRow 
              v-for="plan in filteredPlans" 
              :key="plan.id" 
              class="cursor-pointer"
              @click="goToFeatures(plan.id)"
            >
              <TableCell class="px-6 py-4">
                <div class="text-sm font-medium text-foreground">{{ plan.app?.app_name }}</div>
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="text-sm text-foreground font-medium">{{ plan.name || plan.display_name }}</div>
                <div v-if="plan.name && plan.name !== plan.display_name" class="text-xs text-muted-foreground font-mono">{{ plan.display_name }}</div>
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="text-sm text-foreground">{{ plan.amount }} {{ plan.currency_code }}</div>
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="text-sm text-foreground capitalize">{{ plan.interval }}</div>
              </TableCell>
              <TableCell class="px-6 py-4" @click.stop>
                <Switch
                  :model-value="plan.is_active"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  :aria-label="`${plan.is_active ? 'Deactivate' : 'Activate'} ${plan.name || plan.display_name}`"
                  @update:model-value="toggleActive(plan)"
                />
              </TableCell>
              <TableCell class="px-6 py-4" @click.stop>
                <div class="flex items-center gap-3">
                  <Button
                    v-if="authStore.hasPermission('pricing_plans.edit')"
                    variant="ghost"
                    size="icon-sm"
                    @click="openEditModal(plan)"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <Pencil />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </Card>

    <!-- Edit Modal -->
    <Dialog :open="showEditModal && !!editingPlan" @update:open="(open) => { if (!open) closeEditModal(); }">
      <DialogContent class="sm:max-w-lg">
        <template v-if="editingPlan">
          <DialogHeader>
            <DialogTitle>Edit Pricing Plan</DialogTitle>
            <DialogDescription>{{ editingPlan.app?.app_name }} • {{ editingPlan.name }}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <!-- Active Toggle -->
            <Field orientation="horizontal" class="rounded-xl border bg-muted/50 p-4">
              <FieldContent>
                <FieldLabel for="plan-status">Plan Status</FieldLabel>
                <FieldDescription>Enable or disable this pricing plan</FieldDescription>
              </FieldContent>
              <Switch id="plan-status" v-model="editingPlan.is_active" />
            </Field>

            <!-- Name Field -->
            <Field>
              <FieldLabel for="display_name">Display Name</FieldLabel>
              <Input
                id="display_name"
                v-model="editingPlan.display_name"
                type="text"
                placeholder="Enter plan name"
              />
            </Field>

            <!-- Amount Field -->
            <Field>
              <FieldLabel for="amount">Amount ({{ editingPlan.currency_code }})</FieldLabel>
              <Input
                id="amount"
                v-model.number="editingPlan.amount"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </Field>
          </FieldGroup>

          <DialogFooter class="gap-3">
            <Button variant="outline" @click="closeEditModal">
              Cancel
            </Button>
            <Button
              @click="savePlan"
              :disabled="saving"
            >
              <Spinner v-if="saving" />
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>
  </div>
</template>
