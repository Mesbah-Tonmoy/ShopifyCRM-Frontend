<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { integrationService, type Integration } from '@/services/integrationService';
import { useAuthStore } from '@/stores/auth';
import { Toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';
import PageHeader from '@/components/common/PageHeader.vue';

interface IntegrationField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
}

interface IntegrationMeta {
  key: string;
  title: string;
  description: string;
  fields: IntegrationField[];
  iconBg: string;
}

const INTEGRATIONS_META: IntegrationMeta[] = [
  {
    key: 'slack',
    title: 'Slack',
    description: 'Send a message to a Slack channel whenever a store\'s pricing plan changes.',
    iconBg: 'bg-[#f4ede4]',
    fields: [
      { key: 'webhook_url', label: 'Incoming Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/services/...' },
    ],
  },
  {
    key: 'gmail',
    title: 'Gmail',
    description: 'Send transactional emails through a Gmail account.',
    iconBg: 'bg-red-50',
    fields: [
      { key: 'client_email', label: 'Gmail Address', type: 'text', placeholder: 'you@gmail.com' },
      { key: 'app_password', label: 'App Password', type: 'password' },
    ],
  },
  {
    key: 'sendgrid',
    title: 'SendGrid',
    description: 'Send transactional emails through SendGrid.',
    iconBg: 'bg-blue-50',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'from_email', label: 'From Email', type: 'text', placeholder: 'no-reply@yourapp.com' },
    ],
  },
];

const authStore = useAuthStore();
const loading = ref(false);
const saving = ref<string | null>(null);
const integrations = ref<Record<string, Integration>>({});
const formState = ref<Record<string, { is_enabled: boolean; config: Record<string, any> }>>(
  Object.fromEntries(INTEGRATIONS_META.map((meta) => [meta.key, { is_enabled: false, config: {} }]))
);

const fetchIntegrations = async () => {
  try {
    loading.value = true;
    const response = await integrationService.getAll();
    if (response.success) {
      response.data.forEach((integration) => {
        integrations.value[integration.key] = integration;
        formState.value[integration.key] = {
          is_enabled: integration.is_enabled,
          config: { ...(integration.config || {}) },
        };
      });
    }
  } catch (err: any) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err.message || 'Failed to load integrations',
    });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchIntegrations);

const toggleEnabled = async (key: string) => {
  const state = formState.value[key];
  if (!state) return;

  // optimistic flip, revert on failure
  state.is_enabled = !state.is_enabled;

  try {
    const response = await integrationService.update(key, { is_enabled: state.is_enabled });
    if (response.success) {
      integrations.value[key] = response.data;
      Toast.fire({
        icon: 'success',
        title: `${response.data.name} ${state.is_enabled ? 'enabled' : 'disabled'}`,
      });
    }
  } catch (err: any) {
    state.is_enabled = !state.is_enabled;
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err.message || 'Failed to update integration status',
    });
  }
};

const save = async (key: string) => {
  const state = formState.value[key];
  if (!state) return;

  try {
    saving.value = key;
    const response = await integrationService.update(key, state);
    if (response.success) {
      integrations.value[key] = response.data;
      Toast.fire({
        icon: 'success',
        title: `${response.data.name} settings saved`,
      });
    }
  } catch (err: any) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err.message || 'Failed to save integration',
    });
  } finally {
    saving.value = null;
  }
};
</script>

