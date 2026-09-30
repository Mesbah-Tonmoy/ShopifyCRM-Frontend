<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Swal from 'sweetalert2';
import {
  mailProviderService,
  type MailProvider,
  type MailProviderField,
  type MailProvidersOverview,
  type ConnectionTestResult,
} from '@/services/mailProviderService';
import type { ApiError } from '@/config/api';
import { useAuthStore } from '@/stores/auth';
import { Toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';
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
  Swal.fire({ icon: 'error', title, text: err.message });
};

const save = async (provider: MailProvider, { quiet = false } = {}) => {
  errors.value[provider.key] = {};
  const response = await mailProviderService.save(provider.key, payloadFor(provider));
  applyOverview(response.data, [provider.key]);
  if (!quiet) Toast.fire({ icon: 'success', title: response.message || 'Saved' });
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

  const confirm = await Swal.fire({
    icon: 'question',
    title: `Send all CRM email through ${provider.name}?`,
    text: active.value
      ? `${active.value.name} will stop being used.`
      : 'The default mailer will stop being used.',
    showCancelButton: true,
    confirmButtonText: selectedDirty.value ? 'Save and activate' : 'Activate',
    confirmButtonColor: '#0d9488',
  });
  if (!confirm.isConfirmed) return;

  try {
    busy.value = 'activate';
    if (selectedDirty.value) await save(provider, { quiet: true });
    const response = await mailProviderService.activate(provider.key);
    applyOverview(response.data);
    Toast.fire({ icon: 'success', title: response.message || `${provider.name} is active` });
  } catch (caught) {
    const err = caught as ApiError;
    handleError(provider, err, `Could not activate ${provider.name}`);
  } finally {
    busy.value = null;
  }
};

const onDeactivate = async () => {
  if (!active.value) return;

  const confirm = await Swal.fire({
    icon: 'warning',
    title: `Stop using ${active.value.name}?`,
    text: `CRM email will go through the default mailer (${overview.value?.fallback.mailer}) instead.`,
    showCancelButton: true,
    confirmButtonText: 'Stop using it',
    confirmButtonColor: '#dc2626',
  });
  if (!confirm.isConfirmed) return;

  try {
    busy.value = 'deactivate';
    const response = await mailProviderService.deactivate();
    applyOverview(response.data);
    Toast.fire({ icon: 'success', title: 'Using the default mailer' });
  } catch (caught) {
    const err = caught as ApiError;
    Swal.fire({ icon: 'error', title: 'Could not deactivate', text: err.message });
  } finally {
    busy.value = null;
  }
};

const statusBadge = (provider: MailProvider) => {
  if (provider.is_active) return { label: 'Active', classes: 'bg-green-50 text-green-700' };
  if (provider.is_configured) return { label: 'Configured', classes: 'bg-gray-100 text-gray-600' };
  return { label: 'Not set up', classes: 'bg-gray-50 text-gray-400' };
};

const secretPlaceholder = (provider: MailProvider, field: MailProviderField) =>
  provider.secrets_set.includes(field.key) ? '•••••••• saved — leave blank to keep' : field.placeholder;

const labelFor = (provider: MailProvider, key: string) =>
  provider.fields.find((f) => f.key === key)?.label ?? key;

const inputClasses =
  'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-gray-50';
</script>

