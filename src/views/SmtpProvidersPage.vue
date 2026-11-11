<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  smtpProviderService,
  type SmtpProvider,
  type SmtpProviderPayload,
  type SmtpStatus,
} from '@/services/smtpProviderService';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { LoadingIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/common/PageHeader.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import AppAlert from '@/components/common/AppAlert.vue';
import { errorMessage } from '@/utils/errors';

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

const presetOptions = PRESETS.map((preset) => ({ value: preset.key, label: preset.name }));

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
  } catch (err) {
    loadError.value = errorMessage(err, 'Failed to load SMTP providers');
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
    toast.error('Key and host are required');
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
    toast.error('Enter the SMTP password');
    return;
  }

  try {
    saving.value = true;
    const response = await smtpProviderService.save(selectedAppId.value, payload);

    if (response.success) {
      toast.success(response.message || 'Provider saved');
      modalOpen.value = false;
      await fetchProviders();
    } else {
      toast.error('Could not save', { description: response.message });
    }
  } catch (err) {
    toast.error('Could not save', { description: errorMessage(err, 'Request failed') });
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

  const { confirmed } = await confirmDialog({
    title: 'Re-encrypt stored secrets?',
    html: `Rewrites every stored SMTP password and AWS secret under the app's
           <b>current</b> encryption key.
           <br><br>Safe to run more than once. Make sure the app still has the old key in
           <code>SMTP_ENCRYPTION_KEY_PREVIOUS</code>, or secrets sealed under it cannot be read
           and will need re-entering.`,
    confirmText: 'Re-encrypt',
  });

  if (!confirmed) return;

  try {
    reencrypting.value = true;
    const response = await smtpProviderService.reencrypt(selectedAppId.value);

    toast[response.success ? 'success' : 'warning'](
      response.success ? 'Re-encrypted' : 'Finished with problems',
      { description: response.message }
    );

    await fetchProviders();
  } catch (err) {
    toast.error('Re-encrypt failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    reencrypting.value = false;
  }
};

const activate = async (provider: SmtpProvider) => {
  if (selectedAppId.value === null || provider.isActive) return;

  const { confirmed } = await confirmDialog({
    title: `Send all mail through ${provider.name}?`,
    description: `${selectedApp.value?.app_name || 'The app'} will use this service for every system email and every merchant on the default sender. Test the connection first if you have not.`,
    confirmText: 'Make it active',
  });

  if (!confirmed) return;

  try {
    busyId.value = provider.id;
    const response = await smtpProviderService.activate(selectedAppId.value, provider.id);

    if (response.success) {
      toast.success(response.message || 'Activated');
      await fetchProviders();
    } else {
      toast.error('Could not activate', { description: response.message });
    }
  } catch (err) {
    toast.error('Could not activate', { description: errorMessage(err, 'Request failed') });
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
    if (response.success) {
      toast.success('Connection succeeded', { description: response.message });
    } else {
      // SMTP errors are long and need reading, so they stay on screen until dismissed.
      await confirmDialog({
        title: 'Connection failed',
        description: response.message || 'The server rejected the connection.',
        cancelText: false,
        confirmText: 'OK',
      });
    }

    await fetchProviders();
  } catch (err) {
    toast.error('Test failed', { description: errorMessage(err, 'Request failed') });
  } finally {
    busyId.value = null;
  }
};

const remove = async (provider: SmtpProvider) => {
  if (selectedAppId.value === null) return;

  const { confirmed } = await confirmDialog({
    title: `Delete ${provider.name}?`,
    description: provider.isActive
      ? 'This is the active service. Deleting it drops the app back to its environment SMTP config until you activate another provider.'
      : 'The stored credentials will be removed.',
    confirmText: 'Delete',
    destructive: true,
  });

  if (!confirmed) return;

  try {
    busyId.value = provider.id;
    const response = await smtpProviderService.remove(selectedAppId.value, provider.id);

    if (response.success) {
      toast.success('Provider deleted');
      if (response.data?.wasActive) {
        toast.info('Fell back to environment config', { description: response.message });
      }
      await fetchProviders();
    } else {
      toast.error('Could not delete', { description: response.message });
    }
  } catch (err) {
    toast.error('Could not delete', { description: errorMessage(err, 'Request failed') });
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
        <Button
          v-if="canEdit && selectedAppId !== null"
          @click="openAdd"
        >
          Add SMTP service
        </Button>
      </template>
    </PageHeader>

    <!-- App picker -->
    <Card size="sm" class="mb-6">
      <CardContent class="flex flex-wrap items-center gap-4">
        <SelectInput v-model="selectedAppId" :options="appsStore.appOptions" label="App" placeholder="Select App" select-class="w-64" />

        <Button
          v-if="selectedAppId !== null"
          variant="link"
          @click="fetchProviders"
          :disabled="loading"
          class="h-auto p-0"
        >
          Refresh
        </Button>
      </CardContent>
    </Card>

    <Empty v-if="selectedAppId === null" class="border bg-card p-8">
      <EmptyDescription>Select an app to manage its SMTP services.</EmptyDescription>
    </Empty>

    <div v-else-if="loading" class="flex justify-center py-12">
      <LoadingIcon size="md" />
    </div>

    <AppAlert v-else-if="loadError" tone="danger" title="Could not reach the app" class="p-6">
      <p>{{ loadError }}</p>
      <p>
        The SMTP settings live in the app's own database, so this page needs the app to be online.
        Check that its URL is correct and that the CRM's <code>WEBHOOK_SECRET</code> matches the
        app's <code>CRM_WEBHOOK_SECRET</code>.
      </p>
    </AppAlert>

    <div v-else class="flex flex-col gap-5 max-w-4xl">
      <!-- What the app is sending through right now -->
      <AppAlert
        v-if="status"
        :tone="status.source === 'db' ? 'success' : 'warning'"
        title="Currently sending through"
        class="p-5"
      >
        <p v-if="status.source === 'db'">
          <span class="font-medium">{{ activeProvider?.name || status.activeKey }}</span>
          at {{ status.host }}<span v-if="status.fromEmail"> · from {{ status.fromEmail }}</span>
          <span v-if="status.configurationSet"> · config set {{ status.configurationSet }}</span>
        </p>

        <p v-else-if="status.source === 'env'">
          The app's <span class="font-medium">environment config</span> ({{ status.host }}) — no
          provider below is active, so it is using its own <code>SMTP_*</code> /
          <code>MAILTRAP_*</code> variables.
        </p>

        <p v-else class="text-destructive">
          Nothing. No provider is active and the app has no environment SMTP config, so platform
          email is not being sent.
        </p>

        <div v-if="status.chain && status.chain.length > 1" class="mt-3">
          <p class="text-xs font-semibold uppercase tracking-wide">Failover order</p>
          <ol class="mt-1 space-y-0.5">
            <li v-for="(hop, i) in status.chain" :key="hop.key + i">
              {{ i + 1 }}. {{ hop.name }}
              <span class="text-muted-foreground">({{ hop.host }})</span>
              <span v-if="hop.source === 'env'" class="text-xs text-muted-foreground">— environment config</span>
            </li>
          </ol>
          <p class="text-xs text-muted-foreground mt-1">
            A send that fails for a transport reason — connection, credentials, throttling — is
            retried on the next entry. A rejected recipient is not retried.
          </p>
        </div>

        <p v-if="!status.encryptionConfigured" class="text-destructive mt-3">
          The app cannot encrypt credentials: neither <code>SMTP_ENCRYPTION_KEY</code> nor
          <code>SHOPIFY_API_SECRET</code> is set. Saving a password will fail until one is.
        </p>

        <div v-if="status.encryption" class="mt-4 pt-3 border-t">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide">
                Credential encryption
              </p>
              <p class="mt-1">
                Key <code>{{ status.encryption.currentKeyId || 'none' }}</code>
                <span class="text-muted-foreground">·</span>
                {{ status.encryption.sealedCurrent }} secret(s) current
                <template v-if="status.encryption.sealedStale">
                  <span class="text-muted-foreground">·</span>
                  <span class="text-amber-700 dark:text-amber-300">
                    {{ status.encryption.sealedStale }} under an older key
                  </span>
                </template>
                <template v-if="status.encryption.unreadable">
                  <span class="text-muted-foreground">·</span>
                  <span class="text-destructive">
                    {{ status.encryption.unreadable }} unreadable
                  </span>
                </template>
              </p>

              <p v-if="status.encryption.usingLegacyKey" class="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Using <code>SHOPIFY_API_SECRET</code> as the encryption key. Set a dedicated
                <code>SMTP_ENCRYPTION_KEY</code> — sharing one secret means one leak costs both.
              </p>

              <p v-else-if="status.encryption.sealedStale" class="text-xs text-muted-foreground mt-1">
                A rotation is in progress. Re-encrypt, then remove
                <code>SMTP_ENCRYPTION_KEY_PREVIOUS</code> once this reaches zero.
              </p>

              <p v-else-if="status.encryption.unreadable" class="text-xs text-destructive mt-1">
                No configured key opens these. Re-enter those credentials, or restore the key that
                sealed them to <code>SMTP_ENCRYPTION_KEY_PREVIOUS</code>.
              </p>
            </div>

            <Button
              v-if="canEdit && (status.encryption.sealedStale || status.encryption.unreadable)"
              variant="outline"
              size="sm"
              @click="reencrypt"
              :disabled="reencrypting"
              class="shrink-0"
            >
              <Spinner v-if="reencrypting" />
              Re-encrypt secrets
            </Button>
          </div>
        </div>
      </AppAlert>

      <Empty v-if="!providers.length" class="border bg-card p-8">
        <EmptyDescription>
          No SMTP services configured for {{ selectedApp?.app_name }} yet.
          <span v-if="canEdit">Add one to take it off the environment fallback.</span>
        </EmptyDescription>
      </Empty>

      <!-- Provider list -->
      <Card
        v-for="provider in providers"
        :key="provider.id"
        :class="provider.isActive ? 'ring-2 ring-primary' : ''"
      >
        <CardContent class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <CardTitle class="font-heading font-semibold">{{ provider.name }}</CardTitle>
              <StatusBadge v-if="provider.isActive" tone="success">Active</StatusBadge>
              <StatusBadge v-if="!provider.isEnabled">Disabled</StatusBadge>
              <span class="text-xs text-muted-foreground font-mono">{{ provider.key }}</span>
              <span v-if="!provider.isActive && provider.isEnabled" class="text-xs text-muted-foreground">
                fallback #{{ provider.priority }}
              </span>
            </div>

            <p class="text-sm text-muted-foreground mt-1">
              {{ provider.host }}:{{ provider.port }}
              <span>·</span>
              {{ provider.secure ? 'TLS' : 'STARTTLS' }}
              <template v-if="provider.username">
                <span>·</span> {{ provider.username }}
              </template>
              <span>·</span>
              <span :class="provider.hasPassword ? '' : 'text-destructive'">
                {{ provider.hasPassword ? 'password set' : 'no password' }}
              </span>
            </p>

            <p v-if="provider.fromEmail" class="text-sm text-muted-foreground mt-1">
              From: {{ provider.fromName ? `${provider.fromName} <${provider.fromEmail}>` : provider.fromEmail }}
              <span v-if="provider.extra?.overrideFrom" class="text-xs">
                (overrides the app's own sender)
              </span>
            </p>

            <p v-if="provider.configurationSet" class="text-sm text-muted-foreground mt-1">
              Config set: <span class="font-mono">{{ provider.configurationSet }}</span>
            </p>

            <p
              v-if="provider.lastTestStatus"
              class="text-xs mt-2"
              :class="provider.lastTestStatus === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'"
            >
              Last test {{ provider.lastTestStatus }} · {{ formatDate(provider.lastTestedAt) }}
              <span v-if="provider.lastTestError"> — {{ provider.lastTestError }}</span>
            </p>
          </div>

          <div v-if="canEdit" class="flex items-center gap-2 flex-shrink-0">
            <LoadingIcon v-if="busyId === provider.id" size="xs" />

            <Button
              v-if="!provider.isActive"
              variant="outline"
              size="sm"
              @click="activate(provider)"
              :disabled="busyId !== null || !provider.isEnabled"
              :title="provider.isEnabled ? '' : 'Enable this provider before activating it'"
            >
              Activate
            </Button>

            <Button
              variant="outline"
              size="sm"
              @click="test(provider)"
              :disabled="busyId !== null"
            >
              Test
            </Button>

            <Button
              variant="outline"
              size="sm"
              @click="openEdit(provider)"
              :disabled="busyId !== null"
            >
              Edit
            </Button>

            <Button
              variant="destructive"
              size="sm"
              @click="remove(provider)"
              :disabled="busyId !== null"
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Add / edit form -->
    <Dialog v-model:open="modalOpen">
      <DialogContent class="sm:max-w-2xl max-h-[85vh] overflow-y-auto" :aria-describedby="undefined">
        <DialogHeader>
          <DialogTitle>
            {{ editing ? `Edit ${editing.name}` : 'Add SMTP service' }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          <Field v-if="!editing">
            <FieldLabel for="smtp-preset">Start from</FieldLabel>
            <SelectInput
              id="smtp-preset"
              :model-value="selectedPreset"
              :options="presetOptions"
              select-class="w-full"
              @update:model-value="applyPreset"
            />
            <FieldDescription v-if="presetHint" class="text-xs">{{ presetHint }}</FieldDescription>
          </Field>

          <div class="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel for="smtp-key">Key <span class="text-destructive">*</span></FieldLabel>
              <Input
                id="smtp-key"
                v-model="form.key"
                :disabled="!!editing"
                placeholder="mailtrap"
                class="font-mono"
              />
              <FieldDescription class="text-xs">
                Lowercase slug used in the app's logs. Cannot be changed later.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="smtp-name">Display name</FieldLabel>
              <Input id="smtp-name" v-model="form.name" placeholder="Mailtrap" />
            </Field>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <Field class="col-span-2">
              <FieldLabel for="smtp-host">Host <span class="text-destructive">*</span></FieldLabel>
              <Input id="smtp-host" v-model="form.host" placeholder="live.smtp.mailtrap.io" />
            </Field>

            <Field>
              <FieldLabel for="smtp-port">Port</FieldLabel>
              <Input
                id="smtp-port"
                v-model.number="form.port"
                type="number"
                min="1"
                max="65535"
              />
            </Field>
          </div>

          <Field orientation="horizontal">
            <Checkbox id="smtp-secure" v-model="form.secure" />
            <FieldLabel for="smtp-secure" class="font-normal">
              Implicit TLS (use for port 465; leave off for STARTTLS on 587)
            </FieldLabel>
          </Field>

          <div class="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel for="smtp-username">Username</FieldLabel>
              <Input id="smtp-username" v-model="form.username" autocomplete="off" />
            </Field>

            <Field>
              <FieldLabel for="smtp-password">Password</FieldLabel>
              <Input
                id="smtp-password"
                v-model="form.password"
                type="password"
                autocomplete="new-password"
                :placeholder="editing?.hasPassword ? 'Leave blank to keep the stored password' : ''"
              />
              <FieldDescription class="text-xs">
                Stored encrypted in the app's database and never shown again.
              </FieldDescription>
            </Field>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel for="smtp-from-email">From email</FieldLabel>
              <Input
                id="smtp-from-email"
                v-model="form.fromEmail"
                type="email"
                placeholder="support@axilweb.com"
              />
            </Field>

            <Field>
              <FieldLabel for="smtp-from-name">From name</FieldLabel>
              <Input id="smtp-from-name" v-model="form.fromName" placeholder="FormCRM" />
            </Field>
          </div>

          <Field>
            <FieldLabel for="smtp-reply-to">Reply-To</FieldLabel>
            <Input id="smtp-reply-to" v-model="form.replyTo" type="email" />
            <FieldDescription class="text-xs">Used only when the app does not set one itself.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel for="smtp-configuration-set">SES configuration set</FieldLabel>
            <Input
              id="smtp-configuration-set"
              v-model="form.configurationSet"
              placeholder="my-config-set"
              class="font-mono"
            />
            <FieldDescription class="text-xs">
              Amazon SES only. Sent as the <code>X-SES-CONFIGURATION-SET</code> header, which is
              what turns on SES event publishing (bounces, complaints, deliveries) and any
              dedicated IP pool for this traffic. Leave blank for non-SES services.
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Checkbox id="smtp-override-from" v-model="form.overrideFrom" />
            <FieldContent>
              <FieldLabel for="smtp-override-from" class="font-normal">Force the From email above</FieldLabel>
              <FieldDescription class="text-xs">
                By default the app's own sender address wins. Turn this on when the service only
                accepts senders on its own verified domain.
              </FieldDescription>
            </FieldContent>
          </Field>

          <FieldSet class="border-t pt-4 gap-4">
            <div>
              <FieldLegend variant="label" class="font-semibold">Amazon SES tenant management</FieldLegend>
              <FieldDescription class="text-xs mt-1">
                Optional, SES only. Gives each Shopify store its own SES tenant, so one store's
                bounce rate cannot pause the whole account. Tenant operations are SES
                <b>API</b> calls and need an IAM key pair &mdash; the SMTP credentials above cannot
                call the API. Tenants are region-scoped, so fill this in for every region.
              </FieldDescription>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel for="smtp-aws-region">AWS region</FieldLabel>
                <Input id="smtp-aws-region" v-model="form.awsRegion" placeholder="us-west-1" class="font-mono" />
              </Field>

              <Field>
                <FieldLabel for="smtp-aws-access-key">Access key ID</FieldLabel>
                <Input
                  id="smtp-aws-access-key"
                  v-model="form.awsAccessKeyId"
                  autocomplete="off"
                  placeholder="AKIA..."
                  class="font-mono"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel for="smtp-aws-secret">Secret access key</FieldLabel>
              <Input
                id="smtp-aws-secret"
                v-model="form.awsSecretAccessKey"
                type="password"
                autocomplete="new-password"
                :placeholder="editing?.hasAwsSecret ? 'Leave blank to keep the stored secret' : ''"
              />
              <FieldDescription class="text-xs">
                Needs ses:CreateTenant, ses:CreateTenantResourceAssociation, ses:GetTenant and
                ses:UpdateReputationEntityCustomerManagedStatus. Stored encrypted.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="smtp-identity-arn">Identity ARN</FieldLabel>
              <Input
                id="smtp-identity-arn"
                v-model="form.sesIdentityArn"
                :placeholder="editing?.hasIdentityArn ? 'Stored — leave blank to keep it' : 'arn:aws:ses:us-west-1:123456789012:identity/axilweb.com'"
                class="font-mono"
              />
            </Field>

            <Field>
              <FieldLabel for="smtp-configuration-set-arn">Configuration set ARN</FieldLabel>
              <Input
                id="smtp-configuration-set-arn"
                v-model="form.sesConfigurationSetArn"
                :placeholder="editing?.hasConfigurationSetArn ? 'Stored — leave blank to keep it' : 'arn:aws:ses:us-west-1:123456789012:configuration-set/my-config-set'"
                class="font-mono"
              />
              <FieldDescription class="text-xs">
                Both ARNs are associated with every tenant. SES rejects a tenant send when the
                identity or configuration set is not associated, so leaving these blank creates
                tenants that cannot send.
              </FieldDescription>
            </Field>

            <AppAlert tone="neutral">
              Filling these in makes this provider <b>tenant-required</b>: every send names a
              tenant via <code>X-SES-TENANT</code>. There is no on/off switch, because the
              configuration set uses suppression scope <code>TENANT</code> and SES rejects
              untenanted mail with <code>554 Tenant name is required</code> &mdash; so "off" would
              only mean "no email at all".
            </AppAlert>
          </FieldSet>

          <div class="border-t pt-4 space-y-3">
            <Field orientation="horizontal">
              <Checkbox id="smtp-enabled" v-model="form.isEnabled" />
              <FieldLabel for="smtp-enabled" class="font-normal">
                Enabled (a disabled service cannot be activated)
              </FieldLabel>
            </Field>

            <Field>
              <FieldLabel for="smtp-priority">Failover priority</FieldLabel>
              <Input
                id="smtp-priority"
                v-model.number="form.priority"
                type="number"
                min="0"
                max="9999"
                class="w-32"
              />
              <FieldDescription class="text-xs">
                Order this service is tried in when the active one fails: lower goes first. The
                active service is always attempted before any of these, whatever its own number.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal" :data-disabled="!form.isEnabled">
              <Checkbox id="smtp-active" v-model="form.isActive" :disabled="!form.isEnabled" />
              <FieldLabel for="smtp-active" class="font-normal">
                Make this the active service on save
                <span v-if="activeProvider && !form.isActive" class="text-xs text-muted-foreground">
                  (replaces {{ activeProvider.name }})
                </span>
              </FieldLabel>
            </Field>
          </div>
        </div>

        <DialogFooter class="gap-3">
          <Button
            variant="outline"
            @click="modalOpen = false"
          >
            Cancel
          </Button>
          <Button
            @click="save"
            :disabled="saving"
          >
            <Spinner v-if="saving" />
            {{ saving ? 'Saving...' : 'Save' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
