<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import ChevronDown from '@/components/icons/ChevronDown.vue';

const authStore = useAuthStore();

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  'update:collapsed': [value: boolean];
}>();

const route = useRoute();
const appsStore = useAppsStore();
const accountsExpanded = ref(false);
const installationsExpanded = ref(false);

const autoExpandActiveMenus = () => {
  if (isAccountsActive.value) {
    accountsExpanded.value = true;
  }
  if (isInstallationsActive.value) {
    installationsExpanded.value = true;
  }
};

onMounted(() => {
  appsStore.fetchApps(1, 100);
  autoExpandActiveMenus();
});

watch(() => route.path, () => {
  autoExpandActiveMenus();
});

const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit('update:collapsed', value),
});

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
  if (isCollapsed.value) {
    accountsExpanded.value = false;
    installationsExpanded.value = false;
  }
};

const toggleInstallationsMenu = () => {
  if (!isCollapsed.value) {
    installationsExpanded.value = !installationsExpanded.value;
  }
};

const toggleAccountsMenu = () => {
  if (!isCollapsed.value) {
    accountsExpanded.value = !accountsExpanded.value;
  }
};

const isActiveRoute = (routeName: string) => {
  return route.name === routeName;
};

const isAccountsActive = computed(() => {
  return route.name === 'accounts-users' || route.name === 'accounts-permissions' || route.name === 'accounts-roles';
});

const isInstallationsActive = computed(() => {
  return route.name === 'installations';
});

const navigationItems = [
  {
    name: 'Apps',
    route: 'apps',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
    permission: 'apps.view',
  },
  {
    name: 'Pricing Plan',
    route: 'pricing-plan',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    name: 'Email Templates',
    route: 'email-templates',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    permission: 'email_templates.view',
  },
];

const accountsSubMenu = [
  { name: 'Users', route: 'accounts-users', permission: 'users.view' },
  { name: 'Permissions', route: 'accounts-permissions', permission: 'permissions.view' },
  { name: 'Roles', route: 'accounts-roles', permission: 'roles.view' },
];

const filteredNavigationItems = computed(() => {
  return navigationItems.filter(item => !item.permission || authStore.hasPermission(item.permission));
});

const filteredAccountsSubMenu = computed(() => {
  return accountsSubMenu.filter(item => !item.permission || authStore.hasPermission(item.permission));
});
</script>

<template>
  <div 
    :class="[
      'h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
      isCollapsed ? 'w-20' : 'w-64'
    ]"
  >
    <!-- Logo Section -->
    <div class="h-16 flex items-center justify-between px-4 border-b border-gray-200">
      <div v-if="!isCollapsed" class="flex items-center space-x-2">
        <svg class="w-8 h-8 text-teal" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.3"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="text-lg font-semibold text-dark">Shopify CRM</span>
      </div>
      <button
        @click="toggleSidebar"
        class="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            :d="isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'"
          />
        </svg>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-4 custom-scrollbar">
      <div class="px-3 space-y-1">
        <!-- Installation List with Submenu -->
        <div v-if="authStore.hasPermission('installations.view')">
          <button
            @click="toggleInstallationsMenu"
            :class="[
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group cursor-pointer',
              isInstallationsActive && !installationsExpanded
                ? 'bg-teal text-white'
                : 'text-gray-700 hover:bg-gray-100'
            ]"
          >
            <div class="flex items-center">
              <svg 
                :class="[
                  'w-5 h-5 flex-shrink-0',
                  isInstallationsActive && !installationsExpanded ? 'text-white' : 'text-gray-500 group-hover:text-teal'
                ]"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span 
                v-if="!isCollapsed" 
                class="ml-3 text-sm font-medium"
              >
                Installation List
              </span>
            </div>
            <ChevronDown 
              v-if="!isCollapsed"
              size="sm"
              :class="[
                'transition-transform duration-200',
                installationsExpanded ? 'rotate-180' : '',
                isInstallationsActive && !installationsExpanded ? 'text-white' : 'text-gray-500 group-hover:text-teal'
              ]" />
          </button>

          <!-- Submenu (All Installations + Apps) -->
          <div 
            v-if="!isCollapsed && installationsExpanded"
            class="mt-1 ml-4 pl-4 border-l border-gray-300 space-y-1"
          >
            <router-link
              :to="{ name: 'installations' }"
              :class="[
                'block px-3 py-2 rounded-lg text-sm transition-all duration-200',
                isActiveRoute('installations') && !route.query.app_id
                  ? 'bg-teal-light text-teal font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-teal'
              ]"
            >
              All Installations
            </router-link>
            
            <router-link
              v-for="app in appsStore.apps"
              :key="app.id"
              :to="{ name: 'installations', query: { app_id: app.id } }"
              :class="[
                'block px-3 py-2 rounded-lg text-sm transition-all duration-200',
                route.query.app_id === String(app.id)
                  ? 'bg-teal-light text-teal font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-teal'
              ]"
            >
              {{ app.app_name }}
            </router-link>
          </div>
        </div>

        <!-- Regular Navigation Items -->
        <router-link
          v-for="item in filteredNavigationItems"
          :key="item.route"
          :to="{ name: item.route }"
          :class="[
            'flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group',
            isActiveRoute(item.route)
              ? 'bg-teal text-white'
              : 'text-gray-700 hover:bg-gray-100'
          ]"
        >
          <svg 
            :class="[
              'w-5 h-5 flex-shrink-0',
              isActiveRoute(item.route) ? 'text-white' : 'text-gray-500 group-hover:text-teal'
            ]"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
          </svg>
          <span 
            v-if="!isCollapsed" 
            class="ml-3 text-sm font-medium"
          >
            {{ item.name }}
          </span>
        </router-link>

        <!-- Accounts Menu with Submenu -->
        <div v-if="filteredAccountsSubMenu.length > 0">
          <button
            @click="toggleAccountsMenu"
            :class="[
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group cursor-pointer',
              isAccountsActive
                ? 'bg-teal text-white'
                : 'text-gray-700 hover:bg-gray-100'
            ]"
          >
            <div class="flex items-center">
              <svg 
                :class="[
                  'w-5 h-5 flex-shrink-0',
                  isAccountsActive ? 'text-white' : 'text-gray-500 group-hover:text-teal'
                ]"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span 
                v-if="!isCollapsed" 
                class="ml-3 text-sm font-medium"
              >
                Accounts
              </span>
            </div>
            <ChevronDown 
              v-if="!isCollapsed"
              size="sm"
              :class="[
                'transition-transform duration-200',
                accountsExpanded ? 'rotate-180' : '',
                isAccountsActive ? 'text-white' : 'text-gray-500 group-hover:text-teal'
              ]" />
          </button>

          <!-- Submenu -->
          <div 
            v-if="!isCollapsed && accountsExpanded"
            class="mt-1 ml-4 pl-4 border-l border-gray-300 space-y-1 cursor-pointer"
          >
            <router-link
              v-for="subItem in filteredAccountsSubMenu"
              :key="subItem.route"
              :to="{ name: subItem.route }"
              :class="[
                'block px-3 py-2 rounded-lg text-sm transition-all duration-200',
                isActiveRoute(subItem.route)
                  ? 'bg-teal-light text-teal font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-teal'
              ]"
            >
              {{ subItem.name }}
            </router-link>
          </div>
        </div>
      </div>
    </nav>
  </div>
</template>

<style scoped>
/* Add smooth scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #d1d5db;
}
</style>
