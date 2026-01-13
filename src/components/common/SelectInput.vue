<template>
  <div class="flex items-center gap-2">
    <label 
      v-if="label" 
      :for="inputId" 
      class="text-sm font-medium text-gray-500 whitespace-nowrap cursor-pointer"
    >
      {{ label }}:
    </label>
    <select
      :id="inputId"
      :name="inputId"
      v-model="internalValue"
      class="appearance-none block pl-3 pr-9 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal focus:border-teal rounded-lg transition-all bg-white cursor-pointer"
      style="background-image: url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236B7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E'); background-position: right 0.5rem center; background-repeat: no-repeat; background-size: 1.5em 1.5em;"
      :class="selectClass"
    >
      <option v-if="placeholder" :value="null">{{ placeholder }}</option>
      <slot></slot>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  modelValue: any;
  id?: string;
  label?: string;
  placeholder?: string;
  selectClass?: string;
}

const props = defineProps<Props>();
const emit = defineEmits(['update:modelValue']);

// Generate a unique fallback ID if none provided
const inputId = props.id || (props.label ? props.label.toLowerCase().replace(/\s+/g, '-') : `select-${Math.random().toString(36).substr(2, 9)}`);

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});
</script>
