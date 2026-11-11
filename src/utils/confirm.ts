import { shallowRef } from 'vue';

/**
 * App-wide confirm/alert prompt, rendered by <ConfirmDialogHost> in App.vue.
 *
 *   const { confirmed } = await confirmDialog({ title: 'Delete app?', destructive: true });
 *   const { confirmed, value } = await confirmDialog({ title: 'Pause sending', input: { type: 'textarea' } });
 */

export interface ConfirmInput {
  type: 'text' | 'textarea' | 'select' | 'checkbox';
  /** Field label; for a checkbox, the text beside it. */
  label?: string;
  placeholder?: string;
  /** Choices for `select`. */
  options?: { value: string; label: string }[];
  initialValue?: string | boolean;
  /** Return a message to block confirming, or null to allow it. */
  validate?: (value: string | boolean) => string | null;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  /**
   * Rich body, rendered with v-html. App-authored markup only: pass any
   * interpolated data (shop names, server messages) through escapeHtml().
   */
  html?: string;
  confirmText?: string;
  /** `false` shows only the confirm button, for an acknowledgement. */
  cancelText?: string | false;
  /** Red confirm button, for actions that delete or stop something. */
  destructive?: boolean;
  /** Wider dialog, for long multi-step explanations. */
  wide?: boolean;
  input?: ConfirmInput;
}

export interface ConfirmResult {
  confirmed: boolean;
  /** The input's value when `input` was given: string, or boolean for a checkbox. */
  value?: string | boolean;
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void;
}

export const pendingConfirm = shallowRef<PendingConfirm | null>(null);

export function confirmDialog(options: ConfirmOptions): Promise<ConfirmResult> {
  // Only one prompt at a time; one still open counts as cancelled.
  pendingConfirm.value?.resolve({ confirmed: false });

  return new Promise((resolve) => {
    pendingConfirm.value = { ...options, resolve };
  });
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
