<template>
  <div
    class="flex shrink-0 flex-col items-center justify-center rounded-sm border border-grey px-2 py-1.5 text-mid"
    :class="compact ? 'w-11' : 'w-14'"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round"
         :class="compact ? 'h-2.5 w-2.5' : 'h-3 w-3'">
      <path d="M5 14l7-7 7 7" />
    </svg>
    <span class="font-semibold tabular-nums leading-tight" :class="compact ? 'text-b6' : 'text-b3'">
      {{ count }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  count: number;
  compact?: boolean;
}>();
</script>
