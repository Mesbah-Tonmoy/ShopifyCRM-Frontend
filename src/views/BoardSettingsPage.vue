<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { LayoutList } from '@lucide/vue';
import AppAlert from '@/components/common/AppAlert.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAppsStore } from '@/stores/apps';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import {
  FEATURE_REQUEST_STATUSES,
  boardSettingsService,
  type BoardConfig,
  type BoardSettings,
  type FeatureRequestStatus,
} from '@/services/featureRequestService';

const appsStore = useAppsStore();

const selectedAppId = ref<number | null>(null);
const config = ref<BoardConfig | null>(null);
const settings = ref<BoardSettings | null>(null);
const loading = ref(false);
const saving = ref(false);
const revealedSecret = ref<string | null>(null);

/**
 * The three address lists behind "new request notifications". Each is stored
 * and edited as one comma-separated string, matching how the mail providers'
 * own cc/bcc settings work.
 */
const RECIPIENT_FIELDS: {
  key: 'new_request_email' | 'new_request_cc' | 'new_request_bcc';
  label: string;
  placeholder: string;
  hint: string;
}[] = [
  {
    key: 'new_request_email',
    label: 'To',
    placeholder: 'team@example.com, product@example.com',
    hint: 'Leave blank to turn new-request notifications off entirely.',
  },
  {
    key: 'new_request_cc',
    label: 'Cc',
    placeholder: 'support@example.com',
    hint: 'Copied in, and visible to everyone else on the email.',
  },
  {
    key: 'new_request_bcc',
    label: 'Bcc',
    placeholder: 'archive@example.com',
    hint: 'Copied in without the other recipients seeing the address.',
  },
];

const countAddresses = (value: string | null | undefined): number =>
  (value ?? '')
    .split(/[,;]+/)
    .map((address) => address.trim())
    .filter(Boolean).length;

const recipientCount = computed(() => countAddresses(settings.value?.new_request_email));

const recipientSummary = computed(() => {
  const parts = [`${recipientCount.value} recipient${recipientCount.value === 1 ? '' : 's'}`];
  const cc = countAddresses(settings.value?.new_request_cc);
  const bcc = countAddresses(settings.value?.new_request_bcc);

  if (cc) parts.push(`${cc} cc`);
  if (bcc) parts.push(`${bcc} bcc`);

  return `Sent to ${parts.join(', ')} on every new request.`;
});

const TOGGLES: {
  key: keyof BoardSettings;
  label: string;
  hint: string;
}[] = [
  { key: 'is_enabled', label: 'Board is live', hint: 'Turn off to take the board down without losing anything.' },
  { key: 'allow_submissions', label: 'Accept new requests', hint: 'Merchants can submit ideas.' },
  { key: 'allow_voting', label: 'Accept votes', hint: 'Merchants can back existing requests.' },
  { key: 'allow_comments', label: 'Allow comments', hint: 'Merchants can discuss a request and you can reply as the team.' },
  {
    key: 'hide_pending_requests',
    label: 'Hide pending requests from the public board',
    hint: 'New requests stay off the board until you publish them from the requests list. Leave off to show every request as soon as it arrives.',
  },
  { key: 'show_vote_counts', label: 'Show vote counts', hint: 'Merchants see how many stores backed each request.' },
  {
    key: 'notify_on_status_change',
    label: 'Email on status change',
    hint: 'Lets status emails go out at all. Each move still asks whether to send one.',
  },
];

onMounted(async () => {
  if (!appsStore.apps.length) await appsStore.fetchApps(1, 100);
  selectedAppId.value = appsStore.apps[0]?.id ?? null;
});

watch(selectedAppId, () => load());

const load = async () => {
  if (!selectedAppId.value) return;

  loading.value = true;
  revealedSecret.value = null;

  try {
    const response = await boardSettingsService.get(selectedAppId.value);
    config.value = response.data;
    settings.value = response.data.settings ? { ...response.data.settings } : null;
  } catch (err) {
    toast.error((err as Error).message || 'Failed to load board settings');
  } finally {
    loading.value = false;
  }
};

const provision = async () => {
  if (!selectedAppId.value) return;

  saving.value = true;

  try {
    const response = await boardSettingsService.provision(selectedAppId.value);
    config.value = response.data;
    settings.value = response.data.settings ? { ...response.data.settings } : null;
    toast.success('Board is ready to embed');
  } catch (err) {
    toast.error((err as Error).message || 'Failed to set up board');
  } finally {
    saving.value = false;
  }
};

const save = async () => {
  if (!selectedAppId.value || !settings.value) return;

  saving.value = true;

  try {
    const response = await boardSettingsService.update(selectedAppId.value, settings.value);
    config.value = response.data;
    settings.value = response.data.settings ? { ...response.data.settings } : null;
    toast.success('Board settings saved');
  } catch (err) {
    toast.error((err as Error).message || 'Failed to save settings');
  } finally {
    saving.value = false;
  }
};

