<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// Self-hosted rather than fetched from Google: the board is already a nested
// iframe, and a third-party font host would add a DNS lookup and a TLS
// handshake before any text settles. Imported here so the face is only
// downloaded on a board page, leaving the CRM's own font alone.
import '@fontsource-variable/inter';
import '@/assets/css/board.css';
import BoardSubmitModal from '@/components/board/BoardSubmitModal.vue';
import {
  BoardSessionExpired,
  boardService,
  boardSession,
  type BoardConfigResponse,
  type BoardRequest,
} from '@/services/boardService';
import { BOARD_CONTEXT, type BoardContext } from '@/composables/useBoardContext';

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.slug ?? ''));
/**
 * Whether the board is running inside a host app rather than standing alone.
 *
 * Detected from actually being framed, so it holds even when the embed snippet
 * omits the flag. `?embed=1` forces it, which is handy for testing.
 */
const isFramed = window.parent !== window;
const embedded = computed(() => route.query.embed === '1' || isFramed);

const config = ref<BoardConfigResponse | null>(null);
const loading = ref(true);
const fatalError = ref<string | null>(null);
const notice = ref<string | null>(null);
const theme = ref<'light' | 'dark' | null>(null);
const submitOpen = ref(false);

const THEME_KEY = 'board_theme';

const canWrite = computed(() => Boolean(config.value?.voter));
const canSubmit = computed(() => Boolean(config.value?.board.allow_submissions) && canWrite.value);

/**
 * Shared with the child views so they never need to know how the session was
 * obtained, only whether the merchant is allowed to act.
 */
const context: BoardContext = {
  slug,
  config,
  canWrite,
  canSubmit,
  notify: (message: string) => {
    notice.value = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => (notice.value = null), 2600);
  },
  handleError: (error: unknown) => {
    if (error instanceof BoardSessionExpired) {
      if (config.value) config.value.voter = null;
      context.notify(error.message);
      return;
    }

    context.notify((error as Error).message || 'Something went wrong.');
  },
  refreshCounts: async () => {
    try {
      config.value = await boardService.getConfig(slug.value);
    } catch {
      // Counts are cosmetic; a failure here should not disturb the board.
    }
  },
  openSubmitForm: () => (submitOpen.value = true),
  lastCreated: ref<BoardRequest | null>(null),
  lastUpdated: ref<BoardRequest | null>(null),
};

provide(BOARD_CONTEXT, context);

let noticeTimer = 0;

/**
 * The palette is keyed off `data-theme` alone, so the OS preference is resolved
 * here rather than in a second copy of the token set behind a media query.
 */
const resolveTheme = (): 'light' | 'dark' => {
  // The admin renders light, so an embedded board follows it rather than the
  // merchant's OS setting.
  if (embedded.value) return 'light';

  const stored = localStorage.getItem(THEME_KEY);

  if (stored === 'light' || stored === 'dark') return stored;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

onMounted(async () => {
  theme.value = resolveTheme();
  await bootstrap();
  reportHeight();
  window.addEventListener('resize', reportHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', reportHeight);
  window.clearTimeout(noticeTimer);
  resizeObserver?.disconnect();
});

/**
 * Trade the app-signed token for a board session, then drop it from the URL so
 * it is not left sitting in history or copied into a shared link.
 */
const bootstrap = async () => {
  loading.value = true;

  try {
    const token = typeof route.query.token === 'string' ? route.query.token : null;

    if (token) {
      const session = await boardService.createSession(token);
      boardSession.set(slug.value, session.session);

      const query = { ...route.query };
      delete query.token;
      await router.replace({ query });
    }

    config.value = await boardService.getConfig(slug.value);
  } catch (error) {
    if (error instanceof BoardSessionExpired) {
      // A dead session should not hide a publicly browsable board.
      try {
        config.value = await boardService.getConfig(slug.value);
      } catch (inner) {
        fatalError.value = (inner as Error).message;
      }
    } else {
      fatalError.value = (error as Error).message || 'This board is not available.';
    }
  } finally {
    loading.value = false;
  }
};

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme.value);
};

/**
 * Tell the embedding app how tall the board is, so the iframe can grow with it
 * instead of showing a nested scrollbar.
 */
let resizeObserver: ResizeObserver | null = null;

const reportHeight = () => {
  if (window.parent === window) return;

  const height = document.body.scrollHeight;
  window.parent.postMessage({ type: 'zapio-board:height', slug: slug.value, height }, '*');
};

onMounted(() => {
  if (window.parent === window || typeof ResizeObserver === 'undefined') return;

  resizeObserver = new ResizeObserver(() => reportHeight());
  resizeObserver.observe(document.body);
});

watch(() => route.fullPath, () => reportHeight());
</script>

<template>
  <div
    class="board-root"
    :data-theme="theme ?? undefined"
    :data-embedded="embedded ? 'true' : undefined"
  >
    <!--
      Standalone chrome only. The roadmap carries the voter pill and the
      primary action itself, so an embedded board renders no bar at all and
      starts at the page heading, sitting directly on the admin's own.
    -->
    <header
      v-if="!embedded"
      class="sticky top-0 z-20 flex h-14 items-center gap-5 px-4"
      style="background: var(--bd-surface); border-bottom: 1px solid var(--bd-border)"
    >
      <div class="flex shrink-0 items-center gap-2.5">
        <img
          v-if="config?.app.icon"
          :src="config.app.icon"
          alt=""
          class="h-7 w-7 rounded-[7px] object-cover"
        />
        <div
          v-else
          class="grid h-7 w-7 place-items-center rounded-[7px] text-xs font-bold"
          style="background: var(--bd-accent); color: var(--bd-accent-on)"
        >
          {{ (config?.app.name ?? 'B').charAt(0).toUpperCase() }}
        </div>
        <span class="hidden text-[15px] font-semibold whitespace-nowrap sm:block">
          {{ config?.app.name ?? 'Feature board' }}
        </span>
      </div>

      <button
        type="button"
        class="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-[7px] transition"
        style="color: var(--bd-ink-mid)"
        aria-label="Switch theme"
        @click="toggleTheme"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-[17px] w-[17px]">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </button>
    </header>

    <!-- states -->
    <div v-if="loading" class="mx-auto max-w-[1600px] px-4 py-16 text-center text-[14px]" style="color: var(--bd-ink-soft)">
      Loading board…
    </div>

    <div v-else-if="fatalError" class="mx-auto max-w-md px-4 py-20 text-center">
      <h1 class="text-[20px] font-semibold">This board isn’t available</h1>
      <p class="mt-1.5 text-[14px]" style="color: var(--bd-ink-mid)">{{ fatalError }}</p>
    </div>

    <main v-else class="mx-auto max-w-[1600px] px-4 pt-8 pb-16">
      <router-view />
    </main>

    <footer
      v-if="!loading && !fatalError && !embedded"
      class="mx-auto flex max-w-[1600px] flex-wrap gap-3 px-4 pb-10 text-[12.5px]"
      style="color: var(--bd-ink-soft)"
    >
      <span>One vote per store. Your shop domain is never shown to other merchants.</span>
    </footer>

    <!-- Hosted above the router view so it survives a reload of the board below. -->
    <BoardSubmitModal :open="submitOpen" @close="submitOpen = false" />

    <!-- toast -->
    <transition name="board-toast">
      <div
        v-if="notice"
        class="board-toast fixed bottom-5 left-1/2 z-50 -translate-x-1/2"
        role="status"
      >
        {{ notice }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.board-toast-enter-active,
.board-toast-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.board-toast-enter-from,
.board-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}
</style>
