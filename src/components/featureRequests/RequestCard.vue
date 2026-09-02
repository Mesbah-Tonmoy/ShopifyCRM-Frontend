<template>
  <article
    class="cursor-pointer rounded-md border border-lighter bg-white p-3 shadow-sm transition hover:border-grey hover:shadow-md"
    :class="{ 'opacity-50': dragging }"
    draggable="true"
    @dragstart="$emit('dragstart')"
    @dragend="$emit('dragend')"
    @click="$emit('open')"
  >
    <div class="flex gap-3">
      <div class="min-w-0 flex-1">
        <span v-if="request.is_pinned" class="mb-1 block text-sm font-semibold text-primary">Pinned</span>
        <h4 class="text-b4 leading-snug font-semibold text-dark">{{ request.title }}</h4>
        <p v-if="request.description" class="mt-1 line-clamp-2 text-b5 text-mid">
          {{ request.description }}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-light">
          <span>{{ request.installation?.store_name || request.submitter_name || 'Unknown store' }}</span>
          <span v-if="showApp && request.app">· {{ request.app.app_name }}</span>
          <span v-if="request.is_hidden" class="font-semibold text-warning">· Hidden</span>
          <span v-else-if="!request.is_public" class="font-semibold text-info">· Not on board</span>
        </div>
      </div>
      <VoteCount :count="request.votes_count" compact />
    </div>
  </article>
</template>

<script setup lang="ts">
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
