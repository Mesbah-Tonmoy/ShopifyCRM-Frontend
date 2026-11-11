<template>
  <Sheet :open="open" @update:open="(value) => { if (!value) $emit('close'); }">
    <SheetContent side="right" class="gap-0 data-[side=right]:w-full data-[side=right]:sm:w-[45rem] data-[side=right]:sm:max-w-none">
      <!-- header -->
      <SheetHeader class="border-b px-5 py-4 pr-14">
        <div class="flex flex-wrap items-center gap-2">
          <StatusChip v-if="request" :status="request.status" :label="request.status_label" />
          <Badge v-if="request?.is_pinned" variant="outline">Pinned</Badge>
          <StatusBadge v-if="request?.is_hidden" tone="warning">Hidden by you</StatusBadge>
          <StatusBadge v-else-if="request && !request.is_public" tone="info">Not on board yet</StatusBadge>
          <StatusBadge v-else-if="request" tone="success">Live on board</StatusBadge>
        </div>
        <SheetTitle class="font-heading text-base font-semibold">{{ request?.title }}</SheetTitle>
        <SheetDescription class="text-[13px]">
          {{ request?.app?.app_name }} · opened {{ formatDate(request?.created_at, '—') }}
        </SheetDescription>
      </SheetHeader>

      <div v-if="loading" class="space-y-3 p-5">
        <SkeletonLoader height="1rem" v-for="n in 6" :key="n" />
      </div>

      <div v-else-if="request" class="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
        <!-- vote summary -->
        <div class="mb-5 flex items-center gap-4 rounded-lg border bg-muted/50 px-4 py-3">
          <VoteCount :count="request.votes_count" />
          <div class="text-[13px] text-muted-foreground">
            <span class="font-semibold text-foreground">{{ request.votes_count }}</span>
            {{ request.votes_count === 1 ? 'store wants' : 'stores want' }} this
            <span v-if="request.recent_votes_count" class="block text-xs">
              {{ request.recent_votes_count }} in the last 30 days
            </span>
          </div>
        </div>

        <!-- description -->
        <section class="mb-5">
          <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Request</h3>
          <p class="text-sm whitespace-pre-line text-foreground">
            {{ request.description || 'No description provided.' }}
          </p>
          <img v-if="request.image_url" :src="request.image_url" alt="" class="mt-3 max-h-64 rounded-lg border" />
        </section>

        <!-- submitter -->
        <section class="mb-5">
          <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Submitted by</h3>
          <div class="rounded-lg border px-4 py-3">
            <p class="text-sm font-semibold text-foreground">
              {{ request.installation?.store_name || request.submitter_name || 'Unknown store' }}
            </p>
            <p class="text-[13px] text-muted-foreground">{{ request.submitter_shop_domain || '—' }}</p>
            <div v-if="request.installation" class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span v-if="request.installation.shopify_plan">Shopify: {{ request.installation.shopify_plan }}</span>
              <span v-if="request.installation.email">{{ request.installation.email }}</span>
              <StatusBadge :tone="request.installation.is_active ? 'success' : 'danger'">
                {{ request.installation.is_active ? 'Installed' : 'Uninstalled' }}
              </StatusBadge>
            </div>
            <p v-else class="mt-1 text-xs text-muted-foreground">No matching installation record.</p>
          </div>
        </section>

        <!-- public response -->
        <section class="mb-5">
          <Field>
            <FieldLabel for="request-status-note" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Public response
            </FieldLabel>
            <FieldDescription class="text-xs">
              Your reply to the merchants who asked for this. It appears on the request card on the public
              board — use it to say what you decided and why.
            </FieldDescription>
            <Textarea
              id="request-status-note"
              v-model="statusNote"
              rows="3"
              maxlength="2000"
              placeholder="e.g. Shipping in the next release, or why you decided against it."
            />
          </Field>
          <Button
            v-if="statusNote !== (request.status_note ?? '')"
            size="sm"
            class="mt-2"
            @click="$emit('save-response', statusNote)"
          >
            Save response
          </Button>
        </section>

        <!-- internal note -->
        <section class="mb-5">
          <Field>
            <FieldLabel for="request-admin-note" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Internal note
            </FieldLabel>
            <Textarea
              id="request-admin-note"
              v-model="adminNote"
              rows="2"
              maxlength="2000"
              placeholder="Only your team sees this."
            />
          </Field>
          <Button
            v-if="adminNote !== (request.admin_note ?? '')"
            size="sm"
            class="mt-2"
            @click="$emit('save-note', adminNote)"
          >
            Save note
          </Button>
        </section>

        <!-- voters -->
        <section class="mb-5">
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Stores backing this ({{ request.voters?.length ?? 0 }})
          </h3>
          <div v-if="request.voters?.length" class="overflow-hidden rounded-lg border">
            <Table class="text-[13px]">
              <TableHeader class="bg-muted/50">
                <TableRow>
                  <TableHead class="h-9">Store</TableHead>
                  <TableHead class="h-9">Shopify plan</TableHead>
                  <TableHead class="h-9">Voted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="voter in request.voters" :key="voter.id">
                  <TableCell class="py-2">
                    <span class="block text-foreground">{{ voter.store_name || '—' }}</span>
                    <span class="block text-xs text-muted-foreground">{{ voter.voter_key }}</span>
                  </TableCell>
                  <TableCell class="py-2 text-muted-foreground">{{ voter.shopify_plan || '—' }}</TableCell>
                  <TableCell class="py-2 text-muted-foreground">{{ formatDate(voter.voted_at, '—') }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p v-else class="text-[13px] text-muted-foreground">No votes yet.</p>
        </section>

        <!-- discussion -->
        <section class="mb-5">
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Discussion ({{ request.comments?.length ?? 0 }})
          </h3>

          <ul v-if="request.comments?.length" class="mb-3 space-y-3">
            <li
              v-for="comment in request.comments"
              :key="comment.id"
              class="rounded-lg border px-3 py-2.5"
              :class="{ 'opacity-60': comment.is_hidden }"
            >
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-semibold text-foreground">{{ comment.author_name || comment.author_shop_domain || 'A store' }}</span>
                <Badge v-if="comment.is_official">Team</Badge>
                <StatusBadge v-if="comment.is_hidden" tone="warning">Hidden</StatusBadge>
                <span class="text-muted-foreground">{{ formatDate(comment.created_at, '—') }}</span>
                <span class="ml-auto flex gap-2">
                  <Button variant="link" size="xs" class="h-auto p-0" @click="$emit('toggle-comment', comment)">
                    {{ comment.is_hidden ? 'Restore' : 'Hide' }}
                  </Button>
                  <Button variant="link" size="xs" class="h-auto p-0 text-destructive" @click="$emit('delete-comment', comment)">
                    Delete
                  </Button>
                </span>
              </div>
              <p class="mt-1 text-sm whitespace-pre-line text-foreground">{{ comment.body }}</p>
            </li>
          </ul>

          <p v-else class="mb-3 text-[13px] text-muted-foreground">No comments yet.</p>

          <Field>
            <FieldLabel for="request-reply" class="sr-only">Reply</FieldLabel>
            <Textarea
              id="request-reply"
              v-model="reply"
              rows="2"
              maxlength="2000"
              placeholder="Reply as the team — merchants see this badged as official."
            />
          </Field>
          <Button
            v-if="reply.trim().length > 1"
            size="sm"
            class="mt-2"
            @click="postReply"
          >
            Post reply
          </Button>
        </section>

        <!-- history -->
        <section>
          <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
          <ol class="space-y-2">
            <li v-for="log in request.status_logs" :key="log.id" class="flex gap-3 text-[13px]">
              <span class="mt-1.5 size-1.5 shrink-0 rounded-full" :class="toneDotClasses.neutral"></span>
              <div>
                <span class="text-foreground">
                  <template v-if="log.from_status">Moved to {{ log.to_status_label }}</template>
                  <template v-else>Submitted</template>
                </span>
                <span class="text-muted-foreground"> · {{ formatDate(log.created_at, '—') }}</span>
                <span v-if="log.user" class="text-muted-foreground"> · {{ log.user }}</span>
                <span v-if="log.notified_at" class="text-muted-foreground"> · voters emailed</span>
                <p v-if="log.note" class="text-muted-foreground">{{ log.note }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <!-- actions -->
      <SheetFooter v-if="request" class="flex-row flex-wrap items-center border-t px-5 py-3">
        <Button
          v-for="status in otherStatuses"
          :key="status.value"
          variant="outline"
          size="sm"
          @click="$emit('change-status', status.value)"
        >
          {{ status.label }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="$emit('toggle-pinned', !request.is_pinned)"
        >
          {{ request.is_pinned ? 'Unpin' : 'Pin to top' }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="$emit('toggle-hidden', request.is_public)"
        >
          {{ visibilityAction }}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          @click="$emit('delete')"
        >
          Delete
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { toneDotClasses } from '@/lib/tones';
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
