<template>
  <div v-if="open" class="fixed inset-0 z-40 flex justify-end bg-dark/40" @click.self="$emit('close')">
    <aside class="flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
      <!-- header -->
      <header class="flex items-start justify-between gap-4 border-b border-lighter px-5 py-4">
        <div class="min-w-0">
          <div class="mb-1.5 flex items-center gap-2">
            <StatusChip v-if="request" :status="request.status" :label="request.status_label" />
            <span v-if="request?.is_pinned" class="text-b6 font-semibold text-primary">Pinned</span>
            <span v-if="request?.is_hidden" class="text-b6 font-semibold text-warning">Hidden by you</span>
            <span v-else-if="request && !request.is_public" class="text-b6 font-semibold text-info">Not on board yet</span>
            <span v-else-if="request" class="text-b6 font-semibold text-green">Live on board</span>
          </div>
          <h2 class="text-h4 font-semibold text-dark">{{ request?.title }}</h2>
          <p class="mt-0.5 text-b5 text-light">
            {{ request?.app?.app_name }} · opened {{ formatDate(request?.created_at, '—') }}
          </p>
        </div>
        <button class="shrink-0 text-light hover:text-dark" aria-label="Close" @click="$emit('close')">
          <CloseIcon class="h-5 w-5" />
        </button>
      </header>

      <div v-if="loading" class="space-y-3 p-5">
        <SkeletonLoader height="1rem" v-for="n in 6" :key="n" />
      </div>

      <div v-else-if="request" class="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
        <!-- vote summary -->
        <div class="mb-5 flex items-center gap-4 rounded-md border border-lighter bg-artboard px-4 py-3">
          <VoteCount :count="request.votes_count" />
          <div class="text-b5 text-mid">
            <span class="font-semibold text-dark">{{ request.votes_count }}</span>
            {{ request.votes_count === 1 ? 'store wants' : 'stores want' }} this
            <span v-if="request.recent_votes_count" class="block text-b6 text-light">
              {{ request.recent_votes_count }} in the last 30 days
            </span>
          </div>
        </div>

        <!-- description -->
        <section class="mb-5">
          <h3 class="mb-1.5 text-b6 font-semibold tracking-wide text-light uppercase">Request</h3>
          <p class="text-b4 whitespace-pre-line text-mid">
            {{ request.description || 'No description provided.' }}
          </p>
          <img v-if="request.image_url" :src="request.image_url" alt="" class="mt-3 max-h-64 rounded-md border border-lighter" />
        </section>

        <!-- submitter -->
        <section class="mb-5">
          <h3 class="mb-1.5 text-b6 font-semibold tracking-wide text-light uppercase">Submitted by</h3>
          <div class="rounded-md border border-lighter px-4 py-3">
            <p class="text-b4 font-semibold text-dark">
              {{ request.installation?.store_name || request.submitter_name || 'Unknown store' }}
            </p>
            <p class="text-b5 text-mid">{{ request.submitter_shop_domain || '—' }}</p>
            <div v-if="request.installation" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-b6 text-light">
              <span v-if="request.installation.shopify_plan">Shopify: {{ request.installation.shopify_plan }}</span>
              <span v-if="request.installation.email">{{ request.installation.email }}</span>
              <span :class="request.installation.is_active ? 'text-green' : 'text-error'">
                {{ request.installation.is_active ? 'Installed' : 'Uninstalled' }}
              </span>
            </div>
            <p v-else class="mt-1 text-b6 text-light">No matching installation record.</p>
          </div>
        </section>

        <!-- public response -->
        <section class="mb-5">
          <h3 class="mb-1.5 text-b6 font-semibold tracking-wide text-light uppercase">Public response</h3>
          <p class="mb-2 text-b6 text-light">
            Your reply to the merchants who asked for this. It appears on the request card on the public
            board — use it to say what you decided and why.
          </p>
          <textarea
            v-model="statusNote"
            rows="3"
            maxlength="2000"
            placeholder="e.g. Shipping in the next release, or why you decided against it."
            class="w-full rounded-sm border border-grey px-3 py-2 text-b4 focus:border-primary focus:outline-none"
          ></textarea>
          <button
            v-if="statusNote !== (request.status_note ?? '')"
            class="mt-2 rounded-sm bg-primary px-3 py-1.5 text-b5 font-semibold text-white hover:bg-primary-dark"
            @click="$emit('save-response', statusNote)"
          >
            Save response
          </button>
        </section>

        <!-- internal note -->
        <section class="mb-5">
          <h3 class="mb-1.5 text-b6 font-semibold tracking-wide text-light uppercase">Internal note</h3>
          <textarea
            v-model="adminNote"
            rows="2"
            maxlength="2000"
            placeholder="Only your team sees this."
            class="w-full rounded-sm border border-grey px-3 py-2 text-b4 focus:border-primary focus:outline-none"
          ></textarea>
          <button
            v-if="adminNote !== (request.admin_note ?? '')"
            class="mt-2 rounded-sm bg-primary px-3 py-1.5 text-b5 font-semibold text-white hover:bg-primary-dark"
            @click="$emit('save-note', adminNote)"
          >
            Save note
          </button>
        </section>

        <!-- voters -->
        <section class="mb-5">
          <h3 class="mb-2 text-b6 font-semibold tracking-wide text-light uppercase">
            Stores backing this ({{ request.voters?.length ?? 0 }})
          </h3>
          <div v-if="request.voters?.length" class="overflow-hidden rounded-md border border-lighter">
            <table class="w-full text-left text-b5">
              <thead class="bg-artboard text-b6 tracking-wide text-light uppercase">
                <tr>
                  <th class="px-3 py-2 font-semibold">Store</th>
                  <th class="px-3 py-2 font-semibold">Shopify plan</th>
                  <th class="px-3 py-2 font-semibold">Voted</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="voter in request.voters" :key="voter.id" class="border-t border-lighter">
                  <td class="px-3 py-2">
                    <span class="block text-dark">{{ voter.store_name || '—' }}</span>
                    <span class="block text-b6 text-light">{{ voter.voter_key }}</span>
                  </td>
                  <td class="px-3 py-2 text-mid">{{ voter.shopify_plan || '—' }}</td>
                  <td class="px-3 py-2 text-mid">{{ formatDate(voter.voted_at, '—') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-b5 text-light">No votes yet.</p>
        </section>

        <!-- discussion -->
        <section class="mb-5">
          <h3 class="mb-2 text-b6 font-semibold tracking-wide text-light uppercase">
            Discussion ({{ request.comments?.length ?? 0 }})
          </h3>

          <ul v-if="request.comments?.length" class="mb-3 space-y-3">
            <li
              v-for="comment in request.comments"
              :key="comment.id"
              class="rounded-md border border-lighter px-3 py-2.5"
              :class="{ 'opacity-60': comment.is_hidden }"
            >
              <div class="flex flex-wrap items-center gap-2 text-b6">
                <span class="font-semibold text-dark">{{ comment.author_name || comment.author_shop_domain || 'A store' }}</span>
                <span v-if="comment.is_official" class="rounded-full bg-teal-light px-2 py-0.5 font-semibold text-teal">Team</span>
                <span v-if="comment.is_hidden" class="font-semibold text-warning">Hidden</span>
                <span class="text-light">{{ formatDate(comment.created_at, '—') }}</span>
                <span class="ml-auto flex gap-2">
                  <button class="font-semibold text-mid hover:text-primary" @click="$emit('toggle-comment', comment)">
                    {{ comment.is_hidden ? 'Restore' : 'Hide' }}
                  </button>
                  <button class="font-semibold text-error hover:underline" @click="$emit('delete-comment', comment)">
                    Delete
                  </button>
                </span>
              </div>
              <p class="mt-1 text-b4 whitespace-pre-line text-mid">{{ comment.body }}</p>
            </li>
          </ul>

          <p v-else class="mb-3 text-b5 text-light">No comments yet.</p>

          <textarea
            v-model="reply"
            rows="2"
            maxlength="2000"
            placeholder="Reply as the team — merchants see this badged as official."
            class="w-full rounded-sm border border-grey px-3 py-2 text-b4 focus:border-primary focus:outline-none"
          ></textarea>
          <button
            v-if="reply.trim().length > 1"
            class="mt-2 rounded-sm bg-primary px-3 py-1.5 text-b5 font-semibold text-white hover:bg-primary-dark"
            @click="postReply"
          >
            Post reply
          </button>
        </section>

        <!-- history -->
        <section>
          <h3 class="mb-2 text-b6 font-semibold tracking-wide text-light uppercase">History</h3>
          <ol class="space-y-2">
            <li v-for="log in request.status_logs" :key="log.id" class="flex gap-3 text-b5">
              <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-grey"></span>
              <div>
                <span class="text-dark">
                  <template v-if="log.from_status">Moved to {{ log.to_status_label }}</template>
                  <template v-else>Submitted</template>
                </span>
                <span class="text-light"> · {{ formatDate(log.created_at, '—') }}</span>
                <span v-if="log.user" class="text-light"> · {{ log.user }}</span>
                <span v-if="log.notified_at" class="text-light"> · voters emailed</span>
                <p v-if="log.note" class="text-mid">{{ log.note }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <!-- actions -->
      <footer v-if="request" class="flex flex-wrap items-center gap-2 border-t border-lighter px-5 py-3">
        <button
          v-for="status in otherStatuses"
          :key="status.value"
          class="rounded-sm border border-grey px-3 py-1.5 text-b5 font-semibold text-mid hover:border-primary hover:text-primary"
          @click="$emit('change-status', status.value)"
        >
          {{ status.label }}
        </button>
        <button
          class="rounded-sm border px-3 py-1.5 text-b5 font-semibold"
          :class="request.is_pinned
            ? 'border-primary text-primary hover:bg-teal-light'
            : 'border-grey text-mid hover:border-primary hover:text-primary'"
          @click="$emit('toggle-pinned', !request.is_pinned)"
        >
          {{ request.is_pinned ? 'Unpin' : 'Pin to top' }}
        </button>
        <button
          class="rounded-sm border px-3 py-1.5 text-b5 font-semibold"
          :class="request.is_public
            ? 'border-warning text-warning hover:bg-warning-lighter'
            : 'border-green text-green hover:bg-green-light'"
          @click="$emit('toggle-hidden', request.is_public)"
        >
          {{ visibilityAction }}
        </button>
        <button
          class="rounded-sm border border-danger-lighter px-3 py-1.5 text-b5 font-semibold text-error hover:bg-danger-lighter"
          @click="$emit('delete')"
        >
          Delete
        </button>
      </footer>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CloseIcon } from '@/components/icons';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import StatusChip from './StatusChip.vue';
import VoteCount from './VoteCount.vue';
import { formatDate } from '@/utils/date';
import {
  FEATURE_REQUEST_STATUSES,
  type FeatureRequest,
  type FeatureRequestComment,
  type FeatureRequestStatus,
} from '@/services/featureRequestService';

const props = defineProps<{
  open: boolean;
  request: FeatureRequest | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'change-status', status: FeatureRequestStatus): void;
  (e: 'save-note', note: string): void;
  (e: 'save-response', note: string): void;
  (e: 'toggle-hidden', hidden: boolean): void;
  (e: 'toggle-pinned', pinned: boolean): void;
  (e: 'reply', body: string): void;
  (e: 'toggle-comment', comment: FeatureRequestComment): void;
  (e: 'delete-comment', comment: FeatureRequestComment): void;
  (e: 'delete'): void;
}>();

const adminNote = ref('');
const statusNote = ref('');
const reply = ref('');

const postReply = () => {
  emit('reply', reply.value.trim());
  reply.value = '';
};

watch(
  () => props.request?.id,
  () => {
    adminNote.value = props.request?.admin_note ?? '';
    statusNote.value = props.request?.status_note ?? '';
    reply.value = '';
  },
  { immediate: true }
);

/**
 * A request can be off the board for two different reasons, and the fix
 * differs: one was explicitly hidden, the other is still awaiting review.
 */
const visibilityAction = computed(() => {
  if (!props.request) return '';
  if (props.request.is_hidden) return 'Show on board';

  return props.request.is_public ? 'Hide from board' : 'Publish to board';
});

const otherStatuses = computed(() =>
  FEATURE_REQUEST_STATUSES.filter((status) => status.value !== props.request?.status)
);

</script>
