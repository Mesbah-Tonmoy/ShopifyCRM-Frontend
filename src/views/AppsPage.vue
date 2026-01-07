<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { CloseIcon, DeleteIcon, PlusIcon, ChevronRight } from '@/components/icons';
import Swal from 'sweetalert2';

const router = useRouter();
const appsStore = useAppsStore();
const authStore = useAuthStore();

const showModal = ref(false);
const appUrl = ref('');
const connecting = ref(false);
const connectError = ref('');

onMounted(() => {
  appsStore.fetchApps();
});

const viewAppDetails = (id: number) => {
  router.push({ name: 'installations', query: { app_id: id.toString() } });
};

const openModal = () => {
  showModal.value = true;
  appUrl.value = '';
  connectError.value = '';
};

const closeModal = () => {
  showModal.value = false;
  appUrl.value = '';
  connectError.value = '';
};

const handleConnect = async () => {
  if (!appUrl.value) {
    connectError.value = 'Please enter an app URL';
    return;
  }

  connecting.value = true;
  connectError.value = '';

  try {
    const success = await appsStore.connectApp(appUrl.value);
    if (success) {
      closeModal();
      await appsStore.fetchApps();
    } else {
      connectError.value = appsStore.error || 'Failed to connect app';
    }
  } catch (error: unknown) {
    connectError.value = (error as Error).message || 'Failed to connect app';
  } finally {
    connecting.value = false;
  }
};

