<template>
  <button
    type="button"
    class="board-vote"
    :class="[compact ? 'board-vote--compact' : 'board-vote--regular', { 'is-voted': hasVoted }]"
    :aria-pressed="hasVoted"
    :aria-label="hasVoted ? 'Remove your vote' : 'Vote for this request'"
    :disabled="disabled"
    @click.stop="$emit('toggle')"
  >
    <!-- Polaris' ChevronUpIcon: a filled glyph rather than a stroked caret, so
         it holds its weight at 16px next to 650 type. -->
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10.53 6.22a.75.75 0 0 0-1.06 0l-4.25 4.25a.75.75 0 1 0 1.06 1.06L10 7.81l3.72 3.72a.75.75 0 1 0 1.06-1.06l-4.25-4.25Z" />
    </svg>
    <span v-if="count !== null" class="board-vote__count">{{ count }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  count: number | null;
  hasVoted: boolean;
  compact?: boolean;
  disabled?: boolean;
}>();

defineEmits<{ (e: 'toggle'): void }>();
</script>