<template>
  <section class="bg-white border border-gray-200 shadow-sm rounded-lg p-6">
    <div class="mb-4">
      <h3 class="text-base font-semibold text-dark">Email delivery</h3>
      <p class="text-sm text-gray-500 mt-1">
        Choose the service all CRM email goes through — install, uninstall and follow-up emails, and feature board
        notifications. Only one is active at a time.
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <LoadingIcon size="md" />
    </div>

    <div v-else-if="loadError" class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
      {{ loadError }}
      <button type="button" class="underline ml-2" @click="load()">Retry</button>
    </div>

    <template v-else-if="overview">
      <!-- What mail goes through right now -->
      <div
        class="rounded-lg border px-4 py-3 mb-5 flex flex-wrap items-center justify-between gap-3"
        :class="active ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'"
      >
        <p class="text-sm text-gray-700">
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
        <button
          v-if="active && canEdit"
          type="button"
          @click="onDeactivate"
          :disabled="busy !== null"
          class="text-sm text-gray-600 hover:text-red-700 underline disabled:opacity-50"
        >
          Stop using {{ active.name }}
        </button>
      </div>

      <!-- Provider list -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3" role="tablist" aria-label="Email providers">
        <button
          v-for="provider in providers"
          :key="provider.key"
          type="button"
          role="tab"
          :aria-selected="provider.key === selectedKey"
          @click="selectedKey = provider.key"
          class="text-left rounded-lg border p-3 flex items-center gap-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          :class="provider.key === selectedKey ? 'border-teal ring-1 ring-teal bg-white' : 'border-gray-200 hover:border-gray-300 bg-gray-50'"
        >
          <MailProviderLogo :provider-key="provider.key" :size="35" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-dark truncate">
              {{ provider.name }}<span v-if="isDirty(provider.key)" class="text-amber-600" title="Unsaved changes"> •</span>
            </span>
            <span class="inline-flex items-center px-1.5 py-0.5 mt-1 rounded text-[11px] font-semibold" :class="statusBadge(provider).classes">
              {{ statusBadge(provider).label }}
            </span>
          </span>
        </button>
      </div>

      <!-- Selected provider's settings -->
      <form v-if="selected" class="mt-6" role="tabpanel" @submit.prevent="onSave">
        <div class="flex items-center gap-3 mb-4">
          <MailProviderLogo :provider-key="selected.key" :size="32" />
          <div>
            <h4 class="text-base font-semibold text-dark">{{ selected.name }}</h4>
            <p class="text-sm text-gray-500">{{ selected.description }}</p>
          </div>
        </div>

        <fieldset
          v-for="group in (['connection', 'sender'] as const)"
          :key="group"
          class="mb-5"
          :disabled="!canEdit"
        >
          <legend class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {{ group === 'connection' ? 'Connection' : 'Sender' }}
          </legend>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="field in fieldsIn(selected, group)" :key="field.key">
              <label :for="`${selected.key}-${field.key}`" class="block text-sm font-medium text-gray-600 mb-1">
                {{ field.label }}<span v-if="isRequired(selected, field)" class="text-red-500"> *</span>
              </label>

              <select
                v-if="field.type === 'select'"
                :id="`${selected.key}-${field.key}`"
                v-model="forms[selected.key]![field.key]"
                :class="[inputClasses, errors[selected.key]?.[field.key] ? 'border-red-400' : 'border-gray-300']"
              >
                <option v-for="option in field.options" :key="option" :value="option">
                  {{ field.option_labels?.[option] ?? option }}
                </option>
              </select>

              <input
                v-else
                :id="`${selected.key}-${field.key}`"
                :type="field.type"
                v-model="forms[selected.key]![field.key]"
                :placeholder="field.secret ? secretPlaceholder(selected, field) : field.placeholder"
                :autocomplete="field.secret ? 'new-password' : 'off'"
                :class="[inputClasses, errors[selected.key]?.[field.key] ? 'border-red-400' : 'border-gray-300']"
              />

              <p v-if="errors[selected.key]?.[field.key]" class="text-xs text-red-600 mt-1">
                {{ errors[selected.key]![field.key] }}
              </p>
              <p v-else-if="field.help" class="text-xs text-gray-500 mt-1">{{ field.help }}</p>
            </div>
          </div>
        </fieldset>

        <!-- Connection test outcome -->
        <div
          v-if="testResults[selected.key]"
          class="rounded-lg border px-4 py-3 mb-5 text-sm"
          :class="testResults[selected.key]!.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'"
        >
          <p class="font-medium">{{ testResults[selected.key]!.ok ? '✓' : '✗' }} {{ testResults[selected.key]!.message }}</p>
          <ul v-if="testResults[selected.key]!.warnings.length" class="mt-2 space-y-0.5 text-amber-800">
            <li v-for="warning in testResults[selected.key]!.warnings" :key="warning">⚠ {{ warning }}</li>
          </ul>
          <p v-if="testResults[selected.key]!.details.max_24_hour_send" class="mt-2 text-xs text-gray-600">
            Quota: {{ testResults[selected.key]!.details.sent_last_24_hours ?? 0 }} /
            {{ testResults[selected.key]!.details.max_24_hour_send }} in the last 24h ·
            {{ testResults[selected.key]!.details.max_send_rate }}/s
          </p>
        </div>

        <SesTenantPanel
          v-if="selected.meta.tenant"
          class="mb-5"
          :tenant="selected.meta.tenant"
          :can-edit="canEdit"
          :has-unsaved-changes="selectedDirty"
          @changed="load([])"
        />

        <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-gray-100">
          <p v-if="!selected.is_configured && !selectedDirty" class="text-xs text-gray-500 mr-auto">
            Fill in {{ selected.missing.map((k: string) => labelFor(selected!, k)).join(', ') }} to activate.
          </p>
          <p v-else-if="selectedDirty" class="text-xs text-amber-700 mr-auto">Unsaved changes</p>

          <button
            type="button"
            @click="onTest"
            :disabled="busy !== null"
            class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            title="Checks the connection and credentials. No email is sent."
          >
            <LoadingIcon v-if="busy === 'test'" size="xs" />
            Test connection
          </button>
          <button
            type="submit"
            :disabled="busy !== null || !selectedDirty"
            class="px-4 py-2 rounded-lg text-sm font-medium border border-teal text-teal hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <LoadingIcon v-if="busy === 'save'" size="xs" />
            Save
          </button>
          <span
            v-if="selected.is_active"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-green-50 text-green-700"
          >
            ✓ Active
          </span>
          <button
            v-else
            type="button"
            @click="onActivate"
            :disabled="busy !== null"
            class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <LoadingIcon v-if="busy === 'activate'" size="xs" color-class="text-white" />
            {{ selectedDirty ? 'Save & activate' : 'Activate' }}
          </button>
        </div>
      </form>
    </template>
  </section>
</template>
