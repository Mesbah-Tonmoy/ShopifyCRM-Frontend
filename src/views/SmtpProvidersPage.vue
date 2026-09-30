<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
  smtpProviderService,
  type SmtpProvider,
  type SmtpProviderPayload,
  type SmtpStatus,
} from '@/services/smtpProviderService';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { Toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';
import PageHeader from '@/components/common/PageHeader.vue';
import SelectInput from '@/components/common/SelectInput.vue';

/**
 * Manages the SMTP service a connected app sends its platform mail through —
 * the transport behind its "default" email option and all of its system mail.
 *
 * Nothing here is stored in the CRM. Each app owns its own provider table and
 * the backend proxies to it, so the page always shows what that app will
 * actually use, including the environment fallback it drops to when no provider
 * is active.
 */

/**
 * Starting points for the connection form. Every one is plain SMTP — the host
 * and port are the only things that really differ — so a preset just spares
 * whoever is adding a service a trip to its docs.
 */
interface Preset {
  key: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  /** What goes in the username field, when the service prescribes it. */
  username?: string;
  hint?: string;
}

/**
 * Port 2587 rather than 587 by default. SES accepts 25, 465, 587, 2465 and
 * 2587; many ISPs and office networks silently drop the three standard mail
 * ports, which shows up as a connect timeout rather than a refusal. The
 * alternates carry identical traffic, so defaulting to one that gets through
 * saves a confusing round of debugging. Switch to 587 where egress is open.
 */
const SES_HINT =
  'Use SES SMTP credentials (username starts with AKIA), not AWS access keys — the password is region-derived, so credentials issued for another region fail with 535. Port 2587 is STARTTLS; 2465 is implicit TLS (tick the box). Use 587/465 instead where the network does not block mail ports.';

const PRESETS: Preset[] = [
  {
    key: 'mailtrap',
    name: 'Mailtrap',
    host: 'live.smtp.mailtrap.io',
    port: 587,
    secure: false,
    username: 'api',
    hint: 'Username is literally "api"; the password is your Mailtrap API token.',
  },
  {
    key: 'ses-us-east-1',
    name: 'Amazon SES — N. Virginia (us-east-1)',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 2587,
    secure: false,
    hint: SES_HINT,
  },
  {
    key: 'ses-us-west-1',
    name: 'Amazon SES — N. California (us-west-1)',
    host: 'email-smtp.us-west-1.amazonaws.com',
    port: 2587,
    secure: false,
    hint: SES_HINT,
  },
  {
    key: 'brevo',
    name: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    hint: 'Username is your Brevo login email; the password is an SMTP key.',
  },
  {
    key: 'sendgrid',
    name: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    username: 'apikey',
    hint: 'Username is literally "apikey"; the password is your API key.',
  },
  {
    key: 'postmark',
    name: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 587,
    secure: false,
    hint: 'Username and password are both the Server API token.',
  },
  {
    key: 'mailgun',
    name: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    hint: 'Username looks like postmaster@your-domain.mailgun.org.',
  },
  {
    key: 'custom',
    name: 'Custom SMTP',
    host: '',
    port: 587,
    secure: false,
  },
];

const authStore = useAuthStore();
const appsStore = useAppsStore();

const canEdit = computed(() => authStore.hasPermission('smtp.edit'));

const selectedAppId = ref<number | null>(null);
const providers = ref<SmtpProvider[]>([]);
const status = ref<SmtpStatus | null>(null);
const loading = ref(false);
/** Set to the provider id while a per-row action (activate/test/delete) runs. */
const busyId = ref<string | null>(null);
const saving = ref(false);
const reencrypting = ref(false);
/** Non-null when the app could not be reached at all. */
const loadError = ref<string | null>(null);

const modalOpen = ref(false);
/** The provider being edited, or null when adding a new one. */
const editing = ref<SmtpProvider | null>(null);
const selectedPreset = ref<string>('custom');

const form = ref({
  key: '',
  name: '',
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  replyTo: '',
  configurationSet: '',
  isEnabled: true,
  isActive: false,
  priority: 100,
  overrideFrom: false,
  awsRegion: '',
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  sesIdentityArn: '',
  sesConfigurationSetArn: '',
});

const selectedApp = computed(() => appsStore.apps.find((a) => a.id === selectedAppId.value) || null);

const activeProvider = computed(() => providers.value.find((p) => p.isActive) || null);

const presetHint = computed(() => PRESETS.find((p) => p.key === selectedPreset.value)?.hint || null);

onMounted(async () => {
  if (!appsStore.apps.length) {
    await appsStore.fetchApps(1, 100);
  }
  // One app is the common case, so pick it rather than making them choose.
  if (appsStore.apps.length && selectedAppId.value === null) {
    selectedAppId.value = appsStore.apps[0]!.id;
  }
});

watch(selectedAppId, () => {
  providers.value = [];
  status.value = null;
  loadError.value = null;
  if (selectedAppId.value !== null) fetchProviders();
});

const fetchProviders = async () => {
  if (selectedAppId.value === null) return;

  try {
    loading.value = true;
    loadError.value = null;

    const response = await smtpProviderService.getAll(selectedAppId.value);

    if (response.success && response.data) {
      providers.value = response.data.providers || [];
      status.value = response.data.status || null;
    } else {
      loadError.value = response.message || 'Failed to load SMTP providers';
    }
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load SMTP providers';
  } finally {
    loading.value = false;
  }
};

const applyPreset = (key: string) => {
  selectedPreset.value = key;
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset || key === 'custom') return;

  form.value.host = preset.host;
  form.value.port = preset.port;
  form.value.secure = preset.secure;
  if (preset.username !== undefined) form.value.username = preset.username;

  // Only seed the identity fields while adding, so editing an existing
  // provider cannot have its slug rewritten out from under it.
  if (!editing.value) {
    form.value.key = preset.key;
    form.value.name = preset.name;
  }
};

