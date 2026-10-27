<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Swal from 'sweetalert2';
import {
  integrationService,
  type GoogleChatSpace,
  type GoogleChatSpaceInput,
  type GoogleChatOptions,
} from '@/services/integrationService';
import type { ApiError } from '@/config/api';
import { Toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';

/**
 * One Google Chat space: its webhook, the events it hears about and the apps
 * they come from. `space` is null for a space that has not been saved yet.
 */

const props = defineProps<{
  space: GoogleChatSpace | null;
  options: GoogleChatOptions;
  canEdit: boolean;
}>();
const emit = defineEmits<{ saved: [space: GoogleChatSpace]; removed: [] }>();

const form = ref<GoogleChatSpaceInput>(blankForm());
const busy = ref<'save' | 'test' | 'toggle' | 'delete' | null>(null);
const uid = `gchat-${Math.random().toString(36).slice(2, 8)}`;

function blankForm(): GoogleChatSpaceInput {
  return { name: '', webhook_url: '', events: [], app_scope: 'selected', app_ids: [], is_enabled: true };
}

watch(
  () => props.space,
  (space) => {
    form.value = space
      ? {
          name: space.name,
          webhook_url: space.webhook_url,
          events: [...space.events],
          app_scope: space.app_scope,
          app_ids: [...space.app_ids],
          is_enabled: space.is_enabled,
        }
      : blankForm();
  },
  { immediate: true },
);

const isNew = computed(() => props.space === null);

const appSummary = computed(() => {
  if (form.value.app_scope === 'all') return 'All apps';
  const names = props.options.apps.filter((a) => form.value.app_ids.includes(a.id)).map((a) => a.app_name);
  return names.length ? names.join(', ') : 'No apps selected';
});

/** Mirrors GoogleChatSpaceController::validated, so a save fails early with a clear reason. */
const missing = computed(() => {
  const list: string[] = [];
  if (!form.value.name.trim()) list.push('a name');
  if (!form.value.webhook_url.trim()) list.push('a webhook URL');
  if (form.value.is_enabled && !form.value.events.length) list.push('at least one event');
  if (form.value.is_enabled && form.value.app_scope === 'selected' && !form.value.app_ids.length) {
    list.push('at least one app');
  }
  return list;
});

const errorText = (err: ApiError) => {
  const fieldErrors = Object.values(err.errors ?? {}).flat();
  return fieldErrors.length ? fieldErrors.join('\n') : err.message || 'Something went wrong';
};

const persist = async (successTitle: string) => {
  const payload = { ...form.value, name: form.value.name.trim(), webhook_url: form.value.webhook_url.trim() };
  const response = props.space
    ? await integrationService.updateGoogleChatSpace(props.space.id, payload)
    : await integrationService.createGoogleChatSpace(payload);
  if (response.success) {
    emit('saved', response.data);
    Toast.fire({ icon: 'success', title: successTitle });
  }
};

const save = async () => {
  if (missing.value.length) {
    Swal.fire({ icon: 'warning', title: 'Missing settings', text: `Add ${missing.value.join(', ')} first.` });
    return;
  }
  try {
    busy.value = 'save';
    await persist(isNew.value ? 'Google Chat space added' : 'Google Chat space saved');
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};

const toggleEnabled = async (event: Event) => {
  const checkbox = event.target as HTMLInputElement;
  form.value.is_enabled = checkbox.checked;

  // An unsaved space is only switched in the form; Save stores it.
  if (isNew.value) return;

  if (missing.value.length) {
    form.value.is_enabled = !checkbox.checked;
    checkbox.checked = form.value.is_enabled;
    Swal.fire({ icon: 'warning', title: 'Missing settings', text: `Add ${missing.value.join(', ')} before enabling this space.` });
    return;
  }

  try {
    busy.value = 'toggle';
    await persist(`${form.value.name} ${form.value.is_enabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    form.value.is_enabled = !form.value.is_enabled;
    checkbox.checked = form.value.is_enabled;
    Swal.fire({ icon: 'error', title: 'Error', text: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};

const sendTest = async () => {
  try {
    busy.value = 'test';
    const response = await integrationService.testGoogleChat(form.value.webhook_url.trim());
    Toast.fire({ icon: 'success', title: response.message || 'Test message sent' });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Test failed', text: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};

const remove = async () => {
  if (!props.space) {
    emit('removed');
    return;
  }

  const confirm = await Swal.fire({
    icon: 'warning',
    title: `Remove "${props.space.name}"?`,
    text: 'This space will stop receiving notifications. The Google Chat space itself is not affected.',
    showCancelButton: true,
    confirmButtonText: 'Remove',
    confirmButtonColor: '#dc2626',
  });
  if (!confirm.isConfirmed) return;

  try {
    busy.value = 'delete';
    await integrationService.deleteGoogleChatSpace(props.space.id);
    emit('removed');
    Toast.fire({ icon: 'success', title: 'Google Chat space removed' });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};
</script>

<template>
  <div class="border border-gray-200 rounded-lg p-4" :class="{ 'border-dashed': isNew }">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h4 class="text-sm font-semibold text-dark truncate">{{ form.name.trim() || 'New space' }}</h4>
        <p class="text-xs text-gray-500 mt-0.5 truncate">{{ appSummary }}</p>
      </div>

      <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input
          type="checkbox"
          class="sr-only peer"
          :checked="form.is_enabled"
          @change="toggleEnabled"
          :disabled="!canEdit || busy !== null"
          :aria-label="`Enable ${form.name || 'space'}`"
        />
        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-teal transition-colors"></div>
        <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
      </label>
    </div>

    <div class="space-y-4 mt-4">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label :for="`${uid}-name`" class="block text-sm font-medium text-gray-600 mb-1">
            Name<span class="text-red-500"> *</span>
          </label>
          <input
            :id="`${uid}-name`"
            type="text"
            v-model="form.name"
            maxlength="100"
            placeholder="e.g. FormCRM installs"
            :disabled="!canEdit"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-gray-50"
          />
        </div>
        <div class="sm:col-span-2">
          <label :for="`${uid}-webhook`" class="block text-sm font-medium text-gray-600 mb-1">
            Space Webhook URL<span class="text-red-500"> *</span>
          </label>
          <input
            :id="`${uid}-webhook`"
            type="text"
            v-model="form.webhook_url"
            placeholder="https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."
            :disabled="!canEdit"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-gray-50"
          />
        </div>
      </div>

      <fieldset>
        <legend class="block text-sm font-medium text-gray-600 mb-2">
          Notify on<span class="text-red-500"> *</span>
        </legend>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label
            v-for="event in options.events"
            :key="event.key"
            class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
          >
            <input type="checkbox" :value="event.key" v-model="form.events" :disabled="!canEdit" class="h-4 w-4 accent-teal" />
            {{ event.label }}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend class="block text-sm font-medium text-gray-600 mb-2">Apps</legend>
        <div class="flex gap-5 text-sm text-gray-700">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" value="selected" v-model="form.app_scope" :disabled="!canEdit" class="h-4 w-4 accent-teal" />
            Specific apps
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" value="all" v-model="form.app_scope" :disabled="!canEdit" class="h-4 w-4 accent-teal" />
            All apps
          </label>
        </div>

        <div
          v-if="form.app_scope === 'selected'"
          class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3 max-h-60 overflow-y-auto"
        >
          <label
            v-for="app in options.apps"
            :key="app.id"
            class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
          >
            <input type="checkbox" :value="app.id" v-model="form.app_ids" :disabled="!canEdit" class="h-4 w-4 accent-teal" />
            {{ app.app_name }}
          </label>
          <p v-if="!options.apps.length" class="text-sm text-gray-400 italic">No apps connected yet</p>
        </div>
      </fieldset>
    </div>

    <div class="mt-4 flex flex-wrap justify-end gap-2" v-if="canEdit">
      <button
        @click="remove"
        :disabled="busy !== null"
        class="mr-auto text-red-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <LoadingIcon v-if="busy === 'delete'" size="xs" />
        {{ isNew ? 'Cancel' : 'Remove' }}
      </button>
      <button
        @click="sendTest"
        :disabled="busy !== null || !form.webhook_url.trim()"
        class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <LoadingIcon v-if="busy === 'test'" size="xs" />
        {{ busy === 'test' ? 'Sending...' : 'Send test message' }}
      </button>
      <button
        @click="save"
        :disabled="busy !== null"
        class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <LoadingIcon v-if="busy === 'save'" size="xs" color-class="text-white" />
        {{ busy === 'save' ? 'Saving...' : isNew ? 'Add space' : 'Save' }}
      </button>
    </div>
  </div>
</template>
