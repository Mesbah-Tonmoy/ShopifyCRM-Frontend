<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  mailProviderService,
  type MailProvider,
  type MailProviderField,
  type MailProvidersOverview,
  type ConnectionTestResult,
} from '@/services/mailProviderService';
import type { ApiError } from '@/config/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { toneDotClasses, type Tone } from '@/lib/tones';
import { Check } from '@lucide/vue';
import { LoadingIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppAlert from '@/components/common/AppAlert.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import MailProviderLogo from './MailProviderLogo.vue';
import SesTenantPanel from './SesTenantPanel.vue';

/**
 * Which service the CRM sends its own email through. One provider is active at
 * a time; picking one in the list only shows its settings, activating it is a
 * separate, explicit step. Edits are kept per provider while switching, so
 * looking at another provider never discards what was typed.
 */

type FormValues = Record<string, string | number>;

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('integrations.edit'));

const loading = ref(true);
const loadError = ref<string | null>(null);
const overview = ref<MailProvidersOverview | null>(null);
const selectedKey = ref<string | null>(null);
const forms = ref<Record<string, FormValues>>({});
const baselines = ref<Record<string, string>>({});
const errors = ref<Record<string, Record<string, string>>>({});
const testResults = ref<Record<string, ConnectionTestResult | null>>({});
const busy = ref<'save' | 'test' | 'activate' | 'deactivate' | null>(null);

const providers = computed(() => overview.value?.providers ?? []);
const selected = computed(() => providers.value.find((p) => p.key === selectedKey.value) ?? null);
const active = computed(() => providers.value.find((p) => p.is_active) ?? null);

const isDirty = (key: string) => JSON.stringify(forms.value[key]) !== baselines.value[key];
const selectedDirty = computed(() => (selected.value ? isDirty(selected.value.key) : false));

const conditionHolds = (provider: MailProvider, condition?: Record<string, string>) =>
  Object.entries(condition ?? {}).every(
    ([key, value]) => String(forms.value[provider.key]?.[key] ?? '') === value,
  );

/** Mirrors MailProvider::isRequired on the backend, against the unsaved form. */
const isRequired = (provider: MailProvider, field: MailProviderField) =>
  !!field.required && conditionHolds(provider, field.visible_when) && conditionHolds(provider, field.required_when);

const fieldsIn = (provider: MailProvider, group: MailProviderField['group']) =>
  provider.fields.filter((f) => f.group === group && conditionHolds(provider, f.visible_when));

const formFor = (provider: MailProvider): FormValues =>
  Object.fromEntries(
    provider.fields.map((f) => [f.key, f.secret ? '' : (provider.config[f.key] ?? f.default ?? '')]),
  );

/**
 * Take a fresh overview. Forms are rebuilt for `reset` providers and for any
 * without unsaved edits; the rest keep what the user typed.
 */
const applyOverview = (data: MailProvidersOverview, reset: string[] = []) => {
  overview.value = data;

  for (const provider of data.providers) {
    if (!forms.value[provider.key] || reset.includes(provider.key) || !isDirty(provider.key)) {
      forms.value[provider.key] = formFor(provider);
      baselines.value[provider.key] = JSON.stringify(forms.value[provider.key]);
    }
  }

  if (!selectedKey.value || !data.providers.some((p) => p.key === selectedKey.value)) {
    selectedKey.value = data.active ?? data.providers[0]?.key ?? null;
  }
};

const load = async (reset: string[] = []) => {
  try {
    const response = await mailProviderService.getAll();
    applyOverview(response.data, reset);
    loadError.value = null;
  } catch (caught) {
    const err = caught as ApiError;
    loadError.value = err.message || 'Failed to load email providers';
  } finally {
    loading.value = false;
  }
};

onMounted(() => load());

