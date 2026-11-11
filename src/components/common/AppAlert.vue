<template>
  <Alert :class="cn(toneAlertClasses[tone], props.class)">
    <component :is="icon" />
    <AlertTitle v-if="title">{{ title }}</AlertTitle>
    <AlertDescription v-if="$slots.default" class="text-current/80">
      <slot />
    </AlertDescription>
    <AlertAction v-if="$slots.action">
      <slot name="action" />
    </AlertAction>
  </Alert>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from '@lucide/vue';
import { cn } from '@/lib/utils';
import { toneAlertClasses, type Tone } from '@/lib/tones';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Inline notice: errors, warnings, "how this works" info boxes. The default
 * slot is the body; the `action` slot puts a button at the top right.
 */
const props = withDefaults(
  defineProps<{
    tone?: Tone;
    title?: string;
    class?: HTMLAttributes['class'];
  }>(),
  {
    tone: 'info',
  }
);

const icon = computed(
  () =>
    ({
      neutral: Info,
      info: Info,
      success: CircleCheck,
      warning: TriangleAlert,
      danger: OctagonAlert,
    })[props.tone]
);
</script>
