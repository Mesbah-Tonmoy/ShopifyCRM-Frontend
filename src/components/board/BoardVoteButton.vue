<template>
  <button
    type="button"
    class="group flex shrink-0 flex-col items-center justify-center gap-px rounded-sm border border-[var(--bd-border-strong)] text-[var(--bd-ink-mid)] transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[var(--bd-raised)]"
    :class="compact ? 'w-11 px-1 py-1' : 'w-[54px] px-1 py-1.5'"
    :style="buttonStyle"
    :aria-pressed="hasVoted"
    :aria-label="hasVoted ? 'Remove your vote' : 'Vote for this request'"
    :disabled="disabled"
    @click.stop="$emit('toggle')"
  >
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"
      class="transition duration-100 ease-in-out group-hover:-translate-y-[2px]"
      :class="compact ? 'h-2.5 w-2.5' : 'h-3 w-3'"
    >
      <path d="M5 14l7-7 7 7" />
    </svg>
    <span v-if="count !== null" class="font-semibold tabular-nums leading-tight" :class="compact ? 'text-[13px]' : 'text-[15px]'">
      {{ count }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  count: number | null;
  hasVoted: boolean;
  compact?: boolean;
  disabled?: boolean;
}>();

defineEmits<{ (e: 'toggle'): void }>();

const buttonStyle = computed(() =>
  props.hasVoted
    ? {
        background: 'var(--bd-border)',
      }
    : {
        // background: 'transparent',
      }
);
</script>
