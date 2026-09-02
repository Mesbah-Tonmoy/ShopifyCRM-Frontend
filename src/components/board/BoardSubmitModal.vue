<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BoardBanner from './BoardBanner.vue';
import { boardService, type BoardRequest } from '@/services/boardService';
import { useBoardContext } from '@/composables/useBoardContext';
import { useVisibleViewport } from '@/composables/useVisibleViewport';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{ (e: 'close'): void }>();

const board = useBoardContext();

const isOpen = computed(() => props.open);
const { top: visibleTop, height: visibleHeight } = useVisibleViewport(isOpen);

/**
 * Pinned to the band the merchant can actually see, for the same reason as the
 * detail modal: inside a grown iframe `fixed` and `vh` describe the iframe.
 */
const overlayStyle = computed(() => ({
  background: 'rgba(20, 22, 29, 0.5)',
  ...(visibleHeight.value !== null
    ? { top: `${visibleTop.value}px`, height: '100%', alignItems: 'flex-start', bottom: 'auto' }
    : {}),
}));

// The panel's surface and shadow come from `.board-modal`; only its ceiling
// depends on the measured band.
const panelStyle = computed(() => ({
  maxHeight: visibleHeight.value !== null ? `${Math.max(240, visibleHeight.value - 40)}px` : '94vh',
}));

const MIN_TITLE_LENGTH = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

const title = ref('');
const description = ref('');
const image = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const imageError = ref<string | null>(null);
const submitting = ref(false);
const duplicates = ref<BoardRequest[]>([]);
const voting = ref<number | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

const errors = ref<{ title?: string; description?: string }>({});
const attempted = ref(false);

const canVote = computed(() => board.config.value?.board.allow_voting && board.canWrite.value);

const clearImage = () => {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value);

  image.value = null;
  imagePreview.value = null;
  imageError.value = null;
};

const reset = () => {
  title.value = '';
  description.value = '';
  duplicates.value = [];
  errors.value = {};
  attempted.value = false;
  clearImage();
};

// A closed form should not keep the last draft, or the object URL behind it.
watch(isOpen, (open) => {
  if (!open) reset();
});

/**
 * Both fields carry real weight: a title nobody recognises collects no votes,
 * and a request with no reasoning behind it cannot be judged against others.
 */
const validate = (): boolean => {
  const next: { title?: string; description?: string } = {};
  const titleValue = title.value.trim();

  if (! titleValue) {
    next.title = 'Give your request a title.';
  } else if (titleValue.length < MIN_TITLE_LENGTH) {
    next.title = `Use at least ${MIN_TITLE_LENGTH} characters so other stores recognise it.`;
  }

  if (! description.value.trim()) {
    next.description = 'Describe the problem this would solve.';
  }

  errors.value = next;

  return Object.keys(next).length === 0;
};

// Once they have tried once, correct the message as they type rather than
// making them submit again to find out whether it is fixed.
watch([title, description], () => {
  if (attempted.value) validate();
});

/**
 * Loose match on the title being typed, so a merchant can back an existing
 * request instead of opening a duplicate.
 */
let duplicateTimer: ReturnType<typeof setTimeout> | undefined;
watch(title, () => {
  clearTimeout(duplicateTimer);

  if (title.value.trim().length < MIN_TITLE_LENGTH) {
    duplicates.value = [];
    return;
  }

  duplicateTimer = setTimeout(async () => {
    try {
      const response = await boardService.getRequests(board.slug.value, {
        search: title.value.trim(),
        match: 'any',
        per_page: 3,
      });
      duplicates.value = response.data;
    } catch {
      duplicates.value = [];
    }
  }, 400);
});

/**
 * Shared by the file picker and the drop target, so a dropped file is checked
 * exactly as a chosen one is.
 */
const acceptFile = (file: File | null | undefined) => {
  if (! file) return;

  imageError.value = null;

  // Checked here as well as on the server, so a mistake is caught before the
  // merchant waits for an upload to fail.
  if (! ALLOWED_IMAGE_TYPES.includes(file.type)) {
    imageError.value = 'Attach a JPEG, JPG or PNG file.';
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    imageError.value = 'Files must be under 5MB.';
    return;
  }

  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value);

  image.value = file;
  imagePreview.value = URL.createObjectURL(file);
};

const onImagePicked = (event: Event) => {
  const input = event.target as HTMLInputElement;

  acceptFile(input.files?.[0]);

  // Cleared so choosing the same file twice still fires a change.
  input.value = '';
};

const onDrop = (event: DragEvent) => {
  dragging.value = false;
  acceptFile(event.dataTransfer?.files?.[0]);
};

const submit = async () => {
  if (submitting.value) return;

  attempted.value = true;

  if (! validate()) return;

  submitting.value = true;

  try {
    const created = await boardService.submit(board.slug.value, {
      title: title.value.trim(),
      description: description.value.trim(),
      image: image.value,
    });

    // Announce it before closing, so whichever tab is behind the form can place
    // the new request without a round trip.
    board.lastCreated.value = created;
    board.notify('Request submitted');
    board.refreshCounts();
    emit('close');
  } catch (error) {
    board.handleError(error);
  } finally {
    submitting.value = false;
  }
};

/**
 * Backing an existing request is the better outcome when the merchant was about
 * to file the same thing, so the form gets out of the way once they do.
 */
