<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-dark/40 p-4" @click.self="close">
    <div class="w-full max-w-lg rounded-lg bg-white shadow-xl">
      <div class="flex items-start justify-between border-b border-lighter px-5 py-4">
        <div>
          <h2 class="text-h4 font-semibold text-dark">Move to {{ targetLabel }}</h2>
          <p class="mt-0.5 text-b5 text-mid line-clamp-1">{{ request?.title }}</p>
        </div>
        <button class="text-light hover:text-dark" aria-label="Close" @click="close">
          <CloseIcon class="h-5 w-5" />
        </button>
      </div>

      <div class="space-y-4 px-5 py-4">
        <div>
          <label for="status-note" class="mb-1.5 block text-b6 font-semibold tracking-wide text-light uppercase">
            Public response
          </label>
          <textarea
            id="status-note"
            v-model="note"
            rows="3"
            maxlength="2000"
            class="w-full rounded-sm border border-grey px-3 py-2 text-b4 focus:border-primary focus:outline-none"
            :placeholder="notePlaceholder"
          ></textarea>
          <p class="mt-1 text-b6 text-light">Shown to merchants on the board. Leave blank to keep the current note.</p>
        </div>

        <label class="flex items-start gap-2.5">
          <input v-model="notify" type="checkbox" class="mt-1.5 h-4 w-4 accent-primary" />
          <span class="text-b4 text-mid">
            Email the stores that asked for this
            <span class="block text-b6 text-light">
              {{ notifyHint }}
            </span>
          </span>
        </label>
      </div>

      <div class="flex justify-end gap-2 border-t border-lighter px-5 py-3">
        <button class="rounded-sm border border-grey px-4 py-2 text-b4 font-semibold text-mid hover:bg-lighter" @click="close">
          Cancel
        </button>
        <button
          class="flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-b4 font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          :disabled="saving"
          @click="submit"
        >
          <LoadingIcon v-if="saving" class="h-4 w-4 animate-spin" />
          Move to {{ targetLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CloseIcon, LoadingIcon } from '@/components/icons';
import {
  FEATURE_REQUEST_STATUSES,
  type FeatureRequest,
  type FeatureRequestStatus,
} from '@/services/featureRequestService';

const props = defineProps<{
  open: boolean;
  request: FeatureRequest | null;
  targetStatus: FeatureRequestStatus | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', payload: { status: FeatureRequestStatus; note: string | null; notify: boolean }): void;
}>();

const note = ref('');
const notify = ref(true);

// Reset the form each time the modal is opened for a different card.
watch(
  () => [props.open, props.request?.id, props.targetStatus],
  () => {
    if (props.open) {
      note.value = props.request?.status_note ?? '';
      notify.value = true;
    }
  }
);

const targetLabel = computed(
  () => FEATURE_REQUEST_STATUSES.find((s) => s.value === props.targetStatus)?.label ?? ''
);

const notePlaceholder = computed(() => {
  switch (props.targetStatus) {
    case 'in_progress':
      return 'e.g. In development now — targeting the 3.4 release.';
    case 'completed':
      return 'e.g. Shipped in 3.4.';
    case 'rejected':
      return 'Explain why, so merchants know it was considered.';
    default:
      return 'Optional note shown on the card.';
  }
});

/**
 * Mirrors FeatureRequestStatus::notifiesVoters() on the backend.
 */
const notifyHint = computed(() =>
  props.targetStatus === 'in_progress' || props.targetStatus === 'completed'
    ? 'Everyone who voted gets an email.'
    : 'Only the store that submitted it gets an email.'
);

const close = () => emit('close');

const submit = () => {
  if (!props.targetStatus) return;

  emit('confirm', {
    status: props.targetStatus,
    note: note.value.trim() || null,
    notify: notify.value,
  });
};
</script>
