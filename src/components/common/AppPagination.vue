<script setup lang="ts">
import { computed } from 'vue';
import type { AcceptableValue } from 'reka-ui';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Pager for a server-paginated list.
 *
 * Takes the shape Laravel's paginator already returns, so a page can hand over
 * `response.data` without reshaping it.
 */
const props = withDefaults(
  defineProps<{
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
    /** First and last row numbers on this page; null on an empty result. */
    from?: number | null;
    to?: number | null;
    /** Plural noun for the summary line, e.g. "templates". */
    itemLabel?: string;
    /** Choices for the per-page select; an empty list hides it (fixed page size). */
    perPageOptions?: number[];
  }>(),
  {
    from: null,
    to: null,
    itemLabel: 'items',
    perPageOptions: () => [15, 25, 50, 100],
  }
);

const emit = defineEmits<{
  (e: 'update:currentPage', page: number): void;
  (e: 'update:perPage', perPage: number): void;
}>();

const summary = computed(() => {
  if (!props.total) return `Showing 0 ${props.itemLabel}`;

  const from = props.from ?? (props.currentPage - 1) * props.perPage + 1;
  const to = props.to ?? Math.min(props.currentPage * props.perPage, props.total);

  return `Showing ${from} to ${to} of ${props.total.toLocaleString()} ${props.itemLabel}`;
});

// Labels can have spaces ("stores in us-east-1"); ids cannot.
const perPageId = computed(() => `per-page-${props.itemLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);

const goToPage = (page: number) => {
  if (page >= 1 && page <= props.lastPage && page !== props.currentPage) {
    emit('update:currentPage', page);
  }
};

const changePerPage = (value: AcceptableValue) => {
  emit('update:perPage', Number(value));
};
</script>

<template>
  <div class="flex items-center justify-between gap-4 border-t bg-card px-4 py-3 sm:px-6">
    <div class="flex items-center gap-4">
      <p class="text-sm text-muted-foreground">{{ summary }}</p>

      <div v-if="perPageOptions.length" class="flex items-center gap-2">
        <Label :for="perPageId" class="font-normal text-muted-foreground">Per Page</Label>
        <Select :model-value="perPage" @update:model-value="changePerPage">
          <SelectTrigger :id="perPageId" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in perPageOptions" :key="option" :value="option">{{ option }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- Reka works out the page window (first, last, and one either side of the current page) -->
    <Pagination
      v-if="lastPage > 1"
      :page="currentPage"
      :total="total"
      :items-per-page="perPage"
      :sibling-count="1"
      show-edges
      class="mx-0 w-auto justify-end"
      @update:page="goToPage"
    >
      <PaginationContent v-slot="{ items }">
        <PaginationPrevious />
        <template v-for="(item, index) in items" :key="index">
          <PaginationItem v-if="item.type === 'page'" :value="item.value" :is-active="item.value === currentPage">
            {{ item.value }}
          </PaginationItem>
          <PaginationEllipsis v-else :index="index" />
        </template>
        <PaginationNext />
      </PaginationContent>
    </Pagination>
  </div>
</template>
