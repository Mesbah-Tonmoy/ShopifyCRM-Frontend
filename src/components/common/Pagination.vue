<script setup lang="ts">
import { computed } from 'vue';

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

/**
 * Page numbers with ellipses once there are too many to list: always the
 * first and last, plus a window around the current page.
 */
const visiblePages = computed<(number | '...')[]>(() => {
  const total = props.lastPage;
  const current = props.currentPage;

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push('...');

  pages.push(total);

  return pages;
});

const goToPage = (page: number) => {
  if (page >= 1 && page <= props.lastPage && page !== props.currentPage) {
    emit('update:currentPage', page);
  }
};

const changePerPage = (event: Event) => {
  emit('update:perPage', Number((event.target as HTMLSelectElement).value));
};
</script>

<template>
  <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
    <div class="flex items-center space-x-4">
      <p class="text-sm text-gray-700">{{ summary }}</p>

      <div class="flex items-center space-x-2">
        <label :for="`per-page-${itemLabel}`" class="text-sm text-gray-700">Per Page</label>
        <select
          :id="`per-page-${itemLabel}`"
          :value="perPage"
          class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-teal focus:border-teal"
          @change="changePerPage"
        >
          <option v-for="option in perPageOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </div>
    </div>

    <nav v-if="lastPage > 1" class="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
      <button
        :disabled="currentPage === 1"
        :class="[
          'relative inline-flex items-center px-2 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium',
          currentPage === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-50 cursor-pointer'
        ]"
        @click="goToPage(currentPage - 1)"
      >
        <span class="sr-only">Previous</span>
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
      </button>

      <template v-for="(page, index) in visiblePages" :key="index">
        <button
          v-if="page !== '...'"
          :class="[
            'relative inline-flex items-center px-4 py-2 border text-sm font-medium cursor-pointer',
            page === currentPage
              ? 'z-10 bg-teal border-teal text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          ]"
          @click="goToPage(page as number)"
        >
          {{ page }}
        </button>
        <span
          v-else
          class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700"
        >
          ...
        </span>
      </template>

      <button
        :disabled="currentPage === lastPage"
        :class="[
          'relative inline-flex items-center px-2 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium',
          currentPage === lastPage ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-50 cursor-pointer'
        ]"
        @click="goToPage(currentPage + 1)"
      >
        <span class="sr-only">Next</span>
        <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
        </svg>
      </button>
    </nav>
  </div>
</template>
