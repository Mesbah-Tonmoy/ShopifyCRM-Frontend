<template>
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    stroke-width="1.5" 
    stroke="currentColor" 
    :class="[sizeClass, customClass]"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
  </svg>
</template>
<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  class: ''
});

const customClass = props.class;

const sizeClass = computed(() => {
  const sizes = {
    'xs': 'w-3 h-3',
    'sm': 'w-4 h-4',
    'md': 'w-5 h-5',
    'lg': 'w-6 h-6',
    'xl': 'w-8 h-8'
  };
  return sizes[props.size];
});
</script>
