import type { Permission } from '@/services/aclService';

export interface PermissionGroup {
  key: string;
  title: string;
  permissions: Permission[];
}

/** Display names for slug prefixes; anything else is title-cased from the slug. */
const GROUP_TITLES: Record<string, string> = {
  roles: 'Roles',
  permissions: 'Permission Groups',
  users: 'Users',
  apps: 'Apps',
  installations: 'Installations',
  email_templates: 'Email Templates',
  pricing_plans: 'Pricing Plans',
  integrations: 'Integrations',
  features: 'Features',
  smtp: 'SMTP Setup',
  ses_tenants: 'SES Tenants',
  feature_requests: 'Feature Requests',
  board_settings: 'Board Settings',
};

const titleFor = (key: string) =>
  GROUP_TITLES[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

/**
 * Groups permissions by slug prefix ("users.view" → users), in first-seen order.
 * Pass `keys` to keep only those groups, in that order.
 */
export function groupPermissions(permissions: Permission[], keys?: string[]): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();

  for (const permission of permissions) {
    const key = permission.slug.split('.')[0] || 'other';
    if (!groups.has(key)) groups.set(key, { key, title: titleFor(key), permissions: [] });
    groups.get(key)!.permissions.push(permission);
  }

  if (!keys) return [...groups.values()];
  return keys.map((key) => groups.get(key)).filter((group): group is PermissionGroup => !!group);
}