const openAdd = () => {
  editing.value = null;
  selectedPreset.value = 'custom';
  form.value = {
    key: '',
    name: '',
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    replyTo: '',
    configurationSet: '',
    isEnabled: true,
    isActive: false,
    priority: 100,
    overrideFrom: false,
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    sesIdentityArn: '',
    sesConfigurationSetArn: '',
  };
  modalOpen.value = true;
};

const openEdit = (provider: SmtpProvider) => {
  editing.value = provider;
  selectedPreset.value = PRESETS.some((p) => p.key === provider.key) ? provider.key : 'custom';
  form.value = {
    key: provider.key,
    name: provider.name,
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    username: provider.username || '',
    // Left blank on purpose: the real password never reaches the browser, and
    // an empty field on submit means "keep the stored one".
    password: '',
    fromEmail: provider.fromEmail || '',
    fromName: provider.fromName || '',
    replyTo: provider.replyTo || '',
    configurationSet: provider.configurationSet || '',
    isEnabled: provider.isEnabled,
    isActive: provider.isActive,
    priority: provider.priority,
    awsRegion: provider.awsRegion || '',
    awsAccessKeyId: provider.awsAccessKeyId || '',
    // Blank on purpose: the real secret never reaches the browser.
    awsSecretAccessKey: '',
    sesIdentityArn: '',
    // ARNs are not returned by the app, so an edit starts blank and only
    // overwrites what is stored when something is typed in.
    sesConfigurationSetArn: '',
    overrideFrom: provider.extra?.overrideFrom === true,
  };
  modalOpen.value = true;
};

