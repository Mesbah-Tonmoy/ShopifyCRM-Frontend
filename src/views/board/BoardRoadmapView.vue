<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import BoardVoteButton from '@/components/board/BoardVoteButton.vue';
import BoardRequestModal from '@/components/board/BoardRequestModal.vue';
import BoardSelect from '@/components/board/BoardSelect.vue';
import { useBoardContext } from '@/composables/useBoardContext';
import { useBoardVoting } from '@/composables/useBoardVoting';
import {
  BOARD_SORT_OPTIONS,
  boardService,
  type BoardColumn,
  type BoardRequest,
  type BoardSort,
} from '@/services/boardService';

const board = useBoardContext();

const columns = ref<BoardColumn[]>([]);
const loading = ref(true);
const sort = ref<BoardSort>('votes');
const activeRequest = ref<BoardRequest | null>(null);

watch(sort, () => load());

onMounted(load);

async function load() {
  loading.value = true;

  try {
    const response = await boardService.getRoadmap(board.slug.value, sort.value);
    columns.value = response.columns;
  } catch (error) {
    board.handleError(error);
  } finally {
    loading.value = false;
  }
}

/**
 * Fold an updated card back into its column, so counts changed inside the
 * modal are reflected behind it.
 */
const syncRequest = (updated: BoardRequest) => {
  for (const column of columns.value) {
    const match = column.requests.find((item) => item.id === updated.id);

    if (match) Object.assign(match, updated);
  }

  if (activeRequest.value?.id === updated.id) Object.assign(activeRequest.value, updated);
};

const { canVote, toggleVote } = useBoardVoting(syncRequest);

// The submission form lives in the layout, so its results arrive through the
// board context. A new request needs a reload rather than a splice, because
// only the server knows which column it belongs in.
watch(
  () => board.lastCreated.value,
  (created) => {
    if (created) load();
  }
);

watch(
  () => board.lastUpdated.value,
  (updated) => {
    if (updated) syncRequest(updated);
  }
);
</script>

<template>
  <section>
    <!-- Heading and sort share a row, with the control pinned right. -->
    <header class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-[-0.3px]">Roadmap</h1>
        <p class="mt-0.5 text-[13px]" style="color: var(--bd-ink-mid)">
          Where every request stands. Votes stay open at every stage — they decide what moves next.
        </p>
      </div>

      <BoardSelect v-model="sort" :options="BOARD_SORT_OPTIONS" aria-label="Sort roadmap" />
    </header>

    <p v-if="loading" class="py-10 text-center text-[14px]" style="color: var(--bd-ink-soft)">Loading roadmap…</p>

    <!--
      Columns share the full width when they fit, and scroll horizontally once
      they cannot: `flex-1` spreads the spare space, `min-w` stops them being
      squeezed past readability, and `max-w` keeps a board with only two or
      three visible columns from stretching into oversized panels — which is
      where `justify-between` takes over and distributes them instead.
    -->
    <div v-else class="board-scroll flex justify-between gap-3.5 overflow-x-auto pb-3">
      <div
        v-for="column in columns"
        :key="column.status"
        class="flex min-w-[260px] max-w-[400px] flex-1 flex-col"
        :data-status="column.status"
      >
        <div class="h-[3px] rounded-t-[3px]" style="background: var(--bd-status)"></div>

        <header
          class="flex items-center gap-2 rounded-b-[10px] px-3 py-2.5"
          style="background: var(--bd-surface); border: 1px solid var(--bd-border); border-top: none"
        >
          <span class="text-[14px] font-semibold">{{ column.label }}</span>
          <span
            class="ml-auto rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums"
            style="background: var(--bd-sunken); color: var(--bd-ink-mid)"
          >
            {{ column.total }}
          </span>
        </header>

        <div class="mt-2.5 flex flex-col gap-2.5">
          <article
            v-for="request in column.requests"
            :key="request.id"
            class="board-card flex cursor-pointer gap-3 rounded-[10px] border border-[var(--bd-border)] px-3 py-3 shadow-[var(--bd-shadow-sm)] hover:shadow-[var(--bd-shadow-md)]"
            style="transition: background-color 150ms ease, box-shadow 150ms ease"
            role="button"
            tabindex="0"
            @click="activeRequest = request"
            @keydown.enter.prevent="activeRequest = request"
            @keydown.space.prevent="activeRequest = request"
          >
            <div class="min-w-0 flex-1">
              <div v-if="request.is_pinned" class="mb-1.5">
                <span class="board-badge">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M6.5 14.5h2.35l.408 2.856a.75.75 0 0 0 1.485 0l.407-2.856h2.35a2 2 0 0 0 2-2v-.5a2 2 0 0 0-1.944-2l-.609-2.738a2 2 0 0 0 1.053-1.762v-.5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v.5a2 2 0 0 0 1.053 1.762l-.609 2.739a2 2 0 0 0-1.944 1.999v.5a2 2 0 0 0 2 2Zm1.481-4.5h1.269a.75.75 0 0 1 0 1.5h-2.5v-.007l-.265.007a.5.5 0 0 0-.485.5v.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-.5a.5.5 0 0 0-.485-.5l-1.17-.032-1.108-4.988.999-.539a.5.5 0 0 0 .264-.441v-.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5v.5a.5.5 0 0 0 .264.441l1 .539-.783 3.52Z" />
                  </svg>
                  Pinned
                </span>
              </div>
              <h3 class="text-[14px] leading-snug font-semibold">{{ request.title }}</h3>
              <img
                v-if="request.image_url"
                :src="request.image_url"
                alt=""
                loading="lazy"
                class="mt-1.5 max-h-28 w-full rounded-md object-cover"
                style="border: 1px solid var(--bd-border); background: var(--bd-sunken)"
              />
              <p v-if="request.description" class="mt-1 line-clamp-3 text-[13px]" style="color: var(--bd-ink-mid)">
                {{ request.description }}
              </p>
              <p v-if="request.status_note" class="mt-1.5 line-clamp-2 text-[12.5px]" style="color: var(--bd-ink-soft)">
                {{ request.status_note }}
              </p>
              <span
                v-if="request.comments_count"
                class="mt-1.5 block text-[12px] font-semibold"
                style="color: var(--bd-link)"
              >
                {{ request.comments_count }} {{ request.comments_count === 1 ? 'comment' : 'comments' }}
              </span>
            </div>

            <BoardVoteButton
              :count="request.votes_count"
              :has-voted="request.has_voted"
              :disabled="!canVote"
              compact
              @toggle="toggleVote(request)"
            />
          </article>

          <p
            v-if="!column.requests.length"
            class="rounded-[10px] px-3 py-6 text-center text-[13px]"
            style="border: 1px dashed var(--bd-border-strong); color: var(--bd-ink-soft)"
          >
            Nothing here yet
          </p>

          <p
            v-else-if="column.total > column.requests.length"
            class="rounded-[10px] px-3 py-2.5 text-center text-[13px]"
            style="border: 1px dashed var(--bd-border-strong); color: var(--bd-ink-soft)"
          >
            {{ column.total - column.requests.length }} more
          </p>
        </div>
      </div>
    </div>

    <BoardRequestModal
      :request="activeRequest"
      :can-vote="Boolean(canVote)"
      @close="activeRequest = null"
      @vote="toggleVote"
      @commented="syncRequest"
    />
  </section>
</template>

<style scoped>
.board-card {
  background: var(--bd-surface);
}

.board-card:hover {
  background: var(--bd-raised);
}
</style>
