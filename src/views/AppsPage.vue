<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppsStore } from '@/stores/apps';

const router = useRouter();
const appsStore = useAppsStore();

const showModal = ref(false);
const appUrl = ref('');
const connecting = ref(false);
const connectError = ref('');

onMounted(() => {
  appsStore.fetchApps();
});

const viewAppDetails = (id: number) => {
  router.push({ name: 'app-details', params: { id } });
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-h2 font-bold text-dark">Apps</h1>
        <p class="text-b4 text-mid mt-1">Manage your Shopify apps</p>
      </div>
      <button
        @click="openModal"
        class="bg-teal text-white px-4 py-2.5 rounded-lg font-medium hover:bg-teal-dark transition-colors flex items-center"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Connect App
      </button>
    </div>

      <div v-if="appsStore.loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p class="mt-4 text-gray-600">Loading apps...</p>
      </div>

      <div v-else-if="appsStore.error" class="bg-red-50 p-4 rounded-md">
        <p class="text-red-800">{{ appsStore.error }}</p>
      </div>

      <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="app in appsStore.apps"
          :key="app.id"
          class="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow cursor-pointer"
          @click="viewAppDetails(app.id)"
        >
          <div class="p-6">
            <div class="flex items-center">
              <div v-if="app.icon" class="flex-shrink-0">
                <img :src="app.icon" alt="" class="h-12 w-12 rounded-lg" />
              </div>
              <div v-else class="flex-shrink-0 h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <span class="text-2xl">🎯</span>
              </div>
              <div class="ml-4 flex-1">
                <h3 class="text-lg font-medium text-gray-900">{{ app.app_name }}</h3>
                <p class="text-sm text-gray-500">
                  {{ app.installations_count || 0 }} installations
                </p>
              </div>
            </div>
            <div class="mt-4 flex items-center justify-between">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {{ app.active_installations_count || 0 }} active
              </span>
              <span class="text-xs text-gray-500">
                {{ new Date(app.created_at).toLocaleDateString() }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!appsStore.loading && appsStore.apps.length === 0" class="text-center py-12">
        <p class="text-gray-500">No apps found</p>
        <button
          @click="openModal"
          class="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-600 bg-indigo-100 hover:bg-indigo-200"
        >
          Connect your first app
        </button>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 opacity-50 -z-1 transition-opacity" aria-hidden="true" @click="closeModal"></div>

        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                  Connect App
                </h3>
                <div class="mt-4">
                  <label for="app-url" class="block text-sm font-medium text-gray-700">
                    App URL
                  </label>
                  <input
                    id="app-url"
                    v-model="appUrl"
                    type="url"
                    placeholder="https://your-app.com"
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    :disabled="connecting"
                    @keyup.enter="handleConnect"
                  />
                  <p class="mt-2 text-sm text-gray-500">
                    Enter the base URL of your Shopify app
                  </p>
                </div>

                <div v-if="connectError" class="mt-4 rounded-md bg-red-50 p-4">
                  <div class="flex">
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-red-800">
                        {{ connectError }}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              @click="handleConnect"
              :disabled="connecting || !appUrl"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="connecting">Connecting...</span>
              <span v-else>Connect</span>
            </button>
            <button
              type="button"
              @click="closeModal"
              :disabled="connecting"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
</template>