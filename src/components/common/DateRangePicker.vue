<template>
  <VueDatePicker
    :model-value="modelValue"
    multi-calendars
    auto-apply
    :range="true"
    :time-config="{ enableTimePicker: false }"
    :placeholder="placeholder"
    :preset-dates="presetDates"
    teleport="body"
    @update:model-value="onUpdate"
  >
    <template #arrow-left>
      <ChevronLeft class="size-4" />
    </template>
    <template #arrow-right>
      <ChevronRight class="size-4" />
    </template>
  </VueDatePicker>
</template>

<script lang="ts">
import dayjs from 'dayjs';

export interface DateFilter {
  /** YYYY-MM-DD, or '' when the range was cleared. */
  from: string;
  to: string;
}

/**
 * The API filter for a picked range: both ends → the range, cleared → empty
 * strings, only the first end clicked so far → null (wait for the second).
 */
export function toDateFilter(range: Date[] | null): DateFilter | null {
  if (range && range.length === 2 && range[0] && range[1]) {
    return { from: dayjs(range[0]).format('YYYY-MM-DD'), to: dayjs(range[1]).format('YYYY-MM-DD') };
  }
  if (!range || range.length === 0) return { from: '', to: '' };
  return null;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns';

/**
 * Date-range filter with the app's presets. The calendar is teleported to
 * <body> so a card's overflow or a later sibling never covers it; `teleport`
 * must name the target, because the prop is String|Boolean and a bare
 * attribute arrives as '' (off). `change` fires once a full range is picked
 * or the field is cleared — ready to send to the API.
 */
defineProps<{
  modelValue: Date[] | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Date[] | null): void;
  (e: 'change', filter: DateFilter): void;
}>();

// Placeholder shows the current month, the range most lists default to.
const placeholder = computed(
  () => `${dayjs().startOf('month').format('MMM DD, YYYY')} - ${dayjs().endOf('month').format('MMM DD, YYYY')}`
);

const presetDates = [
  { label: 'Today', value: [new Date(), new Date()] },
  { label: 'Last 7 Days', value: [subDays(new Date(), 7), new Date()] },
  { label: 'This Month', value: [startOfMonth(new Date()), endOfMonth(new Date())] },
  { label: 'Last Month', value: [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))] },
  { label: 'This Year', value: [startOfYear(new Date()), endOfYear(new Date())] },
];

const onUpdate = (value: Date[] | null) => {
  emit('update:modelValue', value);
  const filter = toDateFilter(value);
  if (filter) emit('change', filter);
};
</script>
