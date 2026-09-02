<template>
  <span
    :data-status="status"
    class="inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[12px] font-semibold whitespace-nowrap"
    style="color: var(--bd-status); background: var(--bd-status-wash)"
  >
    <span class="h-[5px] w-[5px] rounded-full bg-current"></span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import type { FeatureRequestStatus } from '@/services/featureRequestService';

defineProps<{
  status: FeatureRequestStatus;
  label: string;
}>();
</script>
