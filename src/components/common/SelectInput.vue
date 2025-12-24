<template>
  <div class="flex items-center gap-2">
    <span v-if="label" class="text-sm font-medium text-gray-500 whitespace-nowrap">{{ label }}:</span>
    <select
      v-model="internalValue"
      class="block pl-3 pr-10 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal focus:border-teal rounded-lg transition-all bg-white"
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
  label?: string;
  placeholder?: string;
  selectClass?: string;
}

const props = defineProps<Props>();
const emit = defineEmits(['update:modelValue']);

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});
</script>
