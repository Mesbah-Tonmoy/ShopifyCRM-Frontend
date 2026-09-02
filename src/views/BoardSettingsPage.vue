<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import PageHeader from '@/components/common/PageHeader.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import { useAppsStore } from '@/stores/apps';
import { Toast } from '@/utils/toast';
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

const TOGGLES: { key: keyof BoardSettings; label: string; hint: string }[] = [
  { key: 'is_enabled', label: 'Board is live', hint: 'Turn off to take the board down without losing anything.' },
  { key: 'allow_submissions', label: 'Accept new requests', hint: 'Merchants can submit ideas.' },
  { key: 'allow_voting', label: 'Accept votes', hint: 'Merchants can back existing requests.' },
  { key: 'allow_comments', label: 'Allow comments', hint: 'Merchants can discuss a request and you can reply as the team.' },
  {
    key: 'require_approval',
    label: 'Review before publishing',
    hint: 'New requests stay hidden until you approve them. Turn this off to show the Pending column on the public board.',
  },
  { key: 'show_vote_counts', label: 'Show vote counts', hint: 'Merchants see how many stores backed each request.' },
  { key: 'notify_on_status_change', label: 'Email on status change', hint: 'Tell merchants when something they backed moves.' },
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
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to load board settings' });
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
    Toast.fire({ icon: 'success', title: 'Board is ready to embed' });
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to set up board' });
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
    Toast.fire({ icon: 'success', title: 'Board settings saved' });
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to save settings' });
  } finally {
    saving.value = false;
  }
};

const rotateSecret = async () => {
  if (!selectedAppId.value) return;

  const confirmed = await Swal.fire({
    icon: 'warning',
    title: 'Rotate the signing secret?',
    text: 'The board stops working until you update the app with the new secret.',
    showCancelButton: true,
    confirmButtonText: 'Rotate',
    confirmButtonColor: '#F83939',
  });

  if (!confirmed.isConfirmed) return;

  try {
    const response = await boardSettingsService.rotateSecret(selectedAppId.value);
    revealedSecret.value = response.data.board_secret;
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to rotate secret' });
  }
};

const toggleStatus = (status: FeatureRequestStatus) => {
  if (!settings.value) return;

  const current = settings.value.visible_statuses ?? FEATURE_REQUEST_STATUSES.map((s) => s.value);

  settings.value.visible_statuses = current.includes(status)
    ? current.filter((value) => value !== status)
    : [...current, status];
};

const isStatusVisible = (status: FeatureRequestStatus): boolean =>
  (settings.value?.visible_statuses ?? FEATURE_REQUEST_STATUSES.map((s) => s.value)).includes(status);