const save = async () => {
  if (selectedAppId.value === null) return;

  if (!form.value.key.trim() || !form.value.host.trim()) {
    Toast.fire({ icon: 'error', title: 'Key and host are required' });
    return;
  }

  const payload: SmtpProviderPayload = {
    key: form.value.key.trim(),
    name: form.value.name.trim() || form.value.key.trim(),
    host: form.value.host.trim(),
    port: Number(form.value.port),
    secure: form.value.secure,
    username: form.value.username.trim() || null,
    fromEmail: form.value.fromEmail.trim() || null,
    fromName: form.value.fromName.trim() || null,
    replyTo: form.value.replyTo.trim() || null,
    configurationSet: form.value.configurationSet.trim() || null,
    isEnabled: form.value.isEnabled,
    isActive: form.value.isActive,
    priority: Number(form.value.priority),
    awsRegion: form.value.awsRegion.trim() || null,
    awsAccessKeyId: form.value.awsAccessKeyId.trim() || null,
    extra: form.value.overrideFrom ? { overrideFrom: true } : {},
  };

  // Omitted entirely rather than sent empty, which is how the app tells "leave
  // the stored password alone" from "clear it".
  if (form.value.password) {
    payload.password = form.value.password;
  }

  if (form.value.awsSecretAccessKey) {
    payload.awsSecretAccessKey = form.value.awsSecretAccessKey;
  }

  // Same rule as the secrets: blank means "leave what is stored". The app never
  // sends the ARNs back, so blank cannot be distinguished from unchanged.
  if (form.value.sesIdentityArn.trim()) {
    payload.sesIdentityArn = form.value.sesIdentityArn.trim();
  }
  if (form.value.sesConfigurationSetArn.trim()) {
    payload.sesConfigurationSetArn = form.value.sesConfigurationSetArn.trim();
  }

  // A brand new provider with no password would authenticate as nobody.
  if (!editing.value && !form.value.password && form.value.username) {
    Toast.fire({ icon: 'error', title: 'Enter the SMTP password' });
    return;
  }

  try {
    saving.value = true;
    const response = await smtpProviderService.save(selectedAppId.value, payload);

    if (response.success) {
      Toast.fire({ icon: 'success', title: response.message || 'Provider saved' });
      modalOpen.value = false;
      await fetchProviders();
    } else {
      Swal.fire({ icon: 'error', title: 'Could not save', text: response.message });
    }
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not save', text: err.message || 'Request failed' });
  } finally {
    saving.value = false;
  }
};

/**
 * Step two of a key rotation: rewrite stored secrets under the new key.
 *
 * Run after the app has the new key in SMTP_ENCRYPTION_KEY and the old one in
 * SMTP_ENCRYPTION_KEY_PREVIOUS. Once "stale" reaches zero the previous key can
 * be dropped from the environment.
 */
const reencrypt = async () => {
  if (selectedAppId.value === null) return;

  const confirmed = await Swal.fire({
    icon: 'question',
    title: 'Re-encrypt stored secrets?',
    html: `Rewrites every stored SMTP password and AWS secret under the app's
           <b>current</b> encryption key.
           <br><br>Safe to run more than once. Make sure the app still has the old key in
           <code>SMTP_ENCRYPTION_KEY_PREVIOUS</code>, or secrets sealed under it cannot be read
           and will need re-entering.`,
    showCancelButton: true,
    confirmButtonText: 'Re-encrypt',
    confirmButtonColor: '#0d9488',
  });

  if (!confirmed.isConfirmed) return;

  try {
    reencrypting.value = true;
    const response = await smtpProviderService.reencrypt(selectedAppId.value);

    Swal.fire({
      icon: response.success ? 'success' : 'warning',
      title: response.success ? 'Re-encrypted' : 'Finished with problems',
      text: response.message,
    });

    await fetchProviders();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Re-encrypt failed', text: err.message || 'Request failed' });
  } finally {
    reencrypting.value = false;
  }
};

const activate = async (provider: SmtpProvider) => {
  if (selectedAppId.value === null || provider.isActive) return;

  const confirmed = await Swal.fire({
    icon: 'warning',
    title: `Send all mail through ${provider.name}?`,
    text: `${selectedApp.value?.app_name || 'The app'} will use this service for every system email and every merchant on the default sender. Test the connection first if you have not.`,
    showCancelButton: true,
    confirmButtonText: 'Make it active',
    confirmButtonColor: '#0d9488',
  });

  if (!confirmed.isConfirmed) return;

  try {
    busyId.value = provider.id;
    const response = await smtpProviderService.activate(selectedAppId.value, provider.id);

    if (response.success) {
      Toast.fire({ icon: 'success', title: response.message || 'Activated' });
      await fetchProviders();
    } else {
      Swal.fire({ icon: 'error', title: 'Could not activate', text: response.message });
    }
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not activate', text: err.message || 'Request failed' });
  } finally {
    busyId.value = null;
  }
};

const test = async (provider: SmtpProvider) => {
  if (selectedAppId.value === null) return;

  try {
    busyId.value = provider.id;
    const response = await smtpProviderService.test(selectedAppId.value, provider.id);

    // The connection result comes back as success:false, not as an exception.
    Swal.fire({
      icon: response.success ? 'success' : 'error',
      title: response.success ? 'Connection succeeded' : 'Connection failed',
      text: response.message,
    });

    await fetchProviders();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Test failed', text: err.message || 'Request failed' });
  } finally {
    busyId.value = null;
  }
};

