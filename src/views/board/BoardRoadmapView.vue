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
    <!--
      Title on the left, and everything the merchant can act with on the right:
      who they are voting as, how the board is ordered, and the one primary
      action. The row wraps rather than truncating, so a long shop domain pushes
      the controls onto their own line instead of being cut.
    -->
    <header class="board-roadmap__bar">
      <div class="board-roadmap__intro">
        <h1 class="board-roadmap__title">Roadmap</h1>
        <p class="board-roadmap__subtitle">
          Where every request stands. Votes stay open at every stage — they decide what moves next.
        </p>
      </div>

      <div class="board-roadmap__controls">
        <span v-if="board.config.value?.voter" class="board-roadmap__voter">
          <span class="board-roadmap__voter-dot"></span>
          <span>Voting as</span>
          <strong class="board-roadmap__voter-shop">
            {{ board.config.value.voter.shop_domain }}
          </strong>
        </span>
        <span v-else class="board-roadmap__voter board-roadmap__voter--readonly">Read only</span>

        <BoardSelect v-model="sort" :options="BOARD_SORT_OPTIONS" aria-label="Sort roadmap" />

        <button
          v-if="board.canSubmit.value"
          type="button"
          class="board-btn board-btn--primary board-roadmap__submit"
          @click="board.openSubmitForm()"
        >
          Request a feature
        </button>
      </div>
    </header>

    <p v-if="loading" class="board-roadmap__loading">Loading roadmap…</p>

    <!-- One track per status; `.board-roadmap__columns` carries the layout. -->
    <div v-else class="board-scroll board-roadmap__columns">
      <section
        v-for="column in columns"
        :key="column.status"
        class="board-column"
        :data-status="column.status"
      >
        <div class="board-column__head">
          <div class="board-column__rule"></div>
          <div class="board-column__row">
            <div class="board-column__name">
              <span class="board-column__dot"></span>
              <h2 class="board-column__label">{{ column.label }}</h2>
            </div>
            <span class="board-column__count">{{ column.total }}</span>
          </div>
        </div>

        <article
          v-for="request in column.requests"
          :key="request.id"
          class="board-card"
          role="button"
          tabindex="0"
          @click="activeRequest = request"
          @keydown.enter.prevent="activeRequest = request"
          @keydown.space.prevent="activeRequest = request"
        >
          <!--
            Only the submitter ever receives a held request, so this notice
            needs no viewer check of its own - the API has already decided who
            sees the row.
          -->
          <span
            v-if="request.is_awaiting_review"
            class="board-card__chip board-card__chip--review"
            title="Waiting for our review. Other stores cannot see it yet."
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-12a.75.75 0 0 0-1.5 0v4c0 .28.16.54.4.67l2.5 1.5a.75.75 0 1 0 .77-1.29l-2.17-1.3V6Z" />
            </svg>
            Awaiting review - only you can see this
          </span>

          <span v-if="request.is_pinned" class="board-card__chip">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path fill-rule="evenodd" d="M6.5 14.5h2.35l.408 2.856a.75.75 0 0 0 1.485 0l.407-2.856h2.35a2 2 0 0 0 2-2v-.5a2 2 0 0 0-1.944-2l-.609-2.738a2 2 0 0 0 1.053-1.762v-.5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v.5a2 2 0 0 0 1.053 1.762l-.609 2.739a2 2 0 0 0-1.944 1.999v.5a2 2 0 0 0 2 2Zm1.481-4.5h1.269a.75.75 0 0 1 0 1.5h-2.5v-.007l-.265.007a.5.5 0 0 0-.485.5v.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-.5a.5.5 0 0 0-.485-.5l-1.17-.032-1.108-4.988.999-.539a.5.5 0 0 0 .264-.441v-.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5v.5a.5.5 0 0 0 .264.441l1 .539-.783 3.52Z" />
            </svg>
            Pinned
          </span>

          <div class="board-card__row">
            <div class="board-card__text">
              <h3 class="board-card__title">{{ request.title }}</h3>

              <!--
                The image is announced rather than shown: a thumbnail at this
                width reads as noise beside the title, and the modal behind
                this card renders the attachment at a size worth looking at.
              -->
              <span v-if="request.image_url" class="board-card__chip">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M12.6 4.4a2.25 2.25 0 0 0-3.18 0l-4.6 4.6a3.75 3.75 0 0 0 5.31 5.3l4.24-4.24a.75.75 0 0 1 1.06 1.06l-4.24 4.24a5.25 5.25 0 0 1-7.43-7.42l4.6-4.6a3.75 3.75 0 0 1 5.3 5.3l-4.59 4.6a2.25 2.25 0 0 1-3.18-3.18l3.89-3.89a.75.75 0 0 1 1.06 1.06l-3.89 3.89a.75.75 0 0 0 1.06 1.06l4.6-4.6a2.25 2.25 0 0 0 0-3.18Z" />
                </svg>
                1 attachment
              </span>

              <p v-if="request.description" class="board-card__body">{{ request.description }}</p>
            </div>

            <BoardVoteButton
              :count="request.votes_count"
              :has-voted="request.has_voted"
              :disabled="!canVote"
              compact
              @toggle="toggleVote(request)"
            />
          </div>

          <div v-if="request.status_note || request.comments_count" class="board-card__foot">
            <p v-if="request.status_note" class="board-card__note">{{ request.status_note }}</p>
            <span v-if="request.comments_count" class="board-card__comments">
              {{ request.comments_count }} {{ request.comments_count === 1 ? 'comment' : 'comments' }}
            </span>
          </div>
        </article>

        <p v-if="!column.requests.length" class="board-column__placeholder">Nothing here yet</p>

        <p v-else-if="column.total > column.requests.length" class="board-column__placeholder">
          {{ column.total - column.requests.length }} more
        </p>
      </section>
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