/** Blank secrets are left out, which keeps the stored value. */
const payloadFor = (provider: MailProvider) => {
  const form = forms.value[provider.key] ?? {};
  const payload: Record<string, string | number | null> = {};

  for (const field of provider.fields) {
    const value = form[field.key];
    const blank = value === '' || value === null || value === undefined;
    if (field.secret && blank) continue;
    payload[field.key] = blank ? '' : value;
  }

  return payload;
};

const handleError = (provider: MailProvider, err: ApiError, title: string) => {
  if (err.errors) {
    errors.value[provider.key] = Object.fromEntries(
      Object.entries(err.errors).map(([k, messages]) => [k.replace(/^config\./, ''), messages[0] ?? '']),
    );
  }
  toast.error(title, { description: err.message });
};

const save = async (provider: MailProvider, { quiet = false } = {}) => {
  errors.value[provider.key] = {};
  const response = await mailProviderService.save(provider.key, payloadFor(provider));
  applyOverview(response.data, [provider.key]);
  if (!quiet) toast.success(response.message || 'Saved');
};

const onSave = async () => {
  const provider = selected.value;
  if (!provider) return;
  try {
    busy.value = 'save';
    await save(provider);
  } catch (caught) {
    const err = caught as ApiError;
    handleError(provider, err, 'Could not save');
  } finally {
    busy.value = null;
  }
};

const onTest = async () => {
  const provider = selected.value;
  if (!provider) return;
  try {
    busy.value = 'test';
    testResults.value[provider.key] = null;
    const response = await mailProviderService.test(provider.key, payloadFor(provider));
    testResults.value[provider.key] = response.data;
  } catch (caught) {
    const err = caught as ApiError;
    handleError(provider, err, 'Could not run the test');
  } finally {
    busy.value = null;
  }
};

const onActivate = async () => {
  const provider = selected.value;
  if (!provider) return;

  const { confirmed } = await confirmDialog({
    title: `Send all CRM email through ${provider.name}?`,
    description: active.value
      ? `${active.value.name} will stop being used.`
      : 'The default mailer will stop being used.',
    confirmText: selectedDirty.value ? 'Save and activate' : 'Activate',
  });
  if (!confirmed) return;

  try {
    busy.value = 'activate';
    if (selectedDirty.value) await save(provider, { quiet: true });
    const response = await mailProviderService.activate(provider.key);
    applyOverview(response.data);
    toast.success(response.message || `${provider.name} is active`);
  } catch (caught) {
    const err = caught as ApiError;
    handleError(provider, err, `Could not activate ${provider.name}`);
  } finally {
    busy.value = null;
  }
};

const onDeactivate = async () => {
  if (!active.value) return;

  const { confirmed } = await confirmDialog({
    title: `Stop using ${active.value.name}?`,
    description: `CRM email will go through the default mailer (${overview.value?.fallback.mailer}) instead.`,
    confirmText: 'Stop using it',
    destructive: true,
  });
  if (!confirmed) return;

  try {
    busy.value = 'deactivate';
    const response = await mailProviderService.deactivate();
    applyOverview(response.data);
    toast.success('Using the default mailer');
  } catch (caught) {
    const err = caught as ApiError;
    toast.error('Could not deactivate', { description: err.message });
  } finally {
    busy.value = null;
  }
};

const statusBadge = (provider: MailProvider): { label: string; tone: Tone; class?: string } => {
  if (provider.is_active) return { label: 'Active', tone: 'success' };
  if (provider.is_configured) return { label: 'Configured', tone: 'neutral' };
  return { label: 'Not set up', tone: 'neutral', class: 'opacity-70' };
};

const onProviderPicked = (value: unknown) => {
  if (typeof value === 'string' && value) selectedKey.value = value;
};

const setFormValue = (providerKey: string, fieldKey: string, value: string | number) => {
  const form = forms.value[providerKey];
  if (form) form[fieldKey] = value;
};

const selectOptions = (field: MailProviderField) =>
  (field.options ?? []).map((option) => ({ value: option, label: field.option_labels?.[option] ?? option }));