const remove = async (provider: SmtpProvider) => {
  if (selectedAppId.value === null) return;

  const confirmed = await Swal.fire({
    icon: 'warning',
    title: `Delete ${provider.name}?`,
    text: provider.isActive
      ? 'This is the active service. Deleting it drops the app back to its environment SMTP config until you activate another provider.'
      : 'The stored credentials will be removed.',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#dc2626',
  });

  if (!confirmed.isConfirmed) return;

  try {
    busyId.value = provider.id;
    const response = await smtpProviderService.remove(selectedAppId.value, provider.id);

    if (response.success) {
      Toast.fire({ icon: 'success', title: 'Provider deleted' });
      if (response.data?.wasActive) {
        Swal.fire({ icon: 'info', title: 'Fell back to environment config', text: response.message });
      }
      await fetchProviders();
    } else {
      Swal.fire({ icon: 'error', title: 'Could not delete', text: response.message });
    }
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Could not delete', text: err.message || 'Request failed' });
  } finally {
    busyId.value = null;
  }
};

const formatDate = (value: string | null) => {
  if (!value) return null;
  return new Date(value).toLocaleString();
};
</script>

<template>
  <div>
    <PageHeader
      title="SMTP Setup"
      description="Choose which SMTP service a connected app sends its platform email through"
    >
      <template #actions>
        <button
          v-if="canEdit && selectedAppId !== null"
          @click="openAdd"
          class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all"
        >
          Add SMTP service
        </button>
      </template>
    </PageHeader>

    <!-- App picker -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-4">
      <SelectInput v-model="selectedAppId" label="App" placeholder="Select App" select-class="w-64">
        <option v-for="app in appsStore.apps" :key="app.id" :value="app.id">
          {{ app.app_name }}
        </option>
      </SelectInput>

      <button
        v-if="selectedAppId !== null"
        @click="fetchProviders"
        :disabled="loading"
        class="text-sm text-gray-600 hover:text-dark underline disabled:opacity-50"
      >
        Refresh
      </button>
    </div>

    <div v-if="selectedAppId === null" class="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
      Select an app to manage its SMTP services.
    </div>

    <div v-else-if="loading" class="flex justify-center py-12">
      <LoadingIcon size="md" />
    </div>

    <div v-else-if="loadError" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <h3 class="text-base font-semibold text-red-800">Could not reach the app</h3>
      <p class="text-sm text-red-700 mt-1">{{ loadError }}</p>
      <p class="text-sm text-red-700 mt-2">
        The SMTP settings live in the app's own database, so this page needs the app to be online.
        Check that its URL is correct and that the CRM's <code>WEBHOOK_SECRET</code> matches the
        app's <code>CRM_WEBHOOK_SECRET</code>.
      </p>
    </div>

    <div v-else class="flex flex-col gap-5 max-w-4xl">
      <!-- What the app is sending through right now -->
      <div
        v-if="status"
        class="rounded-lg border p-5"
        :class="status.source === 'db' ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'"
      >
        <h3 class="text-sm font-semibold text-dark">Currently sending through</h3>

        <p v-if="status.source === 'db'" class="text-sm text-gray-700 mt-1">
          <span class="font-medium">{{ activeProvider?.name || status.activeKey }}</span>
          at {{ status.host }}<span v-if="status.fromEmail"> · from {{ status.fromEmail }}</span>
          <span v-if="status.configurationSet"> · config set {{ status.configurationSet }}</span>
        </p>

        <p v-else-if="status.source === 'env'" class="text-sm text-gray-700 mt-1">
          The app's <span class="font-medium">environment config</span> ({{ status.host }}) — no
          provider below is active, so it is using its own <code>SMTP_*</code> /
          <code>MAILTRAP_*</code> variables.
        </p>

        <p v-else class="text-sm text-red-700 mt-1">
          Nothing. No provider is active and the app has no environment SMTP config, so platform
          email is not being sent.
        </p>

        <div v-if="status.chain && status.chain.length > 1" class="mt-3">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Failover order</p>
          <ol class="text-sm text-gray-700 mt-1 space-y-0.5">
            <li v-for="(hop, i) in status.chain" :key="hop.key + i">
              {{ i + 1 }}. {{ hop.name }}
              <span class="text-gray-400">({{ hop.host }})</span>
              <span v-if="hop.source === 'env'" class="text-xs text-gray-500">— environment config</span>
            </li>
          </ol>
          <p class="text-xs text-gray-500 mt-1">
            A send that fails for a transport reason — connection, credentials, throttling — is
            retried on the next entry. A rejected recipient is not retried.
          </p>
        </div>

        <p v-if="!status.encryptionConfigured" class="text-sm text-red-700 mt-3">
          The app cannot encrypt credentials: neither <code>SMTP_ENCRYPTION_KEY</code> nor
          <code>SHOPIFY_API_SECRET</code> is set. Saving a password will fail until one is.
        </p>

        <div v-if="status.encryption" class="mt-4 pt-3 border-t border-gray-200">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Credential encryption
              </p>
              <p class="text-sm text-gray-700 mt-1">
                Key <code>{{ status.encryption.currentKeyId || 'none' }}</code>
                <span class="text-gray-400">·</span>
                {{ status.encryption.sealedCurrent }} secret(s) current
                <template v-if="status.encryption.sealedStale">
                  <span class="text-gray-400">·</span>
                  <span class="text-amber-700">
                    {{ status.encryption.sealedStale }} under an older key
                  </span>
                </template>
                <template v-if="status.encryption.unreadable">
                  <span class="text-gray-400">·</span>
                  <span class="text-red-700">
                    {{ status.encryption.unreadable }} unreadable
                  </span>
                </template>
              </p>

              <p v-if="status.encryption.usingLegacyKey" class="text-xs text-amber-700 mt-1">
                Using <code>SHOPIFY_API_SECRET</code> as the encryption key. Set a dedicated
                <code>SMTP_ENCRYPTION_KEY</code> — sharing one secret means one leak costs both.
              </p>

              <p v-else-if="status.encryption.sealedStale" class="text-xs text-gray-600 mt-1">
                A rotation is in progress. Re-encrypt, then remove
                <code>SMTP_ENCRYPTION_KEY_PREVIOUS</code> once this reaches zero.
              </p>

              <p v-else-if="status.encryption.unreadable" class="text-xs text-red-700 mt-1">
                No configured key opens these. Re-enter those credentials, or restore the key that
                sealed them to <code>SMTP_ENCRYPTION_KEY_PREVIOUS</code>.
              </p>
            </div>

            <button
              v-if="canEdit && (status.encryption.sealedStale || status.encryption.unreadable)"
              @click="reencrypt"
              :disabled="reencrypting"
              class="text-sm px-3 py-1.5 rounded-lg border border-teal text-teal hover:bg-teal-50 disabled:opacity-40 flex items-center gap-2 flex-shrink-0"
            >
              <LoadingIcon v-if="reencrypting" size="xs" />
              Re-encrypt secrets
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="!providers.length"
        class="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500"
      >
        No SMTP services configured for {{ selectedApp?.app_name }} yet.
        <span v-if="canEdit">Add one to take it off the environment fallback.</span>
      </div>

      <!-- Provider list -->
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="bg-white border rounded-lg p-5 shadow-sm"
        :class="provider.isActive ? 'border-teal ring-1 ring-teal' : 'border-gray-200'"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-semibold text-dark">{{ provider.name }}</h3>
              <span
                v-if="provider.isActive"
                class="text-xs font-medium px-2 py-0.5 rounded-full bg-teal text-white"
              >
                Active
              </span>
              <span
                v-if="!provider.isEnabled"
                class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600"
              >
                Disabled
              </span>
              <span class="text-xs text-gray-400 font-mono">{{ provider.key }}</span>
              <span v-if="!provider.isActive && provider.isEnabled" class="text-xs text-gray-500">
                fallback #{{ provider.priority }}
              </span>
            </div>

            <p class="text-sm text-gray-600 mt-1">
              {{ provider.host }}:{{ provider.port }}
              <span class="text-gray-400">·</span>
              {{ provider.secure ? 'TLS' : 'STARTTLS' }}
              <template v-if="provider.username">
                <span class="text-gray-400">·</span> {{ provider.username }}
              </template>
              <span class="text-gray-400">·</span>
              <span :class="provider.hasPassword ? 'text-gray-600' : 'text-red-600'">
                {{ provider.hasPassword ? 'password set' : 'no password' }}
              </span>
            </p>

            <p v-if="provider.fromEmail" class="text-sm text-gray-500 mt-1">
              From: {{ provider.fromName ? `${provider.fromName} <${provider.fromEmail}>` : provider.fromEmail }}
              <span v-if="provider.extra?.overrideFrom" class="text-xs text-gray-400">
                (overrides the app's own sender)
              </span>
            </p>

            <p v-if="provider.configurationSet" class="text-sm text-gray-500 mt-1">
              Config set: <span class="font-mono">{{ provider.configurationSet }}</span>
            </p>

            <p
              v-if="provider.lastTestStatus"
              class="text-xs mt-2"
              :class="provider.lastTestStatus === 'success' ? 'text-green-700' : 'text-red-600'"
            >
              Last test {{ provider.lastTestStatus }} · {{ formatDate(provider.lastTestedAt) }}
              <span v-if="provider.lastTestError"> — {{ provider.lastTestError }}</span>
            </p>
          </div>

          <div v-if="canEdit" class="flex items-center gap-2 flex-shrink-0">
            <LoadingIcon v-if="busyId === provider.id" size="xs" />

            <button
              v-if="!provider.isActive"
              @click="activate(provider)"
              :disabled="busyId !== null || !provider.isEnabled"
              class="text-sm px-3 py-1.5 rounded-lg border border-teal text-teal hover:bg-teal-50 disabled:opacity-40"
              :title="provider.isEnabled ? '' : 'Enable this provider before activating it'"
            >
              Activate
            </button>

            <button
              @click="test(provider)"
              :disabled="busyId !== null"
              class="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Test
            </button>

            <button
              @click="openEdit(provider)"
              :disabled="busyId !== null"
              class="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Edit
            </button>

            <button
              @click="remove(provider)"
              :disabled="busyId !== null"
              class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add / edit form -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4 z-50"
      @click.self="modalOpen = false"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-dark">
            {{ editing ? `Edit ${editing.name}` : 'Add SMTP service' }}
          </h2>
          <button @click="modalOpen = false" class="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <div v-if="!editing">
            <label class="block text-sm font-medium text-gray-600 mb-1">Start from</label>
            <select
              :value="selectedPreset"
              @change="applyPreset(($event.target as HTMLSelectElement).value)"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option v-for="preset in PRESETS" :key="preset.key" :value="preset.key">
                {{ preset.name }}
              </option>
            </select>
            <p v-if="presetHint" class="text-xs text-gray-500 mt-1">{{ presetHint }}</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Key <span class="text-red-500">*</span></label>
              <input
                v-model="form.key"
                :disabled="!!editing"
                placeholder="mailtrap"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-gray-50"
              />
              <p class="text-xs text-gray-500 mt-1">
                Lowercase slug used in the app's logs. Cannot be changed later.
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Display name</label>
              <input
                v-model="form.name"
                placeholder="Mailtrap"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-600 mb-1">Host <span class="text-red-500">*</span></label>
              <input
                v-model="form.host"
                placeholder="live.smtp.mailtrap.io"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Port</label>
              <input
                v-model.number="form.port"
                type="number"
                min="1"
                max="65535"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="form.secure" type="checkbox" class="rounded border-gray-300 text-teal focus:ring-teal" />
            Implicit TLS (use for port 465; leave off for STARTTLS on 587)
          </label>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Username</label>
              <input
                v-model="form.username"
                autocomplete="off"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Password</label>
              <input
                v-model="form.password"
                type="password"
                autocomplete="new-password"
                :placeholder="editing?.hasPassword ? 'Leave blank to keep the stored password' : ''"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <p class="text-xs text-gray-500 mt-1">
                Stored encrypted in the app's database and never shown again.
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">From email</label>
              <input
                v-model="form.fromEmail"
                type="email"
                placeholder="support@axilweb.com"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">From name</label>
              <input
                v-model="form.fromName"
                placeholder="FormCRM"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">Reply-To</label>
            <input
              v-model="form.replyTo"
              type="email"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <p class="text-xs text-gray-500 mt-1">Used only when the app does not set one itself.</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-600 mb-1">SES configuration set</label>
            <input
              v-model="form.configurationSet"
              placeholder="my-config-set"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <p class="text-xs text-gray-500 mt-1">
              Amazon SES only. Sent as the <code>X-SES-CONFIGURATION-SET</code> header, which is
              what turns on SES event publishing (bounces, complaints, deliveries) and any
              dedicated IP pool for this traffic. Leave blank for non-SES services.
            </p>
          </div>

          <label class="flex items-start gap-2 text-sm text-gray-700">
            <input
              v-model="form.overrideFrom"
              type="checkbox"
              class="mt-0.5 rounded border-gray-300 text-teal focus:ring-teal"
            />
            <span>
              Force the From email above
              <span class="block text-xs text-gray-500">
                By default the app's own sender address wins. Turn this on when the service only
                accepts senders on its own verified domain.
              </span>
            </span>
          </label>

          <div class="border-t border-gray-200 pt-4 space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-dark">Amazon SES tenant management</h3>
              <p class="text-xs text-gray-500 mt-1">
                Optional, SES only. Gives each Shopify store its own SES tenant, so one store's
                bounce rate cannot pause the whole account. Tenant operations are SES
                <b>API</b> calls and need an IAM key pair &mdash; the SMTP credentials above cannot
                call the API. Tenants are region-scoped, so fill this in for every region.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">AWS region</label>
                <input
                  v-model="form.awsRegion"
                  placeholder="us-west-1"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">Access key ID</label>
                <input
                  v-model="form.awsAccessKeyId"
                  autocomplete="off"
                  placeholder="AKIA..."
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Secret access key</label>
              <input
                v-model="form.awsSecretAccessKey"
                type="password"
                autocomplete="new-password"
                :placeholder="editing?.hasAwsSecret ? 'Leave blank to keep the stored secret' : ''"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <p class="text-xs text-gray-500 mt-1">
                Needs ses:CreateTenant, ses:CreateTenantResourceAssociation, ses:GetTenant and
                ses:UpdateReputationEntityCustomerManagedStatus. Stored encrypted.
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Identity ARN</label>
              <input
                v-model="form.sesIdentityArn"
                :placeholder="editing?.hasIdentityArn ? 'Stored — leave blank to keep it' : 'arn:aws:ses:us-west-1:123456789012:identity/axilweb.com'"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Configuration set ARN</label>
              <input
                v-model="form.sesConfigurationSetArn"
                :placeholder="editing?.hasConfigurationSetArn ? 'Stored — leave blank to keep it' : 'arn:aws:ses:us-west-1:123456789012:configuration-set/my-config-set'"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <p class="text-xs text-gray-500 mt-1">
                Both ARNs are associated with every tenant. SES rejects a tenant send when the
                identity or configuration set is not associated, so leaving these blank creates
                tenants that cannot send.
              </p>
            </div>

            <p class="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
              Filling these in makes this provider <b>tenant-required</b>: every send names a
              tenant via <code>X-SES-TENANT</code>. There is no on/off switch, because the
              configuration set uses suppression scope <code>TENANT</code> and SES rejects
              untenanted mail with <code>554 Tenant name is required</code> &mdash; so "off" would
              only mean "no email at all".
            </p>
          </div>

          <div class="border-t border-gray-200 pt-4 space-y-3">
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input v-model="form.isEnabled" type="checkbox" class="rounded border-gray-300 text-teal focus:ring-teal" />
              Enabled (a disabled service cannot be activated)
            </label>

            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Failover priority</label>
              <input
                v-model.number="form.priority"
                type="number"
                min="0"
                max="9999"
                class="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <p class="text-xs text-gray-500 mt-1">
                Order this service is tried in when the active one fails: lower goes first. The
                active service is always attempted before any of these, whatever its own number.
              </p>
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                v-model="form.isActive"
                type="checkbox"
                :disabled="!form.isEnabled"
                class="rounded border-gray-300 text-teal focus:ring-teal disabled:opacity-40"
              />
              Make this the active service on save
              <span v-if="activeProvider && !form.isActive" class="text-xs text-gray-500">
                (replaces {{ activeProvider.name }})
              </span>
            </label>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            @click="modalOpen = false"
            class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="save"
            :disabled="saving"
            class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <LoadingIcon v-if="saving" size="xs" color-class="text-white" />
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
