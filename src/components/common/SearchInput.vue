<template>
  <InputGroup :class="containerClass">
    <InputGroupAddon>
      <SearchIcon />
    </InputGroupAddon>
    <InputGroupInput
      :id="inputId"
      :name="name || inputId"
      v-model="internalValue"
      type="text"
      :placeholder="placeholder"
      :aria-label="placeholder || 'Search'"
      @keyup.enter="emit('search')"
    />
    <InputGroupAddon v-if="clearable && internalValue" align="inline-end">
      <InputGroupButton size="icon-xs" title="Clear search" aria-label="Clear search" @click="clear">
        <X />
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SearchIcon, X } from '@lucide/vue';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

interface Props {
  modelValue: string;
  id?: string;
  name?: string;
  placeholder?: string;
  containerClass?: string;
  /** Show an × that empties the field and emits `clear`. */
  clearable?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  /** Enter pressed in the field. */
  (e: 'search'): void;
  (e: 'clear'): void;
}>();

// Generate a unique fallback ID if none provided
const inputId = props.id || `search-${Math.random().toString(36).substr(2, 9)}`;

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const clear = () => {
  emit('update:modelValue', '');
  emit('clear');
};
</script>
