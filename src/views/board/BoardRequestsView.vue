<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import BoardVoteButton from '@/components/board/BoardVoteButton.vue';
import BoardStatusChip from '@/components/board/BoardStatusChip.vue';
import BoardRequestModal from '@/components/board/BoardRequestModal.vue';
import BoardBanner, { statusTone } from '@/components/board/BoardBanner.vue';
import BoardSelect from '@/components/board/BoardSelect.vue';
import ClampedText from '@/components/board/ClampedText.vue';
import { useBoardContext } from '@/composables/useBoardContext';
import { useBoardVoting } from '@/composables/useBoardVoting';
import {
  BOARD_SORT_OPTIONS,
  boardService,
  type BoardRequest,
  type BoardSort,
} from '@/services/boardService';
import { formatDate } from '@/utils/date';

const board = useBoardContext();

const requests = ref<BoardRequest[]>([]);
const total = ref(0);
const page = ref(1);
const lastPage = ref(1);
const loading = ref(false);

const search = ref('');
const sort = ref<BoardSort>('votes');

const activeRequest = ref<BoardRequest | null>(null);
const stats = ref({ submitted: 0, voted: 0, shipped: 0 });

onMounted(() => {
  load();
  loadStats();
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 350);
});

watch(sort, () => {
  page.value = 1;
  load();
});

// The submission form lives in the layout, so its results arrive through the
// board context rather than as a local call.
watch(
  () => board.lastCreated.value,
  (created) => {
    if (!created) return;

    requests.value = [created, ...requests.value];
    total.value += 1;
    loadStats();
  }
);

watch(
  () => board.lastUpdated.value,
  (updated) => {
    if (updated) syncRequest(updated);
  }
);

const load = async () => {
  loading.value = true;

  try {
    const response = await boardService.getRequests(board.slug.value, {
      search: search.value.trim() || undefined,
      sort: sort.value,
      page: page.value,
      per_page: 15,
    });

    requests.value = response.data;
    total.value = response.total;
    lastPage.value = response.last_page;
  } catch (error) {
    board.handleError(error);
  } finally {
    loading.value = false;
  }
};

const loadStats = async () => {
  if (!board.canWrite.value) return;

  try {
    const me = await boardService.getMe(board.slug.value);
    stats.value = me.stats;
  } catch {
    // The activity line is a nicety; failing to load it is not worth a toast.
  }
};

/**
 * Fold an updated card back into the list so vote and comment counts stay in
 * step whether they were changed here or inside the modal.
 */
const syncRequest = (updated: BoardRequest) => {
  const index = requests.value.findIndex((item) => item.id === updated.id);

  if (index !== -1) Object.assign(requests.value[index]!, updated);
  if (activeRequest.value?.id === updated.id) Object.assign(activeRequest.value, updated);
};

const { canVote, toggleVote } = useBoardVoting(syncRequest, loadStats);

const goToPage = (next: number) => {
  if (next < 1 || next > lastPage.value) return;
  page.value = next;
  load();
};
</script>

<template>
  <section>
    <header class="mb-5">
      <h1 class="text-xl font-bold tracking-[-0.3px]">Feature Requests</h1>
      <p class="mt-0.5 text-[13px]" style="color: var(--bd-ink-mid)">
        Suggest an improvement or vote on what other stores have asked for. Every vote is counted once per store.
      </p>

      <!-- Your own history, kept to one line now the form has moved out. -->
      <div
        v-if="board.canWrite.value"
        class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]"
        style="color: var(--bd-ink-soft)"
      >
        <span v-for="stat in [
            { n: stats.submitted, l: 'submitted' },
            { n: stats.voted, l: 'voted on' },
            { n: stats.shipped, l: 'shipped for you' },
          ]"
          :key="stat.l"
        >
          <strong class="font-semibold tabular-nums" style="color: var(--bd-ink)">{{ stat.n }}</strong>
          {{ stat.l }}
        </span>
      </div>
    </header>

    <div class="mb-3.5 flex flex-wrap items-center gap-2.5">
      <input
        v-model="search"
        type="text"
        placeholder="Search requests"
        aria-label="Search requests"
        class="board-input min-w-[200px] flex-1"
      />

      <BoardSelect v-model="sort" :options="BOARD_SORT_OPTIONS" aria-label="Sort requests" />
      <span class="text-[13px] tabular-nums whitespace-nowrap" style="color: var(--bd-ink-soft)">
        {{ total }} {{ total === 1 ? 'request' : 'requests' }}
      </span>
    </div>

    <p v-if="loading" class="py-10 text-center text-[14px]" style="color: var(--bd-ink-soft)">Loading…</p>

    <p v-else-if="!requests.length" class="py-11 text-center text-[14px]" style="color: var(--bd-ink-soft)">
      No requests match your search. Try a different term<template v-if="board.canSubmit.value">, or
        <button type="button" class="font-semibold underline underline-offset-2" style="color: var(--bd-link)" @click="board.openSubmitForm()">
          suggest it yourself</button></template>.
    </p>

    <div v-else class="flex flex-col gap-2.5">
      <article
        v-for="request in requests"
        :key="request.id"
        class="flex cursor-pointer gap-3.5 rounded-[10px] p-4 transition hover:shadow-md"
        style="background: var(--bd-surface); border: 1px solid var(--bd-border); box-shadow: var(--bd-shadow-sm)"
        role="button"
        tabindex="0"
        @click="activeRequest = request"
        @keydown.enter.prevent="activeRequest = request"
        @keydown.space.prevent="activeRequest = request"
      >
        <BoardVoteButton
          :count="request.votes_count"
          :has-voted="request.has_voted"
          :disabled="!canVote"
          @toggle="toggleVote(request)"
        />

        <div class="min-w-0 flex-1">
          <h3 class="text-[15px] leading-snug font-semibold tracking-[-0.1px]">{{ request.title }}</h3>

          <ClampedText
            v-if="request.description"
            :text="request.description"
            class="mt-1 text-[14px]"
            style="color: var(--bd-ink-mid)"
          />

          <img
            v-if="request.image_url"
            :src="request.image_url"
            alt=""
            loading="lazy"
            class="mt-2 max-h-40 rounded-md object-contain"
            style="border: 1px solid var(--bd-border); background: var(--bd-sunken)"
          />

          <div class="board-meta mt-2">
            <BoardStatusChip :status="request.status" :label="request.status_label" />

            <div class="board-meta__line">
              <span v-if="request.submitter_name">{{ request.submitter_name }}</span>
              <span v-if="request.created_at">{{ formatDate(request.created_at) }}</span>
              <span class="font-semibold" style="color: var(--bd-link)">
                {{ request.comments_count }}
                {{ request.comments_count === 1 ? 'comment' : 'comments' }}
              </span>
            </div>
          </div>

          <BoardBanner
            v-if="request.status_note"
            :tone="statusTone(request.status)"
            title="Response"
            class="mt-2.5"
          >
            <p>{{ request.status_note }}</p>
          </BoardBanner>
        </div>
      </article>
    </div>

    <div v-if="lastPage > 1" class="mt-4 flex items-center justify-between text-[13px]" style="color: var(--bd-ink-mid)">
      <button
        type="button"
        class="board-btn board-btn--secondary"
        :disabled="page === 1"
        @click="goToPage(page - 1)"
      >
        Previous
      </button>
      <span>Page {{ page }} of {{ lastPage }}</span>
      <button
        type="button"
        class="board-btn board-btn--secondary"
        :disabled="page === lastPage"
        @click="goToPage(page + 1)"
      >
        Next
      </button>
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
