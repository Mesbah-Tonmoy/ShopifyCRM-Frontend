<template>
  <div 
    :class="[
      'animate-pulse bg-gray-200 rounded-lg',
      widthClass,
      heightClass,
      customClass
    ]"
  ></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  width?: string;
  height?: string;
  customClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  width: '100%',
  height: '1rem'
});

const widthClass = computed(() => {
  if (props.width.includes('px') || props.width.includes('%') || props.width.includes('rem')) {
    return ''; // Handle via style if needed, but Tailwind classes are preferred
  }
  return props.width.startsWith('w-') ? props.width : `w-[${props.width}]`;
});

const heightClass = computed(() => {
  if (props.height.includes('px') || props.height.includes('%') || props.height.includes('rem')) {
    return '';
  }
  return props.height.startsWith('h-') ? props.height : `h-[${props.height}]`;
});
</script>

<style scoped>
/* If width/height are passed as raw values like '200px' */
div {
  width: v-bind('props.width');
  height: v-bind('props.height');
}
</style>
