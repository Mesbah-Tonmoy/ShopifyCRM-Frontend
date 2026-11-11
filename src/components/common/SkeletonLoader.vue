<template>
  <Skeleton :class="customClass" :style="{ width, height }" />
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  width?: string;
  height?: string;
  customClass?: string;
}

withDefaults(defineProps<Props>(), {
  width: '100%',
  height: '1rem'
});
</script>