<template>
  <div>
    <PageHeader title="Integrations" description="Connect Slack, Gmail, and SendGrid to this app" />

    <div v-if="loading" class="flex justify-center py-12">
      <LoadingIcon size="md" />
    </div>

    <div v-else class="max-w-200 flex flex-col gap-5">
      <div
        v-for="meta in INTEGRATIONS_META"
        :key="meta.key"
        class="bg-white border border-gray-100 shadow-sm rounded-lg border border-gray-200 p-6"
      >
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg v-if="meta.key === 'slack'" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.36595 17.4889C6.36595 19.0233 5.1268 20.2634 3.59362 20.2634C2.06044 20.2634 0.821289 19.0233 0.821289 17.4889C0.821289 15.9545 2.06044 14.7144 3.59362 14.7144H6.36595V17.4889ZM7.75212 17.4889C7.75212 15.9545 8.99126 14.7144 10.5244 14.7144C12.0576 14.7144 13.2968 15.9545 13.2968 17.4889V24.4252C13.2968 25.9596 12.0576 27.1998 10.5244 27.1998C8.99126 27.1998 7.75212 25.9596 7.75212 24.4252V17.4889Z" fill="#E01E5A"/>
                <path d="M10.524 6.34888C8.99078 6.34888 7.75164 5.10875 7.75164 3.57434C7.75164 2.03994 8.99078 0.799805 10.524 0.799805C12.0571 0.799805 13.2963 2.03994 13.2963 3.57434V6.34888H10.524ZM10.524 7.75717C12.0571 7.75717 13.2963 8.9973 13.2963 10.5317C13.2963 12.0661 12.0571 13.3062 10.524 13.3062H3.57214C2.03895 13.3062 0.799805 12.0661 0.799805 10.5317C0.799805 8.9973 2.03895 7.75717 3.57214 7.75717H10.524Z" fill="#36C5F0"/>
                <path d="M21.6349 10.5317C21.6349 8.9973 22.8741 7.75717 24.4073 7.75717C25.9404 7.75717 27.1796 8.9973 27.1796 10.5317C27.1796 12.0661 25.9404 13.3062 24.4073 13.3062H21.6349V10.5317ZM20.2488 10.5317C20.2488 12.0661 19.0096 13.3062 17.4764 13.3062C15.9432 13.3062 14.7041 12.0661 14.7041 10.5317V3.57434C14.7041 2.03994 15.9432 0.799805 17.4764 0.799805C19.0096 0.799805 20.2488 2.03994 20.2488 3.57434V10.5317Z" fill="#2EB67D"/>
                <path d="M17.4764 21.6507C19.0096 21.6507 20.2488 22.8908 20.2488 24.4252C20.2488 25.9596 19.0096 27.1998 17.4764 27.1998C15.9432 27.1998 14.7041 25.9596 14.7041 24.4252V21.6507H17.4764ZM17.4764 20.2634C15.9432 20.2634 14.7041 19.0233 14.7041 17.4889C14.7041 15.9545 15.9432 14.7144 17.4764 14.7144H24.4283C25.9614 14.7144 27.2006 15.9545 27.2006 17.4889C27.2006 19.0233 25.9614 20.2634 24.4283 20.2634H17.4764Z" fill="#ECB22E"/>
              </svg>
              <svg v-else-if="meta.key === 'gmail'" width="30" height="23" viewBox="0 0 30 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 5.87891V20.4445C0 22.148 0.833341 22.9998 2.50002 22.9998H6.8334V5.87891" fill="#4285F4"/>
                <path d="M23.167 5.87891V22.9998H27.5004C29.167 22.9998 30.0004 22.148 30.0004 20.4445V5.87891" fill="#34A853"/>
                <path d="M22.833 11.4149V2.386L25.1664 0.597249C27.1664 -0.935969 29.9997 0.767606 29.9997 3.15261V5.87833" fill="#FBBC04"/>
                <path d="M6.49902 10.9049V1.87598L14.9991 8.43474L23.1658 2.13151V11.1605L14.9991 17.4637" fill="#EA4335"/>
                <path d="M0 5.879V3.15328C0 0.683095 2.83336 -0.935302 4.83338 0.597916L6.8334 2.13113V11.1601" fill="#C5221F"/>
              </svg>
              <svg v-else width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M29.9999 0V20H20V29.9995H0.00023566L0.000234374 19.9998L0 20V9.99974H9.99998V0H29.9999Z" fill="#9DD6E3"/>
                <path d="M0 29.999H9.99998V19.999H0V29.999Z" fill="#3F72AB"/>
                <path d="M20 20.0002H30V10H20V20.0002Z" fill="#00A9D1"/>
                <path d="M10 9.99998H20V0H10V9.99998Z" fill="#00A9D1"/>
                <path d="M10 20H20V10H10V20Z" fill="#2191C4"/>
                <path d="M20 9.99998H30V0H20V9.99998Z" fill="#3F72AB"/>
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-dark">{{ meta.title }}</h3>
              <p class="text-sm text-gray-500 mt-1">{{ meta.description }}</p>
            </div>
          </div>

          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
            <input
              type="checkbox"
              class="sr-only peer"
              :checked="formState[meta.key].is_enabled"
              @change="toggleEnabled(meta.key)"
              :disabled="!authStore.hasPermission('integrations.edit')"
            />
            <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-teal transition-colors"></div>
            <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
          </label>
        </div>

        <div v-if="formState[meta.key]" class="space-y-3 mt-4">
          <div v-for="field in meta.fields" :key="field.key">
            <label :for="`${meta.key}-${field.key}`" class="block text-sm font-medium text-gray-600 mb-1">{{ field.label }}</label>
            <input
              :id="`${meta.key}-${field.key}`"
              :name="`${meta.key}-${field.key}`"
              :type="field.type"
              v-model="formState[meta.key].config[field.key]"
              :placeholder="field.placeholder"
              :disabled="!authStore.hasPermission('integrations.edit')"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-gray-50"
            />
          </div>
        </div>

        <div class="mt-4 flex justify-end" v-if="authStore.hasPermission('integrations.edit')">
          <button
            @click="save(meta.key)"
            :disabled="saving === meta.key"
            class="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <LoadingIcon v-if="saving === meta.key" size="xs" color-class="text-white" />
            {{ saving === meta.key ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
