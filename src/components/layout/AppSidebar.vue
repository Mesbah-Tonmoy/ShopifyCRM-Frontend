<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';
import {
  Blocks,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FolderOpen,
  Layers,
  LayoutDashboard,
  Mail,
  MessageSquareText,
  Server,
  Sparkles,
  Users,
  Zap,
} from '@lucide/vue';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';

interface NavLink {
  title: string;
  to: RouteLocationRaw;
  isActive: boolean;
  permission?: string;
}

type NavItem =
  | (NavLink & { icon: Component; children?: undefined })
  | { title: string; icon: Component; permission?: string; children: NavLink[] };

const route = useRoute();
const authStore = useAuthStore();
const appsStore = useAppsStore();
const { state, setOpen } = useSidebar();

const can = (permission?: string) => !permission || authStore.hasPermission(permission);

const link = (title: string, name: string, permission?: string): NavLink => ({
  title,
  to: { name },
  isActive: route.name === name,
  permission,
});

const navigation = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { ...link('Dashboard', 'dashboard'), icon: LayoutDashboard },
    { ...link('Apps', 'apps', 'apps.view'), icon: Blocks },
    { ...link('Email Templates', 'email-templates', 'email_templates.view'), icon: Mail },
    { ...link("What's New", 'features', 'features.view'), icon: Sparkles },
    { ...link('Pricing Plan', 'pricing-plan', 'pricing_plans.view'), icon: CircleDollarSign },
    { ...link('Integrations', 'integrations', 'integrations.view'), icon: Zap },
    { ...link('SMTP Setup', 'smtp-setup', 'smtp.view'), icon: Server },
    { ...link('SES Tenants', 'ses-tenants', 'ses_tenants.view'), icon: Building2 },
    {
      title: 'Feature Requests',
      icon: MessageSquareText,
      children: [
        link('All Requests', 'feature-requests', 'feature_requests.view'),
        link('Board Settings', 'board-settings', 'board_settings.edit'),
      ],
    },
    {
      title: 'Installation List',
      icon: FolderOpen,
      permission: 'installations.view',
      children: [
        {
          title: 'All Installations',
          to: { name: 'installations' },
          isActive: route.name === 'installations' && !route.query.app_id,
        },
        ...appsStore.apps.map((app) => ({
          title: app.app_name,
          to: { name: 'installations', query: { app_id: app.id } },
          isActive: route.name === 'installations' && route.query.app_id === String(app.id),
        })),
      ],
    },
    {
      title: 'Accounts',
      icon: Users,
      children: [
        link('Users', 'accounts-users', 'users.view'),
        link('Permissions', 'accounts-permissions', 'permissions.view'),
        link('Roles', 'accounts-roles', 'roles.view'),
      ],
    },
  ];

  return items
    .filter((item) => can(item.permission))
    .map((item) => (item.children ? { ...item, children: item.children.filter((child) => can(child.permission)) } : item))
    .filter((item) => !item.children || item.children.length > 0);
});

// The theme's sidebar-accent is barely darker than the sidebar and is also the hover
// colour, so the current page gets a firmer fill of its own.
const ACTIVE = 'data-active:bg-sidebar-foreground/10 data-active:font-semibold';

/** Which sub-menus are open, keyed by title. */
const expanded = ref<Record<string, boolean>>({});

const hasActiveChild = (item: NavItem) => !!item.children?.some((child) => child.isActive);

// Open the sub-menu holding the current page, so it is visible after navigating or reloading.
watch(
  navigation,
  (items) => {
    for (const item of items) {
      if (hasActiveChild(item)) expanded.value[item.title] = true;
    }
  },
  { immediate: true }
);

const toggleGroup = (title: string) => {
  // Sub-menus are hidden in the icon rail, so a click there expands the sidebar onto them.
  if (state.value === 'collapsed') {
    setOpen(true);
    expanded.value[title] = true;
    return;
  }
  expanded.value[title] = !expanded.value[title];
};

onMounted(() => {
  appsStore.fetchApps(1, 100);
});
</script>

<template>
  <Sidebar collapsible="icon">
    <!-- Same height as AppHeader, so its bottom border continues the header's line -->
    <SidebarHeader class="h-16 justify-center border-b border-sidebar-border">
      <SidebarMenu class="group-data-[collapsible=icon]:items-center">
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink :to="{ name: 'dashboard' }">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Layers />
              </div>
              <span class="font-heading text-base font-semibold">Shopify CRM</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu class="group-data-[collapsible=icon]:items-center">
          <template v-for="item in navigation" :key="item.title">
            <Collapsible
              v-if="item.children"
              as-child
              :open="expanded[item.title]"
              class="group/collapsible"
            >
              <SidebarMenuItem>
                <SidebarMenuButton
                  :class="ACTIVE"
                  :tooltip="item.title"
                  :is-active="hasActiveChild(item) && (!expanded[item.title] || state === 'collapsed')"
                  :aria-expanded="!!expanded[item.title]"
                  @click="toggleGroup(item.title)"
                >
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                  <ChevronRight class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="child in item.children" :key="child.title">
                      <SidebarMenuSubButton as-child :class="ACTIVE" :is-active="child.isActive">
                        <RouterLink :to="child.to">
                          <span>{{ child.title }}</span>
                        </RouterLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            <SidebarMenuItem v-else>
              <SidebarMenuButton as-child :class="ACTIVE" :tooltip="item.title" :is-active="item.isActive">
                <RouterLink :to="item.to">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </template>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>

    <SidebarRail />
  </Sidebar>
</template>