const voteForDuplicate = async (duplicate: BoardRequest) => {
  if (! canVote.value) {
    board.notify('Open this board from your Shopify admin to vote.');
    return;
  }

  if (duplicate.has_voted || voting.value !== null) return;

  voting.value = duplicate.id;

  try {
    const updated = await boardService.vote(board.slug.value, duplicate.id);

    board.lastUpdated.value = updated;
    board.notify('Vote counted');
    board.refreshCounts();
    emit('close');
  } catch (error) {
    board.handleError(error);
  } finally {
    voting.value = null;
  }
};
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-x-0 top-0 bottom-0 z-40 flex items-center justify-center p-4 sm:p-6"
    :style="overlayStyle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bd-submit-heading"
    @click.self="emit('close')"
  >
    <div class="board-modal" :style="panelStyle">
      <div class="board-modal__header">
        <h2 id="bd-submit-heading" class="board-modal__title">
          {{ board.config.value?.board.title || 'Suggest a feature' }}
        </h2>

        <button type="button" class="board-modal__close" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" class="h-5 w-5">
            <path d="M15 5 5 15M5 5l10 10" />
          </svg>
        </button>
      </div>

      <div class="board-modal__body board-scroll">
        <p class="mb-4 text-[13px] leading-5" style="color: var(--bd-ink-mid)">
          {{
            board.config.value?.board.intro ||
            'Tell us what would make this app work better for your store.'
          }}
        </p>

        <div>
          <label for="bd-title" class="board-field">Title</label>
          <input
            id="bd-title"
            v-model="title"
            type="text"
            maxlength="180"
            placeholder="e.g. Sticky add-to-cart bar"
            class="board-input w-full"
            :class="{ 'board-input--error': errors.title }"
            :aria-invalid="Boolean(errors.title)"
            aria-describedby="bd-title-error"
          />
          <p v-if="errors.title" id="bd-title-error" class="board-error">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
            </svg>
            {{ errors.title }}
          </p>
        </div>

        <BoardBanner v-if="duplicates.length" title="Already asked for" class="mt-3">
          <!-- Inherits the banner's tone rather than re-colouring itself. -->
          <button
            v-for="duplicate in duplicates"
            :key="duplicate.id"
            type="button"
            class="mt-1 block text-left font-semibold underline underline-offset-2 disabled:opacity-60"
            :disabled="voting !== null"
            @click="voteForDuplicate(duplicate)"
          >
            {{ duplicate.title }}
            <span class="font-normal opacity-80">
              — {{ duplicate.has_voted ? 'you voted' : 'vote for it' }}
            </span>
          </button>
        </BoardBanner>

        <div class="mt-4">
          <label for="bd-desc" class="board-field">What problem does it solve?</label>
          <textarea
            id="bd-desc"
            v-model="description"
            rows="4"
            maxlength="2000"
            placeholder="Describe how you'd use it and what it would change for your customers."
            class="board-input w-full resize-y"
            :class="{ 'board-input--error': errors.description }"
            :aria-invalid="Boolean(errors.description)"
            aria-describedby="bd-desc-error"
          ></textarea>

          <div class="mt-1 flex items-start justify-between gap-3">
            <p v-if="errors.description" id="bd-desc-error" class="board-error !mt-0">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
              </svg>
              {{ errors.description }}
            </p>
            <span class="ml-auto shrink-0 text-[12px] tabular-nums" style="color: var(--bd-ink-soft)">
              {{ description.length }} / 2000
            </span>
          </div>
        </div>

        <div class="mt-4">
          <span class="board-field">Attach file <span style="color: var(--bd-ink-soft)">(optional)</span></span>

          <div v-if="imagePreview" class="relative">
            <img
              :src="imagePreview"
              alt="Selected screenshot"
              class="max-h-40 w-full rounded-lg object-contain"
              style="border: 1px solid var(--bd-border); background: var(--bd-sunken)"
            />
            <button
              type="button"
              class="board-btn board-btn--secondary absolute top-2 right-2"
              @click="clearImage"
            >
              Remove
            </button>
          </div>

          <!--
            A drop target as well as a picker: a dashed box that only opened a
            file dialog would be promising something it does not do.
          -->
          <div
            v-else
            class="board-dropzone"
            :class="{ 'is-dragging': dragging, 'board-dropzone--error': imageError }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <div class="flex flex-col items-center gap-2">
              <button type="button" class="board-btn board-btn--secondary" @click="fileInput?.click()">
                Add file
              </button>
              <p class="board-dropzone__hint">Accepts .jpg, .jpeg and .png, up to 5MB</p>
            </div>

            <input
              id="bd-image"
              ref="fileInput"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              class="sr-only"
              @change="onImagePicked"
            />
          </div>

          <p v-if="imageError" class="board-error">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
            </svg>
            {{ imageError }}
          </p>
        </div>
      </div>

      <div class="board-modal__footer">
        <button type="button" class="board-btn board-btn--secondary" @click="emit('close')">
          Cancel
        </button>
        <!--
          Left enabled while the form is incomplete: pressing it is how the
          merchant finds out what is missing, which a dead button cannot say.
        -->
        <button
          type="button"
          class="board-btn board-btn--primary"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? 'Submitting…' : 'Submit request' }}
        </button>
      </div>
    </div>
  </div>
</template>
