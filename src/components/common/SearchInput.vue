<template>
  <div class="relative" :class="containerClass">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    <input
      :id="inputId"
      :name="inputId"
      v-model="internalValue"
      type="text"
      :placeholder="placeholder"
      :aria-label="placeholder || 'Search'"
      class="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-teal focus:border-teal transition-all"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  modelValue: string;
  id?: string;
  placeholder?: string;
  containerClass?: string;
}

const props = defineProps<Props>();
const emit = defineEmits(['update:modelValue']);

// Generate a unique fallback ID if none provided
const inputId = props.id || `search-${Math.random().toString(36).substr(2, 9)}`;

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});
</script>
