<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-b6 font-semibold whitespace-nowrap"
    :class="styles.chip"
  >
    <span class="h-1.5 w-1.5 rounded-full" :class="styles.dot"></span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FEATURE_REQUEST_STATUSES, type FeatureRequestStatus } from '@/services/featureRequestService';

const props = defineProps<{
  status: FeatureRequestStatus;
  label?: string;
}>();

/**
 * Single definition of how each status looks, so the kanban, the table and the
 * detail drawer can never drift apart.
 */
const STATUS_STYLES: Record<FeatureRequestStatus, { chip: string; dot: string }> = {
  pending: { chip: 'bg-lighter text-mid', dot: 'bg-light' },
  approved: { chip: 'bg-green-light text-green', dot: 'bg-green' },
  in_progress: { chip: 'bg-blue-light text-blue', dot: 'bg-blue' },
  completed: { chip: 'bg-teal-light text-teal', dot: 'bg-teal' },
  rejected: { chip: 'bg-danger-lighter text-error', dot: 'bg-error' },
};

const styles = computed(() => STATUS_STYLES[props.status] ?? STATUS_STYLES.pending);

const label = computed(
  () => props.label ?? FEATURE_REQUEST_STATUSES.find((s) => s.value === props.status)?.label ?? props.status
);
</script>
