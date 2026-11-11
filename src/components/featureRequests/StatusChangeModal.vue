<template>
  <Dialog :open="open" @update:open="(value) => { if (!value) close(); }">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Move to {{ targetLabel }}</DialogTitle>
        <DialogDescription class="line-clamp-1">{{ request?.title }}</DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field>
          <FieldLabel for="status-note">Public response</FieldLabel>
          <Textarea
            id="status-note"
            v-model="note"
            rows="3"
            maxlength="2000"
            :placeholder="notePlaceholder"
          />
          <FieldDescription>Shown to merchants on the board. Leave blank to keep the current note.</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Checkbox id="status-notify" v-model="notify" />
          <FieldContent>
            <FieldLabel for="status-notify">Email the stores that asked for this</FieldLabel>
            <FieldDescription>{{ notifyHint }}</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button variant="outline" @click="close">
          Cancel
        </Button>
        <Button
          :disabled="saving"
          @click="submit"
        >
          <Spinner v-if="saving" />
          Move to {{ targetLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
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
