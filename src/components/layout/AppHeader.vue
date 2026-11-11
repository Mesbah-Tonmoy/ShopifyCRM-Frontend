<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronsUpDown, LogOut } from '@lucide/vue';
import dayjs from 'dayjs';
import { useAuthStore } from '@/stores/auth';
import { LoadingIcon } from '@/components/icons';
import UserAvatar from '@/components/common/UserAvatar.vue';
import ColorModeToggle from '@/components/common/ColorModeToggle.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';

const router = useRouter();
const authStore = useAuthStore();
const currentDateTime = ref('');
const isLoggingOut = ref(false);

const updateDateTime = () => {
  currentDateTime.value = dayjs().format('MMMM DD, YYYY · h:mm a');
};

let intervalId: number | null = null;

onMounted(() => {
  updateDateTime();
  intervalId = window.setInterval(updateDateTime, 1000);
});

onUnmounted(() => {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
});

const handleLogout = async (event: Event) => {
  // Keep the menu open so the spinner shows until the redirect.
  event.preventDefault();
  isLoggingOut.value = true;
  try {
    await authStore.logout();
    router.push({ name: 'login' });
  } finally {
    isLoggingOut.value = false;
  }
};
</script>

<template>
  <header class="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
    <SidebarTrigger class="-ml-1" />

    <div class="ml-auto flex items-center gap-4">
      <span class="hidden text-sm text-muted-foreground md:block">{{ currentDateTime }}</span>

      <ColorModeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted"
          >
            <UserAvatar :name="authStore.user?.name" :image="authStore.user?.image" class="size-8" />
            <div class="hidden text-sm leading-tight sm:grid">
              <span class="truncate font-medium">{{ authStore.user?.name || 'User' }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ authStore.user?.email || 'Loading...' }}</span>
            </div>
            <ChevronsUpDown class="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuLabel class="flex items-center gap-2 font-normal">
            <UserAvatar :name="authStore.user?.name" :image="authStore.user?.image" class="size-8" />
            <div class="grid text-sm leading-tight">
              <span class="truncate font-medium text-foreground">{{ authStore.user?.name || 'User' }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ authStore.user?.email }}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="isLoggingOut" @select="handleLogout">
            <LoadingIcon v-if="isLoggingOut" size="xs" />
            <LogOut v-else />
            {{ isLoggingOut ? 'Logging out...' : 'Log out' }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
</template>
