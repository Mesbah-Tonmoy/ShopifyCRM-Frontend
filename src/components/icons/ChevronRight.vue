<template>
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    stroke-width="1.5" 
    stroke="currentColor" 
    :class="classNames"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  class?: string | string[] | Record<string, boolean>;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  class: ''
});

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

const classNames = computed(() => {
  const classes: (string | Record<string, boolean>)[] = [sizeClass.value];
  
  if (Array.isArray(props.class)) {
    classes.push(...props.class);
  } else if (props.class) {
    classes.push(props.class);
  }
  
  return classes;
});
</script>