const rotateSecret = async () => {
  if (!selectedAppId.value) return;

  const { confirmed } = await confirmDialog({
    title: 'Rotate the signing secret?',
    description: 'The board stops working until you update the app with the new secret.',
    confirmText: 'Rotate',
    destructive: true,
  });

  if (!confirmed) return;

  try {
    const response = await boardSettingsService.rotateSecret(selectedAppId.value);
    revealedSecret.value = response.data.board_secret;
  } catch (err) {
    toast.error((err as Error).message || 'Failed to rotate secret');
  }
};

/** The roadmap columns currently on, in the order they were switched on (null means all of them). */
const visibleStatuses = computed<FeatureRequestStatus[]>(
  () => settings.value?.visible_statuses ?? FEATURE_REQUEST_STATUSES.map((s) => s.value)
);

/**
 * The toggle group hands back the whole selection: a newly switched-on column
 * is appended, a switched-off one dropped — the same list a single toggle built.
 */
const setVisibleStatuses = (value: unknown) => {
  if (!settings.value || !Array.isArray(value)) return;

  settings.value.visible_statuses = value.filter((status): status is FeatureRequestStatus =>
    FEATURE_REQUEST_STATUSES.some((s) => s.value === status)
  );
};

type TextSetting = 'title' | 'intro' | 'new_request_email' | 'new_request_cc' | 'new_request_bcc';

/** Text inputs hand back what was typed; a field never touched keeps its stored null. */
const setText = (key: TextSetting, value: string | number) => {
  if (settings.value) settings.value[key] = String(value);
};

const setToggle = (key: keyof BoardSettings, value: boolean) => {
  if (settings.value) (settings.value[key] as boolean) = value;
};

const copy = async (value: string, what: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — select the text manually');
  }
};

/**
 * What the Shopify app needs to add. The secret stays server-side; only the
 * short-lived token it signs ever reaches the browser.
 */
const embedSnippet = computed(() => {
  if (!config.value?.board_public_key) return '';

  return `// 1. Store these in your Shopify app's .env
CRM_BOARD_KEY=${config.value.board_public_key}
CRM_BOARD_SECRET=<shown once when you rotate it>

// 2. Sign a short-lived token server-side
$payload = rtrim(strtr(base64_encode(json_encode([
    'key'   => env('CRM_BOARD_KEY'),
    'shop'  => $shop->domain,          // acme.myshopify.com
    'name'  => $shop->name,            // optional
    'email' => $shop->email,           // optional
    'iat'   => time(),
    'exp'   => time() + 300,
])), '+/', '-_'), '=');

$token = $payload . '.' . hash_hmac('sha256', $payload, env('CRM_BOARD_SECRET'));

// 3. Embed the board
<iframe src="${config.value.board_url}?token={{ $token }}&embed=1"
        style="width:100%;height:900px;border:0"></iframe>`;
});
</script>

