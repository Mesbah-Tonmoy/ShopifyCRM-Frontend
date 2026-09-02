<script setup lang="ts">
import { computed } from 'vue';
import type { FeatureRequestStatus } from '@/services/featureRequestService';

export type BoardTone = 'info' | 'success' | 'caution' | 'critical';

const props = withDefaults(defineProps<{ tone?: BoardTone; title?: string }>(), {
  tone: 'info',
  title: undefined,
});

/**
 * Polaris gives each tone its own glyph rather than one generic alert mark: a
 * tick for success, a triangle for caution, a diamond for critical. Held as
 * path data so the markup stays one `<svg>`.
 */
const ICONS: Record<BoardTone, { d: string; evenodd?: boolean }[]> = {
  info: [
    { d: 'M10 14a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-.75.75Z' },
    { d: 'M9 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z' },
    { d: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-1.5 0a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z', evenodd: true },
  ],
  success: [
    { d: 'M15.78 5.97a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 1 1 1.06-1.06l2.72 2.72 5.97-5.97a.75.75 0 0 1 1.06 0Z', evenodd: true },
  ],
  caution: [
    { d: 'M10 6.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 1 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Z' },
    { d: 'M11 13.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z' },
    { d: 'M10 3.5c-1.045 0-1.784.702-2.152 1.447a449.26 449.26 0 0 1-2.005 3.847l-.028.052a403.426 403.426 0 0 0-2.008 3.856c-.372.752-.478 1.75.093 2.614.57.863 1.542 1.184 2.464 1.184h7.272c.922 0 1.895-.32 2.464-1.184.57-.864.465-1.862.093-2.614-.21-.424-1.113-2.147-2.004-3.847l-.032-.061a429.497 429.497 0 0 1-2.005-3.847c-.368-.745-1.107-1.447-2.152-1.447Zm-.808 2.112c.404-.816 1.212-.816 1.616 0 .202.409 1.112 2.145 2.022 3.88a418.904 418.904 0 0 1 2.018 3.875c.404.817 0 1.633-1.212 1.633h-7.272c-1.212 0-1.617-.816-1.212-1.633.202-.408 1.113-2.147 2.023-3.883a421.932 421.932 0 0 0 2.017-3.872Z', evenodd: true },
  ],
  critical: [
    { d: 'M10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Z' },
    { d: 'M11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z' },
    { d: 'M11.237 3.177a1.75 1.75 0 0 0-2.474 0l-5.586 5.585a1.75 1.75 0 0 0 0 2.475l5.586 5.586a1.75 1.75 0 0 0 2.474 0l5.586-5.586a1.75 1.75 0 0 0 0-2.475l-5.586-5.585Zm-1.414 1.06a.25.25 0 0 1 .354 0l5.586 5.586a.25.25 0 0 1 0 .354l-5.586 5.585a.25.25 0 0 1-.354 0l-5.586-5.585a.25.25 0 0 1 0-.354l5.586-5.586Z', evenodd: true },
  ],
};

const paths = computed(() => ICONS[props.tone]);
</script>

<script lang="ts">
/**
 * A status note carries the outcome, so it should not read as neutral
 * information when the answer was no.
 */
const STATUS_TONES: Partial<Record<FeatureRequestStatus, BoardTone>> = {
  completed: 'success',
  in_progress: 'caution',
  rejected: 'critical',
};

export const statusTone = (status: FeatureRequestStatus): BoardTone =>
  STATUS_TONES[status] ?? 'info';
</script>

<template>
  <div class="board-banner" :class="`board-banner--${tone}`">
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        v-for="(path, index) in paths"
        :key="index"
        :d="path.d"
        :fill-rule="path.evenodd ? 'evenodd' : undefined"
      />
    </svg>

    <div class="board-banner__content">
      <span v-if="title" class="board-banner__title">{{ title }}</span>
      <slot />
    </div>
  </div>
</template>
