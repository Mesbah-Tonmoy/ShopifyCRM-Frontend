<template>
  <StatusBadge :tone="tone" dot class="gap-1.5 px-2.5 whitespace-nowrap">
    {{ label }}
  </StatusBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import type { Tone } from '@/lib/tones';
import { FEATURE_REQUEST_STATUSES, type FeatureRequestStatus } from '@/services/featureRequestService';

const props = defineProps<{
  status: FeatureRequestStatus;
  label?: string;
}>();

/**
 * Single definition of how each status looks, so the kanban, the table and the
 * detail drawer can never drift apart.
 */
const STATUS_TONES: Record<FeatureRequestStatus, Tone> = {
  pending: 'neutral',
  approved: 'info',
  in_progress: 'warning',
  completed: 'success',
  rejected: 'danger',
};

const tone = computed(() => STATUS_TONES[props.status] ?? STATUS_TONES.pending);

const label = computed(
  () => props.label ?? FEATURE_REQUEST_STATUSES.find((s) => s.value === props.status)?.label ?? props.status
);
</script>
