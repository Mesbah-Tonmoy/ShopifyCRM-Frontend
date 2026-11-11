import { computed, watchEffect } from 'vue';
import { usePreferredDark, useStorage } from '@vueuse/core';
import type { Router } from 'vue-router';

export type ColorMode = 'light' | 'dark' | 'system';

/**
 * Must match the inline script in index.html, which applies the saved mode
 * before the app loads so a dark page never flashes white.
 */
const COLOR_MODE_STORAGE_KEY = 'crm_color_mode';

// Module-level, so every component shares one setting.
const mode = useStorage<ColorMode>(COLOR_MODE_STORAGE_KEY, 'system');
const prefersDark = usePreferredDark();
const isDark = computed(() => mode.value === 'dark' || (mode.value === 'system' && prefersDark.value));

/** The admin's light/dark/system setting, saved per browser. */
export function useColorMode() {
  return { mode, isDark };
}

/**
 * Keeps the `dark` class on <html> in step with the setting. The merchant
 * board (/board/…) is embedded in Shopify's admin and has its own theme
 * switch, so the admin's mode never applies there.
 */
export function applyColorMode(router: Router) {
  watchEffect(() => {
    const onBoard = router.currentRoute.value.path.startsWith('/board/');
    document.documentElement.classList.toggle('dark', isDark.value && !onBoard);
  });
}