const copy = async (value: string, what: string) => {
  try {
    await navigator.clipboard.writeText(value);
    Toast.fire({ icon: 'success', title: `${what} copied` });
  } catch {
    Toast.fire({ icon: 'error', title: 'Copy failed — select the text manually' });
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
        <router-link
          :to="{ name: 'feature-requests' }"
          class="rounded-sm border border-grey px-3 py-2 text-b5 font-semibold text-mid hover:bg-lighter"
        >
          Back to requests
        </router-link>
      </template>
    </PageHeader>

    <div class="mb-5">
      <SelectInput v-model="selectedAppId" label="App" select-class="w-64">
        <option v-for="app in appsStore.apps" :key="app.id" :value="app.id">{{ app.app_name }}</option>
      </SelectInput>
    </div>

    <div v-if="loading" class="space-y-3">
      <SkeletonLoader v-for="n in 5" :key="n" height="3rem" />
    </div>

    <!-- not set up yet -->
    <div v-else-if="config && !config.provisioned" class="rounded-lg border border-lighter bg-white p-8 text-center">
      <h2 class="text-h4 font-semibold text-dark">This app has no board yet</h2>
      <p class="mx-auto mt-1 max-w-md text-b4 text-mid">
        Generate a public URL and signing credentials so {{ config.app.app_name }} can embed its feature request board.
      </p>
      <button
        class="mt-4 rounded-sm bg-primary px-4 py-2 text-b4 font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        :disabled="saving"
        @click="provision"
      >
        Set up board
      </button>
    </div>

    <div v-else-if="config && settings" class="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <!-- settings -->
      <div class="space-y-5 lg:col-span-2">
        <section class="rounded-lg border border-lighter bg-white p-5">
          <h2 class="mb-4 text-h4 font-semibold text-dark">Presentation</h2>

          <div class="space-y-4">
            <div>
              <label for="board-title" class="mb-1.5 block text-b6 font-semibold tracking-wide text-light uppercase">
                Suggestion form title
              </label>
              <input
                id="board-title"
                v-model="settings.title"
                type="text"
                maxlength="255"
                placeholder="Suggest a feature"
                class="w-full rounded-sm border border-grey px-3 py-2 text-b4 focus:border-primary focus:outline-none"
              />
              <p class="mt-1 text-b6 text-light">Heading on the submission card merchants fill in.</p>
            </div>

            <div>
              <label for="board-intro" class="mb-1.5 block text-b6 font-semibold tracking-wide text-light uppercase">
                Suggestion form intro
              </label>
              <textarea
                id="board-intro"
                v-model="settings.intro"
                rows="2"
                maxlength="2000"
                placeholder="Tell us what would make this app work better for your store."
                class="w-full rounded-sm border border-grey px-3 py-2 text-b4 focus:border-primary focus:outline-none"
              ></textarea>
            </div>

            <div>
              <span class="mb-2 block text-b6 font-semibold tracking-wide text-light uppercase">Roadmap columns</span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="status in FEATURE_REQUEST_STATUSES"
                  :key="status.value"
                  class="rounded-full border px-3 py-1.5 text-b5 font-semibold transition"
                  :class="isStatusVisible(status.value)
                    ? 'border-primary bg-teal-light text-primary'
                    : 'border-grey text-light hover:text-mid'"
                  @click="toggleStatus(status.value)"
                >
                  {{ status.label }}
                </button>
              </div>
              <p class="mt-1.5 text-b6 text-light">Only the selected columns appear on the public roadmap.</p>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-lighter bg-white p-5">
          <h2 class="mb-4 text-h4 font-semibold text-dark">Behaviour</h2>

          <div class="space-y-3">
            <label v-for="toggle in TOGGLES" :key="String(toggle.key)" class="flex items-start gap-3">
              <input
                type="checkbox"
                class="mt-1 h-4 w-4 accent-primary"
                :checked="Boolean(settings[toggle.key])"
                @change="(settings[toggle.key] as boolean) = ($event.target as HTMLInputElement).checked"
              />
              <span>
                <span class="block text-b4 font-semibold text-dark">{{ toggle.label }}</span>
                <span class="block text-b6 text-light">{{ toggle.hint }}</span>
              </span>
            </label>

            <div class="flex items-center gap-3 pt-2">
              <label for="limit" class="text-b4 text-mid">Requests per store per day</label>
              <input
                id="limit"
                v-model.number="settings.submission_limit_per_day"
                type="number"
                min="0"
                max="100"
                class="w-20 rounded-sm border border-grey px-3 py-1.5 text-b4 tabular-nums focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </section>

        <button
          class="rounded-sm bg-primary px-5 py-2.5 text-b4 font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          Save settings
        </button>
      </div>

      <!-- credentials + embed -->
      <div class="space-y-5">
        <section class="rounded-lg border border-lighter bg-white p-5">
          <h2 class="mb-3 text-h4 font-semibold text-dark">Credentials</h2>

          <div class="space-y-3">
            <div>
              <span class="mb-1 block text-b6 font-semibold tracking-wide text-light uppercase">Board URL</span>
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-sm bg-artboard px-2 py-1.5 text-b6 text-dark">{{ config.board_url }}</code>
                <button class="text-b6 font-semibold text-primary" @click="copy(config.board_url ?? '', 'URL')">Copy</button>
              </div>
            </div>

            <div>
              <span class="mb-1 block text-b6 font-semibold tracking-wide text-light uppercase">Public key</span>
              <div class="flex items-center gap-2">
                <code class="flex-1 truncate rounded-sm bg-artboard px-2 py-1.5 text-b6 text-dark">{{ config.board_public_key }}</code>
                <button class="text-b6 font-semibold text-primary" @click="copy(config.board_public_key ?? '', 'Key')">Copy</button>
              </div>
            </div>

            <div>
              <span class="mb-1 block text-b6 font-semibold tracking-wide text-light uppercase">Signing secret</span>
              <div v-if="revealedSecret" class="rounded-sm border border-warning bg-yellow-50 p-2">
                <code class="block break-all text-b6 text-dark">{{ revealedSecret }}</code>
                <p class="mt-1 text-b6 text-mid">Copy it now — it is not shown again.</p>
                <button class="mt-1 text-b6 font-semibold text-primary" @click="copy(revealedSecret, 'Secret')">Copy</button>
              </div>
              <p v-else class="text-b6 text-light">Hidden. Rotate to reveal a new one.</p>
              <button class="mt-2 rounded-sm border border-grey px-3 py-1.5 text-b6 font-semibold text-mid hover:border-error hover:text-error" @click="rotateSecret">
                Rotate secret
              </button>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-lighter bg-white p-5">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-h4 font-semibold text-dark">Embed</h2>
            <button class="text-b6 font-semibold text-primary" @click="copy(embedSnippet, 'Snippet')">Copy</button>
          </div>
          <pre class="custom-scrollbar max-h-96 overflow-auto rounded-sm bg-artboard p-3 text-b6 leading-relaxed text-mid"><code>{{ embedSnippet }}</code></pre>
        </section>
      </div>
    </div>
  </div>
</template>
