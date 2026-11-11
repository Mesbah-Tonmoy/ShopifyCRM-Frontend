<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { pricingPlanService, type PricingPlan, type PlanFeature } from '@/services/pricingPlanService';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/utils/errors';

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
      features.value = response.data.features.map((pf: PlanFeature) => ({
        ...pf,
      }));
      // Keep track of original values for dirty checking
      originalFeatures.value = JSON.stringify(features.value.map(f => ({ id: f.id, value: f.value })));
    }
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to load plan features') });
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
      toast.success('Plan features updated successfully');
    }
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to update features') });
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

    <div v-if="loading" class="flex justify-center py-20">
      <LoadingIcon size="lg" color-class="text-muted-foreground" />
    </div>

    <Card v-else class="max-w-[650px] gap-0 py-0">
      <CardHeader class="border-b bg-muted/50 py-6">
        <CardTitle>Plan Features - {{ plan?.name }}</CardTitle>
        <CardDescription>Manage features for {{ plan?.app?.app_name }} - {{ plan?.display_name || plan?.name }}</CardDescription>
      </CardHeader>

      <div class="divide-y">
        <div v-for="pf in features" :key="pf.id" class="p-6 hover:bg-muted/30 transition-colors">
          <Field orientation="horizontal" class="flex-col items-stretch justify-between gap-4 md:flex-row md:items-center">
            <div class="flex-1">
              <FieldLabel :for="`feature-${pf.id}`" class="font-semibold">{{ pf.feature?.name }}</FieldLabel>
              <FieldDescription class="text-xs mt-1 nth-last-2:mt-1">{{ pf.feature?.description }}</FieldDescription>
              <div class="mt-1">
                <Badge variant="outline" class="text-[10px]">
                  Key: {{ pf.feature?.key }}
                </Badge>
              </div>
            </div>

            <div class="w-full md:w-64">
              <!-- BOOLEAN Type -->
              <div v-if="pf.feature?.value_type === 'BOOLEAN'" class="flex justify-end">
                <Switch
                  :id="`feature-${pf.id}`"
                  :model-value="pf.value === '1' || pf.value === 'true'"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  @update:model-value="(checked) => (pf.value = checked ? 'true' : 'false')"
                />
              </div>

              <!-- NUMBER Type -->
              <div v-else-if="pf.feature?.value_type === 'NUMBER' || pf.feature?.value_type === 'INTEGER'">
                <Input
                  :id="`feature-${pf.id}`"
                  v-model="pf.value"
                  type="number"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  placeholder="Enter number"
                />
              </div>

              <!-- STRING/DEFAULT Type -->
              <div v-else>
                <Input
                  :id="`feature-${pf.id}`"
                  v-model="pf.value"
                  type="text"
                  :disabled="!authStore.hasPermission('pricing_plans.edit')"
                  placeholder="Enter value"
                />
              </div>
            </div>
          </Field>
        </div>

        <div v-if="features.length === 0" class="p-20 text-center text-muted-foreground">
          <p class="text-sm italic">No features defined for this plan.</p>
        </div>
      </div>

      <CardFooter class="border-t bg-muted/50 py-4 [.border-t]:pt-4 justify-end gap-2">
        <Button
          variant="outline"
          size="lg"
          @click="goBack"
        >
          Cancel
        </Button>
        <Button
          v-if="authStore.hasPermission('pricing_plans.edit')"
          size="lg"
          @click="saveFeatures"
          :disabled="saving || loading || !isDirty"
        >
          <Spinner v-if="saving" />
          {{ saving ? 'Saving Changes...' : 'Save Changes' }}
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
