<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import dayjs from 'dayjs';

const router = useRouter();
const authStore = useAuthStore();
const currentDateTime = ref('');
const userMenuOpen = ref(false);

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

const handleLogout = async () => {
  await authStore.logout();
  router.push({ name: 'login' });
};

const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value;
};

// Close menu when clicking outside
const closeUserMenu = () => {
  userMenuOpen.value = false;
};
</script>

<template>
  <header class="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6">
    <!-- Right Side: Date/Time and User Info -->
    <div class="flex items-center space-x-6">
      <!-- Date and Time -->
      <div class="text-sm text-gray-600">
        {{ currentDateTime }}
      </div>

      <!-- User Profile -->
      <div class="relative">
        <button
          @click="toggleUserMenu"
          class="flex items-center space-x-3 hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors"
        >
          <div class="w-8 h-8 bg-teal rounded-full flex items-center justify-center">
            <span class="text-white text-sm font-semibold">
              {{ authStore.user?.name?.charAt(0)?.toUpperCase() || 'U' }}
            </span>
          </div>
          <div class="text-left hidden sm:block">
            <div class="text-sm font-medium text-gray-900">{{ authStore.user?.name || 'User' }}</div>
            <div class="text-xs text-gray-500">{{ authStore.user?.email || '' }}</div>
          </div>
          <svg 
            class="w-4 h-4 text-gray-500 transition-transform"
            :class="{ 'rotate-180': userMenuOpen }"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Dropdown Menu -->
        <div
          v-if="userMenuOpen"
          class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          @click.stop
        >
          <button
            @click="handleLogout"
            class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Backdrop to close menu -->
  <div
    v-if="userMenuOpen"
    @click="closeUserMenu"
    class="fixed inset-0 z-40"
  />
</template>
