/**
 * Status tones shared by StatusBadge, AppAlert and status dots, so "success"
 * or "warning" looks the same on every page. Each entry carries its dark-mode
 * colours, so these stay readable once the dark theme is switched on.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Soft tinted surface with readable text — badges and chips. */
export const toneBadgeClasses: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive',
};

/** Bordered banner surface — inline alerts and notices. */
export const toneAlertClasses: Record<Tone, string> = {
  neutral: 'border-border bg-muted/50 text-foreground',
  info: 'border-sky-500/25 bg-sky-500/5 text-sky-900 dark:text-sky-200',
  success: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200',
  danger: 'border-destructive/30 bg-destructive/5 text-destructive',
};

/** Solid fill — small status dots. */
export const toneDotClasses: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/60',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-destructive',
};
