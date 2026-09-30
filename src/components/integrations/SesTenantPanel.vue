<script setup lang="ts">
import { ref, computed } from 'vue';
import Swal from 'sweetalert2';
import { mailProviderService, type SesTenantState, type SesTenantLive } from '@/services/mailProviderService';
import type { ApiError } from '@/config/api';
import { Toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';

/**
 * This environment's SES tenant: one per environment, named by SES_TENANT_NAME
 * in the backend .env. Provisioning creates it in AWS and associates the
 * sending identity and configuration set; it is idempotent, so it also repairs.
 */
const props = defineProps<{
  tenant: SesTenantState;
  canEdit: boolean;
  /** Provisioning uses saved settings, so it waits for unsaved edits. */
  hasUnsavedChanges: boolean;
}>();

const emit = defineEmits<{ changed: [] }>();

const provisioning = ref(false);
const checking = ref(false);
const live = ref<SesTenantLive | null>(null);

const status = computed(() => {
  const sending = live.value?.sending_status ?? props.tenant.provisioned?.sending_status;
  if (sending === 'DISABLED') return { label: 'Paused by AWS', classes: 'bg-red-50 text-red-700' };
  if (props.tenant.in_use) return { label: 'In use', classes: 'bg-green-50 text-green-700' };
  return { label: 'Not in use', classes: 'bg-amber-50 text-amber-700' };
});

const provision = async () => {
  try {
    provisioning.value = true;
    const response = await mailProviderService.provisionSesTenant();
    live.value = null;
    Toast.fire({ icon: 'success', title: response.message || 'Tenant ready' });
    emit('changed');
  } catch (caught) {
    const err = caught as ApiError;
    Swal.fire({ icon: 'error', title: 'Could not provision the tenant', text: err.message });
  } finally {
    provisioning.value = false;
  }
};

const checkStatus = async () => {
  try {
    checking.value = true;
    const response = await mailProviderService.sesTenantStatus();
    live.value = response.data.live;
    // The backend refreshes the stored sending status, so pull it back in.
    if (response.data.tenant.provisioned?.sending_status !== props.tenant.provisioned?.sending_status) {
      emit('changed');
    }
  } catch (caught) {
    const err = caught as ApiError;
    Swal.fire({ icon: 'error', title: 'Could not read the tenant from AWS', text: err.message });
  } finally {
    checking.value = false;
  }
};
</script>

<template>
  <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h4 class="text-sm font-semibold text-dark">SES tenant</h4>
        <p class="text-xs text-gray-500 mt-0.5">
          Isolates this CRM's reputation and sending status inside the SES account, so a bounce spike here
          cannot pause other senders.
        </p>
      </div>
      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0" :class="status.classes">
        {{ status.label }}
      </span>
    </div>

    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
      <div>
        <dt class="text-xs text-gray-500">Tenant name</dt>
        <dd class="font-mono text-dark break-all">{{ tenant.name }}</dd>
      </div>
      <div>
        <dt class="text-xs text-gray-500">Environment</dt>
        <dd class="text-dark">
          {{ tenant.environment }}
          <span class="text-xs text-gray-500">
            ({{ tenant.name_from_env ? 'from SES_TENANT_NAME' : 'default — set SES_TENANT_NAME to override' }})
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-gray-500">Sending identity</dt>
        <dd class="text-dark break-all">{{ tenant.identity || '—' }}</dd>
      </div>
      <div>
        <dt class="text-xs text-gray-500">Provisioned</dt>
        <dd class="text-dark">
          <template v-if="tenant.provisioned">
            {{ tenant.provisioned.region }}
            <span v-if="tenant.provisioned.provisioned_at" class="text-xs text-gray-500">
              · {{ new Date(tenant.provisioned.provisioned_at).toLocaleString() }}
            </span>
          </template>
          <template v-else>Not yet</template>
        </dd>
      </div>
    </dl>

    <p v-if="tenant.issue" class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-4">
      {{ tenant.issue }}
      <span class="block text-xs text-amber-700 mt-1">Until this is resolved, mail is still sent — just without the tenant.</span>
    </p>

    <ul v-if="live" class="text-sm mt-4 space-y-1">
      <li :class="live.exists ? 'text-green-700' : 'text-red-700'">
        {{ live.exists ? '✓' : '✗' }} Tenant {{ live.exists ? 'exists in AWS' : 'does not exist in AWS' }}
        <span v-if="live.sending_status" class="text-gray-500">({{ live.sending_status }})</span>
      </li>
      <li v-if="live.exists && live.associations_unknown_reason" class="text-gray-500">
        ? Associations not checked — {{ live.associations_unknown_reason }}
      </li>
      <template v-else-if="live.exists">
        <li :class="live.identity_associated ? 'text-green-700' : 'text-red-700'">
          {{ live.identity_associated ? '✓' : '✗' }} Identity associated
        </li>
        <li :class="live.configuration_set_associated ? 'text-green-700' : 'text-red-700'">
          {{ live.configuration_set_associated ? '✓' : '✗' }} Configuration set associated
        </li>
      </template>
    </ul>

    <div class="flex flex-wrap items-center justify-end gap-2 mt-4">
      <span v-if="canEdit && hasUnsavedChanges" class="text-xs text-gray-500 mr-auto">Save your changes before provisioning.</span>
      <button
        type="button"
        @click="checkStatus"
        :disabled="checking"
        class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50 flex items-center gap-2"
      >
        <LoadingIcon v-if="checking" size="xs" />
        Check AWS status
      </button>
      <button
        v-if="canEdit"
        type="button"
        @click="provision"
        :disabled="provisioning || hasUnsavedChanges || !tenant.name_valid"
        class="bg-teal text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <LoadingIcon v-if="provisioning" size="xs" color-class="text-white" />
        {{ tenant.provisioned ? 'Re-provision tenant' : 'Provision tenant' }}
      </button>
    </div>
  </div>
</template>
