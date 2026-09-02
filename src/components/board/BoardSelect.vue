<script setup lang="ts" generic="T extends string">
/**
 * A select matched to Polaris' own component: the native control is stripped
 * and restyled rather than replaced, so keyboard behaviour and the platform
 * dropdown stay intact, while the box, type and icon come from Polaris.
 */
defineProps<{
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="board-select">
    <select v-model="model" :aria-label="ariaLabel" class="board-input">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>

    <!-- Polaris' SelectIcon: stacked chevrons, not a single caret. -->
    <svg class="board-select__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10.884 4.323a1.25 1.25 0 0 0-1.768 0l-2.646 2.647a.75.75 0 0 0 1.06 1.06l2.47-2.47 2.47 2.47a.75.75 0 1 0 1.06-1.06l-2.646-2.647Z" />
      <path d="m13.53 13.03-2.646 2.647a1.25 1.25 0 0 1-1.768 0l-2.646-2.647a.75.75 0 0 1 1.06-1.06l2.47 2.47 2.47-2.47a.75.75 0 0 1 1.06 1.06Z" />
    </svg>
  </div>
</template>

<style scoped>
.board-select {
  position: relative;
  display: inline-flex;
  flex: none;
}

/* Room for the icon: 8px of padding plus the 20px glyph. */
.board-select select {
  width: 100%;
  padding-right: 28px;
  font-weight: 500; /* --p-font-weight-medium */
  appearance: none;
  cursor: pointer;
}

.board-select__icon {
  position: absolute;
  top: 50%;
  right: 8px; /* --p-space-200 */
  width: 20px;
  height: 20px;
  transform: translateY(-50%);
  color: var(--bd-ink-soft); /* --p-color-icon-secondary */
  pointer-events: none;
}
</style>
