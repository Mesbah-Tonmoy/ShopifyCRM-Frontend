<template>
  <Spinner :class="[sizeClasses[size], colorClass]" />
</template>

<script setup lang="ts">
import { Spinner } from '@/components/ui/spinner';

/**
 * Preset sizes for standalone loaders (page and section loading states).
 * Inside a Button use `<Spinner />` directly; the button sizes it.
 */
interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  colorClass?: string;
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  colorClass: 'text-current'
});

const sizeClasses = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
  xl: 'size-12'
};
</script>