<template>
  <div>
    <PageHeader title="Board Settings" description="Set up the feature request board each of your apps embeds.">
      <template #actions>
        <Button as-child variant="outline" size="sm">
          <router-link :to="{ name: 'feature-requests' }">
            Back to requests
          </router-link>
        </Button>
      </template>
    </PageHeader>

    <div class="mb-5">
      <SelectInput v-model="selectedAppId" :options="appsStore.appOptions" label="App" select-class="w-64" />
    </div>

    <div v-if="loading" class="space-y-3">
      <SkeletonLoader v-for="n in 5" :key="n" height="3rem" />
    </div>

    <!-- not set up yet -->
    <Card v-else-if="config && !config.provisioned" class="py-0">
      <Empty class="p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayoutList />
          </EmptyMedia>
          <EmptyTitle class="font-heading text-base font-semibold">This app has no board yet</EmptyTitle>
          <EmptyDescription class="max-w-md">
            Generate a public URL and signing credentials so {{ config.app.app_name }} can embed its feature request board.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            :disabled="saving"
            @click="provision"
          >
            Set up board
          </Button>
        </EmptyContent>
      </Empty>
    </Card>

    <div v-else-if="config && settings" class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- settings -->
      <div class="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle class="font-heading font-semibold">Presentation</CardTitle>
          </CardHeader>

          <CardContent>
            <FieldGroup class="gap-5">
              <Field>
                <FieldLabel for="board-title">Suggestion form title</FieldLabel>
                <Input
                  id="board-title"
                  :model-value="settings.title ?? ''"
                  type="text"
                  maxlength="255"
                  placeholder="Suggest a feature"
                  @update:model-value="(value: string | number) => setText('title', value)"
                />
                <FieldDescription>Heading on the submission card merchants fill in.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel for="board-intro">Suggestion form intro</FieldLabel>
                <Textarea
                  id="board-intro"
                  :model-value="settings.intro ?? ''"
                  rows="2"
                  maxlength="2000"
                  placeholder="Tell us what would make this app work better for your store."
                  @update:model-value="(value: string | number) => setText('intro', value)"
                />
              </Field>

              <FieldSet class="gap-3">
                <FieldLegend variant="label">Roadmap columns</FieldLegend>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  :spacing="2"
                  class="flex-wrap"
                  :model-value="visibleStatuses"
                  @update:model-value="setVisibleStatuses"
                >
                  <ToggleGroupItem
                    v-for="status in FEATURE_REQUEST_STATUSES"
                    :key="status.value"
                    :value="status.value"
                    class="data-[state=on]:border-primary/40 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                  >
                    {{ status.label }}
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>Only the selected columns appear on the public roadmap.</FieldDescription>
              </FieldSet>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="font-heading font-semibold">Behaviour</CardTitle>
          </CardHeader>

          <CardContent>
            <FieldGroup class="gap-4">
              <Field
                v-for="toggle in TOGGLES"
                :key="String(toggle.key)"
                orientation="horizontal"
              >
                <Switch
                  :id="`board-toggle-${String(toggle.key)}`"
                  :model-value="Boolean(settings[toggle.key])"
                  @update:model-value="(value: boolean) => setToggle(toggle.key, value)"
                />
                <FieldContent>
                  <FieldLabel :for="`board-toggle-${String(toggle.key)}`">{{ toggle.label }}</FieldLabel>
                  <FieldDescription>{{ toggle.hint }}</FieldDescription>
                </FieldContent>
              </Field>

              <Field orientation="horizontal" class="pt-2">
                <FieldLabel for="limit" class="font-normal">Requests per store per day</FieldLabel>
                <Input
                  id="limit"
                  v-model.number="settings.submission_limit_per_day"
                  type="number"
                  min="0"
                  max="100"
                  class="w-20 tabular-nums"
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Button
          size="lg"
          :disabled="saving"
          @click="save"
        >
          Save settings
        </Button>
      </div>

      <!-- credentials + embed -->
      <div class="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle class="font-heading font-semibold">New request notifications</CardTitle>
            <CardDescription>
              Who on your team hears about it when a merchant submits a request. Separate
              several addresses with commas.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <FieldGroup class="gap-5">
              <Field v-for="field in RECIPIENT_FIELDS" :key="String(field.key)">
                <FieldLabel :for="`new-request-${field.key}`">{{ field.label }}</FieldLabel>
                <Input
                  :id="`new-request-${field.key}`"
                  :model-value="settings[field.key] ?? ''"
                  type="text"
                  :placeholder="field.placeholder"
                  @update:model-value="(value: string | number) => setText(field.key, value)"
                />
                <FieldDescription>{{ field.hint }}</FieldDescription>
              </Field>

              <AppAlert
                v-if="!recipientCount && (settings.new_request_cc || settings.new_request_bcc)"
                tone="warning"
              >
                Nothing will be sent while <strong>To</strong> is empty - a cc or bcc on its own
                is not enough.
              </AppAlert>
              <p v-else-if="!recipientCount" class="text-[13px] text-muted-foreground">
                Notifications are off. Add an address to <strong>To</strong> to turn them on.
              </p>
              <p v-else class="text-[13px] text-foreground">
                {{ recipientSummary }}
              </p>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="font-heading font-semibold">Credentials</CardTitle>
          </CardHeader>

          <CardContent class="space-y-4">
            <Field class="gap-1.5">
              <FieldTitle>Board URL</FieldTitle>
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-lg bg-muted px-2 py-1.5 font-mono text-xs text-foreground">{{ config.board_url }}</code>
                <Button variant="link" size="xs" class="h-auto p-0" @click="copy(config.board_url ?? '', 'URL')">Copy</Button>
              </div>
            </Field>

            <Field class="gap-1.5">
              <FieldTitle>Public key</FieldTitle>
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-lg bg-muted px-2 py-1.5 font-mono text-xs text-foreground">{{ config.board_public_key }}</code>
                <Button variant="link" size="xs" class="h-auto p-0" @click="copy(config.board_public_key ?? '', 'Key')">Copy</Button>
              </div>
            </Field>

            <Field class="gap-1.5">
              <FieldTitle>Signing secret</FieldTitle>
              <AppAlert v-if="revealedSecret" tone="warning" title="Copy it now — it is not shown again.">
                <code class="mt-1 block break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-xs text-foreground">{{ revealedSecret }}</code>
                <template #action>
                  <Button variant="link" size="xs" class="h-auto p-0" @click="copy(revealedSecret, 'Secret')">Copy</Button>
                </template>
              </AppAlert>
              <FieldDescription v-else class="text-xs">Hidden. Rotate to reveal a new one.</FieldDescription>
              <div>
                <Button variant="destructive" size="sm" class="mt-1" @click="rotateSecret">
                  Rotate secret
                </Button>
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="font-heading font-semibold">Embed</CardTitle>
            <CardAction>
              <Button variant="link" size="xs" class="h-auto p-0" @click="copy(embedSnippet, 'Snippet')">Copy</Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <pre class="custom-scrollbar max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-foreground"><code>{{ embedSnippet }}</code></pre>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
