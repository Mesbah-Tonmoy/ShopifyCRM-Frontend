<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  integrationService,
  type GoogleChatSpace,
  type GoogleChatSpaceInput,
  type GoogleChatOptions,
} from '@/services/integrationService';
import type { ApiError } from '@/config/api';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { toggleInList } from '@/lib/list';

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
    toast.success(successTitle);
  }
};

const save = async () => {
  if (missing.value.length) {
    toast.warning('Missing settings', { description: `Add ${missing.value.join(', ')} first.` });
    return;
  }
  try {
    busy.value = 'save';
    await persist(isNew.value ? 'Google Chat space added' : 'Google Chat space saved');
  } catch (err) {
    toast.error('Error', { description: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};

const toggleEnabled = async (checked: boolean) => {
  form.value.is_enabled = checked;

  // An unsaved space is only switched in the form; Save stores it.
  if (isNew.value) return;

  if (missing.value.length) {
    form.value.is_enabled = !checked;
    toast.warning('Missing settings', { description: `Add ${missing.value.join(', ')} before enabling this space.` });
    return;
  }

  try {
    busy.value = 'toggle';
    await persist(`${form.value.name} ${form.value.is_enabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    form.value.is_enabled = !form.value.is_enabled;
    toast.error('Error', { description: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};

const sendTest = async () => {
  try {
    busy.value = 'test';
    const response = await integrationService.testGoogleChat(form.value.webhook_url.trim());
    toast.success(response.message || 'Test message sent');
  } catch (err) {
    toast.error('Test failed', { description: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};

const remove = async () => {
  if (!props.space) {
    emit('removed');
    return;
  }

  const { confirmed } = await confirmDialog({
    title: `Remove "${props.space.name}"?`,
    description: 'This space will stop receiving notifications. The Google Chat space itself is not affected.',
    confirmText: 'Remove',
    destructive: true,
  });
  if (!confirmed) return;

  try {
    busy.value = 'delete';
    await integrationService.deleteGoogleChatSpace(props.space.id);
    emit('removed');
    toast.success('Google Chat space removed');
  } catch (err) {
    toast.error('Error', { description: errorText(err as ApiError) });
  } finally {
    busy.value = null;
  }
};
</script>

<template>
  <Card size="sm" :class="{ 'border border-dashed ring-0': isNew }">
    <CardHeader>
      <div class="min-w-0">
        <CardTitle class="text-sm font-semibold truncate">{{ form.name.trim() || 'New space' }}</CardTitle>
        <CardDescription class="text-xs mt-0.5 truncate">{{ appSummary }}</CardDescription>
      </div>

      <CardAction>
        <Switch
          :model-value="form.is_enabled"
          @update:model-value="toggleEnabled"
          :disabled="!canEdit || busy !== null"
          :aria-label="`Enable ${form.name || 'space'}`"
        />
      </CardAction>
    </CardHeader>

    <CardContent>
      <FieldGroup class="gap-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field class="gap-1.5">
            <FieldLabel :for="`${uid}-name`">
              Name<span class="text-destructive"> *</span>
            </FieldLabel>
            <Input
              :id="`${uid}-name`"
              type="text"
              v-model="form.name"
              maxlength="100"
              placeholder="e.g. FormCRM installs"
              :disabled="!canEdit"
            />
          </Field>
          <Field class="gap-1.5 sm:col-span-2">
            <FieldLabel :for="`${uid}-webhook`">
              Space Webhook URL<span class="text-destructive"> *</span>
            </FieldLabel>
            <Input
              :id="`${uid}-webhook`"
              type="text"
              v-model="form.webhook_url"
              placeholder="https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."
              :disabled="!canEdit"
            />
          </Field>
        </div>

        <FieldSet class="gap-2">
          <FieldLegend variant="label">
            Notify on<span class="text-destructive"> *</span>
          </FieldLegend>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field
              v-for="event in options.events"
              :key="event.key"
              orientation="horizontal"
              class="gap-2"
            >
              <Checkbox
                :id="`${uid}-event-${event.key}`"
                :model-value="form.events.includes(event.key)"
                @update:model-value="(v) => (form.events = toggleInList(form.events, event.key, v))"
                :disabled="!canEdit"
              />
              <FieldLabel :for="`${uid}-event-${event.key}`" class="font-normal">{{ event.label }}</FieldLabel>
            </Field>
          </div>
        </FieldSet>

        <FieldSet class="gap-2">
          <FieldLegend variant="label">Apps</FieldLegend>
          <RadioGroup
            :model-value="form.app_scope"
            @update:model-value="(v) => (form.app_scope = v === 'all' ? 'all' : 'selected')"
            :disabled="!canEdit"
            class="flex w-auto gap-5"
          >
            <Field orientation="horizontal" class="w-auto gap-2">
              <RadioGroupItem :id="`${uid}-scope-selected`" value="selected" />
              <FieldLabel :for="`${uid}-scope-selected`" class="font-normal">Specific apps</FieldLabel>
            </Field>
            <Field orientation="horizontal" class="w-auto gap-2">
              <RadioGroupItem :id="`${uid}-scope-all`" value="all" />
              <FieldLabel :for="`${uid}-scope-all`" class="font-normal">All apps</FieldLabel>
            </Field>
          </RadioGroup>

          <div
            v-if="form.app_scope === 'selected'"
            class="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-lg p-3 max-h-60 overflow-y-auto"
          >
            <Field
              v-for="app in options.apps"
              :key="app.id"
              orientation="horizontal"
              class="gap-2"
            >
              <Checkbox
                :id="`${uid}-app-${app.id}`"
                :model-value="form.app_ids.includes(app.id)"
                @update:model-value="(v) => (form.app_ids = toggleInList(form.app_ids, app.id, v))"
                :disabled="!canEdit"
              />
              <FieldLabel :for="`${uid}-app-${app.id}`" class="font-normal">{{ app.app_name }}</FieldLabel>
            </Field>
            <p v-if="!options.apps.length" class="text-sm text-muted-foreground italic">No apps connected yet</p>
          </div>
        </FieldSet>
      </FieldGroup>
    </CardContent>

    <CardFooter class="flex-wrap justify-end gap-2" v-if="canEdit">
      <Button
        variant="destructive"
        @click="remove"
        :disabled="busy !== null"
        class="mr-auto"
      >
        <Spinner v-if="busy === 'delete'" />
        {{ isNew ? 'Cancel' : 'Remove' }}
      </Button>
      <Button
        variant="outline"
        @click="sendTest"
        :disabled="busy !== null || !form.webhook_url.trim()"
      >
        <Spinner v-if="busy === 'test'" />
        {{ busy === 'test' ? 'Sending...' : 'Send test message' }}
      </Button>
      <Button
        @click="save"
        :disabled="busy !== null"
      >
        <Spinner v-if="busy === 'save'" />
        {{ busy === 'save' ? 'Saving...' : isNew ? 'Add space' : 'Save' }}
      </Button>
    </CardFooter>
  </Card>
</template>
