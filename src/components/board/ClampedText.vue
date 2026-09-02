<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    text: string;
    lines?: number;
  }>(),
  { lines: 2 }
);

const el = ref<HTMLElement | null>(null);
const expanded = ref(false);
const truncated = ref(false);

/**
 * Whether the text is actually clipped at this width.
 *
 * Measured rather than guessed from character count: a 200-character line can
 * fit in two lines on a wide card, and offering "See more" when there is
 * nothing more to show reads as a broken control.
 */
const measure = async () => {
  if (expanded.value) return;

  await nextTick();

  if (!el.value) return;

  truncated.value = el.value.scrollHeight > el.value.clientHeight + 1;
};

let observer: ResizeObserver | null = null;

onMounted(() => {
  measure();

  if (typeof ResizeObserver !== 'undefined' && el.value) {
    observer = new ResizeObserver(() => measure());
    observer.observe(el.value);
  }
});

onBeforeUnmount(() => observer?.disconnect());

watch(() => props.text, () => {
  expanded.value = false;
  measure();
});

const toggle = () => {
  expanded.value = !expanded.value;

  if (!expanded.value) measure();
};
</script>

<template>
  <div>
    <p
      ref="el"
      class="overflow-hidden"
      :style="expanded ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: String(lines) }"
    >
      {{ text }}
    </p>
    <button
      v-if="truncated"
      type="button"
      class="mt-0.5 text-[13px] font-semibold hover:underline"
      style="color: var(--bd-link)"
      @click.stop="toggle"
    >
      {{ expanded ? 'See less' : 'See more' }}
    </button>
  </div>
</template>
