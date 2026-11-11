<template>
  <Badge variant="secondary" :class="cn(toneBadgeClasses[tone], props.class)">
    <span v-if="dot" :class="cn('size-1.5 rounded-full', toneDotClasses[tone])" aria-hidden="true" />
    <slot />
  </Badge>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import { toneBadgeClasses, toneDotClasses, type Tone } from '@/lib/tones';
import { Badge } from '@/components/ui/badge';

/** A status pill: "Active", "Paused", "Failed"… Pick the tone by meaning, not by colour. */
const props = withDefaults(
  defineProps<{
    tone?: Tone;
    /** Leading coloured dot, for live states (sending, healthy, paused). */
    dot?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  {
    tone: 'neutral',
    dot: false,
  }
);
</script>
