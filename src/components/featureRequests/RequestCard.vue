<template>
  <article
    class="cursor-pointer rounded-lg border bg-card p-3 shadow-xs transition hover:border-foreground/15 hover:shadow-md"
    :class="{ 'opacity-50': dragging }"
    draggable="true"
    @dragstart="$emit('dragstart')"
    @dragend="$emit('dragend')"
    @click="$emit('open')"
  >
    <div class="flex gap-3">
      <div class="min-w-0 flex-1">
        <span v-if="request.is_pinned" class="mb-1 block text-sm font-semibold text-primary">Pinned</span>
        <h4 class="text-sm leading-snug font-semibold text-foreground">{{ request.title }}</h4>
        <p v-if="request.description" class="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
          {{ request.description }}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{{ request.installation?.store_name || request.submitter_name || 'Unknown store' }}</span>
          <span v-if="showApp && request.app">· {{ request.app.app_name }}</span>
          <StatusBadge v-if="request.is_hidden" tone="warning">Hidden</StatusBadge>
          <StatusBadge v-else-if="!request.is_public" tone="info">Not on board</StatusBadge>
        </div>
      </div>
      <VoteCount :count="request.votes_count" compact />
    </div>
  </article>
</template>

<script setup lang="ts">
import StatusBadge from '@/components/common/StatusBadge.vue';
import VoteCount from './VoteCount.vue';
import type { FeatureRequest } from '@/services/featureRequestService';

defineProps<{
  request: FeatureRequest;
  dragging?: boolean;
  showApp?: boolean;
}>();

defineEmits<{
  (e: 'open'): void;
  (e: 'dragstart'): void;
  (e: 'dragend'): void;
}>();
</script>
