<template>
  <div
    class="flex shrink-0 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-foreground"
    :class="compact ? 'w-11' : 'w-14'"
  >
    <ChevronUp :class="compact ? 'size-3' : 'size-4'" :stroke-width="2.5" />
    <span class="font-semibold tabular-nums leading-tight" :class="compact ? 'text-xs' : 'text-sm'">
      {{ count }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ChevronUp } from '@lucide/vue';

defineProps<{
  count: number;
  compact?: boolean;
}>();
</script>
