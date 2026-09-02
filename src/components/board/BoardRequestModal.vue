<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BoardVoteButton from './BoardVoteButton.vue';
import BoardStatusChip from './BoardStatusChip.vue';
import BoardBanner, { statusTone } from './BoardBanner.vue';
import { boardService, type BoardComment, type BoardRequest } from '@/services/boardService';
import { useBoardContext } from '@/composables/useBoardContext';
import { useVisibleViewport } from '@/composables/useVisibleViewport';
import { formatDate } from '@/utils/date';

const props = defineProps<{
  request: BoardRequest | null;
  canVote: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'vote', request: BoardRequest): void;
  (e: 'commented', request: BoardRequest): void;
}>();

const board = useBoardContext();

const open = computed(() => props.request !== null);
const { top: visibleTop, height: visibleHeight } = useVisibleViewport(open);

/**
 * Pin the overlay to the visible band when one was measured, otherwise cover
 * the viewport as normal.
 */
const overlayStyle = computed(() => ({
  background: 'rgba(20, 22, 29, 0.5)',
  ...(visibleHeight.value !== null
    ? { top: `${visibleTop.value}px`, height: `100%`, alignItems: 'flex-start', bottom: 'auto' }
    : {}),
}));

/**
 * Cap the panel against the measured band rather than `vh`, which inside a
 * grown iframe describes the iframe, not the screen.
 */
const imageStyle = computed(() => ({
  border: '1px solid var(--bd-border)',
  background: 'var(--bd-sunken)',
  maxHeight: visibleHeight.value !== null ? `${Math.max(160, visibleHeight.value * 0.45)}px` : '45vh',
}));

// Surface and shadow come from `.board-modal`; only the ceiling depends on the
// measured band.
const panelStyle = computed(() => ({
  maxHeight: visibleHeight.value !== null ? `${Math.max(240, visibleHeight.value - 40)}px` : '94vh',
}));

const comments = ref<BoardComment[]>([]);
const loading = ref(false);
const draft = ref('');
const posting = ref(false);
const subscribing = ref(false);

const canComment = computed(
  () => board.config.value?.board.allow_comments && board.canWrite.value
);

