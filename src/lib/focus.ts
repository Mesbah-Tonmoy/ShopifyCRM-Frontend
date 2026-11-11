const TABBABLE = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'button:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * `@open-auto-focus` handler for dialogs and sheets. Reka focuses the first
 * field and also selects its text, which highlights the current value on
 * every edit form; this focuses the same field without selecting anything.
 * A page that handles the event itself (and prevents it) keeps its own focus.
 */
export function focusFirstWithoutSelecting(event: Event) {
  if (event.defaultPrevented) return;
  event.preventDefault();

  const container = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  container?.querySelector<HTMLElement>(TABBABLE)?.focus({ preventScroll: true });
}