const secretPlaceholder = (provider: MailProvider, field: MailProviderField) =>
  provider.secrets_set.includes(field.key) ? '•••••••• saved — leave blank to keep' : field.placeholder;

const labelFor = (provider: MailProvider, key: string) =>
  provider.fields.find((f) => f.key === key)?.label ?? key;
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="font-semibold">Email delivery</CardTitle>
      <CardDescription>
        Choose the service all CRM email goes through — install, uninstall and follow-up emails, and feature board
        notifications. Only one is active at a time.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="loading" class="flex justify-center py-8">
        <LoadingIcon size="md" />
      </div>

      <AppAlert v-else-if="loadError" tone="danger">
        {{ loadError }}
        <template #action>
          <Button type="button" variant="link" size="sm" class="h-auto p-0" @click="load()">Retry</Button>
        </template>
      </AppAlert>

      <template v-else-if="overview">
        <!-- What mail goes through right now -->
        <AppAlert :tone="active ? 'success' : 'warning'" class="mb-5">
          <p>
            <template v-if="active">
              Sending through <span class="font-semibold">{{ active.name }}</span>
              <span v-if="active.config.from_email"> · from {{ active.config.from_email }}</span>
              <span v-if="active.meta.tenant?.in_use"> · tenant <code>{{ active.meta.tenant.name }}</code></span>
            </template>
            <template v-else>
              No provider is active. Email goes through the default mailer
              (<code>{{ overview.fallback.mailer }}</code><span v-if="overview.fallback.host"> · {{ overview.fallback.host }}</span>)
              configured in the backend <code>.env</code>.
            </template>
          </p>
          <template v-if="active && canEdit" #action>
            <Button
              type="button"
              variant="link"
              size="sm"
              @click="onDeactivate"
              :disabled="busy !== null"
              class="h-auto p-0 text-muted-foreground hover:text-destructive"
            >
              Stop using {{ active.name }}
            </Button>
          </template>
        </AppAlert>

        <!-- Provider list -->
        <ToggleGroup
          type="single"
          :spacing="3"
          :model-value="selectedKey ?? undefined"
          @update:model-value="onProviderPicked"
          aria-label="Email providers"
          class="grid w-full grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <ToggleGroupItem
            v-for="provider in providers"
            :key="provider.key"
            :value="provider.key"
            class="h-auto w-full justify-start gap-3 rounded-lg border bg-muted/50 p-3 text-left hover:bg-muted/50 hover:border-foreground/20 data-[state=on]:border-primary data-[state=on]:bg-card data-[state=on]:ring-1 data-[state=on]:ring-primary"
          >
            <MailProviderLogo :provider-key="provider.key" :size="35" />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <span class="truncate">{{ provider.name }}</span>
                <span
                  v-if="isDirty(provider.key)"
                  class="size-1.5 shrink-0 rounded-full"
                  :class="toneDotClasses.warning"
                  title="Unsaved changes"
                />
              </span>
              <StatusBadge :tone="statusBadge(provider).tone" :class="['mt-1', statusBadge(provider).class]">
                {{ statusBadge(provider).label }}
              </StatusBadge>
            </span>
          </ToggleGroupItem>
        </ToggleGroup>

        <!-- Selected provider's settings -->
        <form v-if="selected" class="mt-6" @submit.prevent="onSave">
          <div class="flex items-center gap-3 mb-4">
            <MailProviderLogo :provider-key="selected.key" :size="32" />
            <div>
              <h4 class="font-heading text-base font-semibold text-foreground">{{ selected.name }}</h4>
              <p class="text-sm text-muted-foreground">{{ selected.description }}</p>
            </div>
          </div>

          <FieldSet
            v-for="group in (['connection', 'sender'] as const)"
            :key="group"
            class="mb-5 gap-2"
            :disabled="!canEdit"
          >
            <FieldLegend variant="label" class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {{ group === 'connection' ? 'Connection' : 'Sender' }}
            </FieldLegend>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                v-for="field in fieldsIn(selected, group)"
                :key="field.key"
                class="gap-1.5"
                :data-invalid="!!errors[selected.key]?.[field.key]"
              >
                <FieldLabel :for="`${selected.key}-${field.key}`">
                  {{ field.label }}<span v-if="isRequired(selected, field)" class="text-destructive"> *</span>
                </FieldLabel>

                <SelectInput
                  v-if="field.type === 'select'"
                  :id="`${selected.key}-${field.key}`"
                  :model-value="forms[selected.key]![field.key] ?? ''"
                  @update:model-value="(value) => setFormValue(selected!.key, field.key, value)"
                  :options="selectOptions(field)"
                  :invalid="!!errors[selected.key]?.[field.key]"
                  select-class="w-full"
                />

                <Input
                  v-else
                  :id="`${selected.key}-${field.key}`"
                  :type="field.type"
                  v-model="forms[selected.key]![field.key]"
                  :placeholder="field.secret ? secretPlaceholder(selected, field) : field.placeholder"
                  :autocomplete="field.secret ? 'new-password' : 'off'"
                  :aria-invalid="!!errors[selected.key]?.[field.key]"
                />

                <FieldError v-if="errors[selected.key]?.[field.key]" class="text-xs">
                  {{ errors[selected.key]![field.key] }}
                </FieldError>
                <FieldDescription v-else-if="field.help" class="text-xs">{{ field.help }}</FieldDescription>
              </Field>
            </div>
          </FieldSet>

          <!-- Connection test outcome -->
          <AppAlert
            v-if="testResults[selected.key]"
            class="mb-5"
            :tone="testResults[selected.key]!.ok ? 'success' : 'danger'"
            :title="testResults[selected.key]!.message"
          >
            <ul v-if="testResults[selected.key]!.warnings.length" class="mt-1.5 space-y-0.5 text-amber-700 dark:text-amber-300">
              <li v-for="warning in testResults[selected.key]!.warnings" :key="warning">⚠ {{ warning }}</li>
            </ul>
            <p v-if="testResults[selected.key]!.details.max_24_hour_send" class="mt-2 text-xs">
              Quota: {{ testResults[selected.key]!.details.sent_last_24_hours ?? 0 }} /
              {{ testResults[selected.key]!.details.max_24_hour_send }} in the last 24h ·
              {{ testResults[selected.key]!.details.max_send_rate }}/s
            </p>
          </AppAlert>

          <SesTenantPanel
            v-if="selected.meta.tenant"
            class="mb-5"
            :tenant="selected.meta.tenant"
            :can-edit="canEdit"
            :has-unsaved-changes="selectedDirty"
            @changed="load([])"
          />

          <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-2 pt-4 border-t">
            <p v-if="!selected.is_configured && !selectedDirty" class="text-xs text-muted-foreground mr-auto">
              Fill in {{ selected.missing.map((k: string) => labelFor(selected!, k)).join(', ') }} to activate.
            </p>
            <p v-else-if="selectedDirty" class="text-xs text-amber-700 dark:text-amber-300 mr-auto">Unsaved changes</p>

            <Button
              type="button"
              variant="outline"
              @click="onTest"
              :disabled="busy !== null"
              title="Checks the connection and credentials. No email is sent."
            >
              <Spinner v-if="busy === 'test'" />
              Test connection
            </Button>
            <Button
              type="submit"
              variant="outline"
              :disabled="busy !== null || !selectedDirty"
            >
              <Spinner v-if="busy === 'save'" />
              Save
            </Button>
            <StatusBadge
              v-if="selected.is_active"
              tone="success"
              class="h-9 px-4 text-sm"
            >
              <Check />
              Active
            </StatusBadge>
            <Button
              v-else
              type="button"
              @click="onActivate"
              :disabled="busy !== null"
            >
              <Spinner v-if="busy === 'activate'" />
              {{ selectedDirty ? 'Save & activate' : 'Activate' }}
            </Button>
          </div>
        </form>
      </template>
    </CardContent>
  </Card>
</template>