const load = async (id: number) => {
  loading.value = true;

  try {
    comments.value = await boardService.getComments(board.slug.value, id);
  } catch (error) {
    board.handleError(error);
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.request?.id,
  (id) => {
    comments.value = [];
    draft.value = '';

    if (id) load(id);
  },
  { immediate: true }
);

const post = async () => {
  const body = draft.value.trim();

  if (!props.request || body.length < 2 || posting.value) return;

  posting.value = true;

  try {
    const comment = await boardService.addComment(board.slug.value, props.request.id, body);
    comments.value = [...comments.value, comment];
    draft.value = '';

    // Keep the card's counter in step with the thread.
    emit('commented', { ...props.request, comments_count: comments.value.length });
    board.notify('Comment posted');
  } catch (error) {
    board.handleError(error);
  } finally {
    posting.value = false;
  }
};

/**
 * Follow a request without voting for it. Voting already implies interest, so
 * a voter is notified either way; this is for merchants who want the update
 * without adding their weight to the tally.
 */
const toggleSubscription = async () => {
  if (!props.request || subscribing.value) return;

  if (!board.canWrite.value) {
    board.notify('Open this board from your Shopify admin to follow requests.');
    return;
  }

  subscribing.value = true;
  const wasSubscribed = props.request.is_subscribed;

  try {
    const updated = wasSubscribed
      ? await boardService.unsubscribe(board.slug.value, props.request.id)
      : await boardService.subscribe(board.slug.value, props.request.id);

    emit('commented', updated);
    board.notify(wasSubscribed ? 'You will no longer be emailed' : "You'll be emailed when this changes");
  } catch (error) {
    board.handleError(error);
  } finally {
    subscribing.value = false;
  }
};
</script>

<template>
  <div
    v-if="request"
    class="fixed inset-x-0 top-0 bottom-0 z-40 flex items-center justify-center p-4 sm:p-6"
    :style="overlayStyle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bd-request-heading"
    @click.self="emit('close')"
  >
    <!--
      Sized against the measured visible band rather than `vh`, so the panel
      always fits the screen even when the host app has grown the iframe well
      beyond it. The body is the only scrolling region.
    -->
    <div class="board-modal" :style="panelStyle">
      <div class="board-modal__header">
        <h2 id="bd-request-heading" class="board-modal__title">{{ request.title }}</h2>

        <button type="button" class="board-modal__close" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="h-5 w-5">
            <path d="M15 5 5 15M5 5l10 10" />
          </svg>
        </button>
      </div>

      <div class="board-modal__body board-scroll">
        <!-- Vote, provenance and follow read as one row above the request. -->
        <div class="flex items-start gap-4">
          <BoardVoteButton
            :count="request.votes_count"
            :has-voted="request.has_voted"
            :disabled="!canVote"
            @toggle="emit('vote', request)"
          />

          <div class="board-meta min-w-0 flex-1">
            <BoardStatusChip :status="request.status" :label="request.status_label" />

            <div class="board-meta__line">
              <span v-if="request.submitter_name">{{ request.submitter_name }}</span>
              <span v-if="request.created_at">{{ formatDate(request.created_at) }}</span>
            </div>
          </div>

          <!-- Following is the committed state, so it takes the primary fill. -->
          <button
            v-if="board.canWrite.value"
            type="button"
            class="board-btn shrink-0"
            :class="request.is_subscribed ? 'board-btn--primary' : 'board-btn--secondary'"
            :aria-pressed="request.is_subscribed"
            :disabled="subscribing"
            @click="toggleSubscription"
          >
            {{ request.is_subscribed ? 'Following' : 'Follow' }}
          </button>
        </div>

        <p v-if="request.description" class="mt-4 text-[13px] leading-5 whitespace-pre-line" style="color: var(--bd-ink-mid)">
          {{ request.description }}
        </p>

        <img
          v-if="request.image_url"
          :src="request.image_url"
          alt="Screenshot attached to this request"
          class="mt-3 w-full rounded-lg object-contain"
          :style="imageStyle"
        />

        <BoardBanner
          v-if="request.status_note"
          :tone="statusTone(request.status)"
          title="Response"
          class="mt-4"
        >
          <p>{{ request.status_note }}</p>
        </BoardBanner>

        <!-- discussion -->
        <div class="mt-4 pt-4" style="border-top: 1px solid var(--bd-border)">
          <h3 class="mb-3 text-[13px] font-semibold">
            Discussion
            <span class="font-normal" style="color: var(--bd-ink-soft)">({{ comments.length }})</span>
          </h3>

          <p v-if="loading" class="py-4 text-[13px]" style="color: var(--bd-ink-soft)">Loading…</p>

          <p v-else-if="!comments.length" class="py-2 text-[13px]" style="color: var(--bd-ink-soft)">
            No comments yet. Add your point of view to help us weigh this up.
          </p>

          <ul v-else class="flex flex-col gap-3.5">
            <li v-for="comment in comments" :key="comment.id" class="flex flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span class="font-semibold" style="color: var(--bd-ink)">{{ comment.author_name }}</span>
                <span v-if="comment.is_official" class="board-badge">Team</span>
                <span style="color: var(--bd-ink-soft)">{{ formatDate(comment.created_at) }}</span>
              </div>
              <p class="text-[13px] leading-5 whitespace-pre-line" style="color: var(--bd-ink-mid)">{{ comment.body }}</p>
            </li>
          </ul>

          <div v-if="canComment" class="mt-4">
            <textarea
              v-model="draft"
              rows="3"
              maxlength="2000"
              placeholder="Share how you'd use this, or what would make it work for your store."
              class="board-input w-full resize-y"
            ></textarea>
            <button
              type="button"
              class="board-btn board-btn--primary mt-2"
              :disabled="draft.trim().length < 2 || posting"
              @click="post"
            >
              {{ posting ? 'Posting…' : 'Post comment' }}
            </button>
          </div>

          <p v-else-if="!board.canWrite.value" class="mt-4 text-[13px]" style="color: var(--bd-ink-soft)">
            Open this board from your Shopify admin to join the discussion.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
