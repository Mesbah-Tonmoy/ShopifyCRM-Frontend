<template>
  <div class="flex items-center gap-2">
    <Label
      v-if="label"
      :for="inputId"
      class="whitespace-nowrap text-muted-foreground"
    >
      {{ label }}:
    </Label>
    <Select :model-value="selectedKey" :disabled="disabled" @update:model-value="onSelect">
      <SelectTrigger :id="inputId" :name="inputId" :class="selectClass" :aria-invalid="invalid || undefined">
        <SelectValue :placeholder="placeholder" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-if="placeholder" :value="PLACEHOLDER_KEY">{{ placeholder }}</SelectItem>
        <SelectItem v-for="(option, index) in options" :key="index" :value="String(index)">
          {{ option.label }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number | boolean | null">
import { computed } from 'vue';
import type { AcceptableValue } from 'reka-ui';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SelectOption<V> {
  value: V;
  label: string;
}

interface Props {
  modelValue: T;
  options: SelectOption<NoInfer<T>>[];
  id?: string;
  label?: string;
  /** Shown when nothing is selected, and offered as a first item that sets the model back to null. */
  placeholder?: string;
  selectClass?: string;
  disabled?: boolean;
  /** Red error styling, for a Field showing a validation message. */
  invalid?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
}>();

// Reka only takes string item values, so items are keyed by their index and
// mapped back to the real value (number, boolean, null, ...) on change.
const PLACEHOLDER_KEY = '__placeholder__';

// Generate a unique fallback ID if none provided
const inputId = props.id || (props.label ? props.label.toLowerCase().replace(/\s+/g, '-') : `select-${Math.random().toString(36).substr(2, 9)}`);

const selectedKey = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue);
  if (index !== -1) return String(index);

  return props.placeholder && props.modelValue === null ? PLACEHOLDER_KEY : undefined;
});

const onSelect = (key: AcceptableValue) => {
  if (key === PLACEHOLDER_KEY) {
    emit('update:modelValue', null as T);
    return;
  }

  const option = props.options[Number(key)];
  if (option) emit('update:modelValue', option.value);
};
</script>