const handleResync = async (id: number) => {
  const result = await Swal.fire({
    title: 'Resync App?',
    text: 'This will re-fetch data from the app server.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#008080',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Yes, resync it!'
  });

  if (result.isConfirmed) {
    const success = await appsStore.resyncApp(id);
    if (success) {
      Swal.fire({
        title: 'Resynced!',
        text: 'App data has been updated.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    } else {
      Swal.fire('Error', appsStore.error || 'Failed to resync app', 'error');
    }
  }
};

const handleDelete = async (id: number) => {
  const result = await Swal.fire({
    title: 'Are you sure?',
    text: "This will disconnect the app and remove its data. This action cannot be undone!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!'
  });

  if (result.isConfirmed) {
    const success = await appsStore.deleteApp(id);
    if (success) {
      Swal.fire({
        title: 'Deleted!',
        text: 'App has been removed.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    } else {
      Swal.fire('Error', appsStore.error || 'Failed to delete app', 'error');
    }
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Apps</h1>
        <p class="text-sm text-gray-500 mt-1">Manage and connect your Shopify apps to sync data.</p>
      </div>
      <button
        v-if="authStore.hasPermission('apps.add')"
        @click="openModal"
        class="bg-teal text-white px-4 py-2.5 rounded-lg font-medium hover:bg-teal-dark transition-all duration-200 flex items-center shadow-sm hover:shadow-md"
      >
        <PlusIcon size="lg" />
        Connect New App
      </button>
    </div>

    <!-- Apps Grid -->
    <div v-if="appsStore.loading && appsStore.apps.length === 0" class="flex flex-col items-center justify-center py-20">
      <div class="w-12 h-12 border-4 border-teal border-t-transparent rounded-full animate-spin"></div>
      <p class="mt-4 text-gray-500 font-medium">Loading your apps...</p>
    </div>

    <div v-else-if="appsStore.error && appsStore.apps.length === 0" class="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center text-red-700">
      <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {{ appsStore.error }}
    </div>

    <div v-else>
      <div v-if="appsStore.apps.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="app in appsStore.apps"
          :key="app.id"
          class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 group relative overflow-hidden flex flex-col"
        >
          <!-- Accent blur -->
          <div class="absolute -right-4 -top-4 w-24 h-24 bg-teal/5 rounded-full blur-2xl group-hover:bg-teal/10 transition-colors"></div>
          
          <div class="relative flex-1">
            <div class="flex items-start justify-between">
              <div class="flex items-center space-x-4">
                <div v-if="app.icon" class="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-gray-50 bg-gray-50 flex-shrink-0">
                  <img :src="app.icon" :alt="app.app_name" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-14 h-14 rounded-xl bg-teal/10 flex items-center justify-center text-teal flex-shrink-0 shadow-sm">
                  <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <div class="min-w-0 cursor-pointer" @click="viewAppDetails(app.id)">
                  <h3 class="text-lg font-bold text-gray-900 truncate group-hover:text-teal transition-colors">
                    {{ app.app_name }}
                  </h3>
                  <div class="flex items-center mt-1 space-x-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700">
                      {{ app.active_installations_count || 0 }} Active
                    </span>
                    <span class="text-xs text-gray-400">•</span>
                    <span class="text-xs text-gray-500 font-medium">{{ app.installations_count || 0 }} total</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Last Synced</span>
                <span class="text-xs text-gray-600 font-medium">
                  {{ app.last_synced ? new Date(app.last_synced).toLocaleString() : 'Never' }}
                </span>
              </div>
              <button 
                @click="viewAppDetails(app.id)"
                class="p-2 rounded-lg bg-gray-50 text-gray-400 hover:bg-teal hover:text-white transition-all shadow-sm"
                title="View Installations"
              >
                <ChevronRight size="lg" />
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="mt-4 flex items-center gap-2">
            <button
              v-if="authStore.hasPermission('apps.add')"
              @click="handleResync(app.id)"
              :disabled="appsStore.loading"
              class="flex-1 py-2 text-sm font-medium text-teal bg-teal/5 rounded-lg hover:bg-teal hover:text-white transition-all flex items-center justify-center gap-2 border border-teal/10 shadow-sm"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Resync
            </button>
            <button
              v-if="authStore.hasPermission('apps.delete')"
              @click="handleDelete(app.id)"
              :disabled="appsStore.loading"
              class="px-3 py-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-500 hover:text-white transition-all border border-red-100 shadow-sm"
              title="Delete App"
            >
              <DeleteIcon size="sm" />
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-dashed border-gray-200">
        <div class="w-20 h-20 bg-teal/5 flex items-center justify-center rounded-full text-teal mb-6">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <h3 class="text-xl font-bold text-gray-900">No apps connected yet</h3>
        <p class="text-gray-500 mt-2 max-w-xs text-center">Connect your Shopify apps to start managing installations and syncing data.</p>
        <button
          v-if="authStore.hasPermission('apps.add')"
          @click="openModal"
          class="mt-8 bg-teal text-white px-6 py-3 rounded-xl font-bold hover:bg-teal-dark transition-all shadow-lg shadow-teal/20"
        >
          Connect Your First App
        </button>
      </div>
    </div>

    <!-- Connect App Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div class="fixed inset-0 transition-opacity bg-gray-900/50 backdrop-blur-sm" @click="closeModal"></div>

        <div class="inline-block w-full max-w-lg p-8 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl rounded-3xl z-50">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-2xl font-bold text-gray-900">Connect New App</h3>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600 transition-colors">
              <CloseIcon size="lg" />
            </button>
          </div>

          <div class="space-y-6">
            <div>
              <label for="app-url" class="block text-sm font-bold text-gray-700 mb-2">App URL</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <input
                  id="app-url"
                  v-model="appUrl"
                  type="url"
                  placeholder="https://your-shopify-app.com"
                  class="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal/20 focus:border-teal transition-all outline-none"
                  :disabled="connecting"
                  @keyup.enter="handleConnect"
                />
              </div>
              <p class="mt-2 text-xs text-gray-500 font-medium">
                Enter the base URL where your Shopify app is hosted. We'll use this to sync app data.
              </p>
            </div>

            <div v-if="connectError" class="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start text-red-700 text-sm">
              <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {{ connectError }}
            </div>

            <div class="flex space-x-4">
              <button
                @click="closeModal"
                class="flex-1 px-6 py-3 text-sm font-bold text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all border border-gray-100"
                :disabled="connecting"
              >
                Cancel
              </button>
              <button
                @click="handleConnect"
                class="flex-2 bg-teal text-white px-8 py-3 rounded-xl font-bold hover:bg-teal-dark transition-all shadow-lg shadow-teal/20 disabled:opacity-50 flex items-center justify-center min-w-[140px]"
                :disabled="connecting || !appUrl"
              >
                <div v-if="connecting" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                {{ connecting ? 'Connecting...' : 'Connect App' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>