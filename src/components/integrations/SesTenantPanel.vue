<script setup lang="ts">
import { ref, computed } from 'vue';
import { mailProviderService, type SesTenantState, type SesTenantLive } from '@/services/mailProviderService';
import type { ApiError } from '@/config/api';
import type { Tone } from '@/lib/tones';
import { toast } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import AppAlert from '@/components/common/AppAlert.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';

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

const status = computed<{ label: string; tone: Tone }>(() => {
  const sending = live.value?.sending_status ?? props.tenant.provisioned?.sending_status;
  if (sending === 'DISABLED') return { label: 'Paused by AWS', tone: 'danger' };
  if (props.tenant.in_use) return { label: 'In use', tone: 'success' };
  return { label: 'Not in use', tone: 'warning' };
});

/** Tick or cross line in the live AWS check. */
const checkClass = (ok: boolean | null) => (ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive');

const provision = async () => {
  try {
    provisioning.value = true;
    const response = await mailProviderService.provisionSesTenant();
    live.value = null;
    toast.success(response.message || 'Tenant ready');
    emit('changed');
  } catch (caught) {
    const err = caught as ApiError;
    toast.error('Could not provision the tenant', err.message ? { description: err.message } : undefined);
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
    toast.error('Could not read the tenant from AWS', err.message ? { description: err.message } : undefined);
  } finally {
    checking.value = false;
  }
};
</script>

<template>
  <div class="rounded-lg border bg-muted/50 p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h4 class="font-heading text-sm font-semibold">SES tenant</h4>
        <p class="text-xs text-muted-foreground mt-0.5">
          Isolates this CRM's reputation and sending status inside the SES account, so a bounce spike here
          cannot pause other senders.
        </p>
      </div>
      <StatusBadge :tone="status.tone" class="flex-shrink-0 font-semibold">
        {{ status.label }}
      </StatusBadge>
    </div>

    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
      <div>
        <dt class="text-xs text-muted-foreground">Tenant name</dt>
        <dd class="font-mono break-all">{{ tenant.name }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Environment</dt>
        <dd>
          {{ tenant.environment }}
          <span class="text-xs text-muted-foreground">
            ({{ tenant.name_from_env ? 'from SES_TENANT_NAME' : 'default — set SES_TENANT_NAME to override' }})
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Sending identity</dt>
        <dd class="break-all">{{ tenant.identity || '—' }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Provisioned</dt>
        <dd>
          <template v-if="tenant.provisioned">
            {{ tenant.provisioned.region }}
            <span v-if="tenant.provisioned.provisioned_at" class="text-xs text-muted-foreground">
              · {{ new Date(tenant.provisioned.provisioned_at).toLocaleString() }}
            </span>
          </template>
          <template v-else>Not yet</template>
        </dd>
      </div>
    </dl>

    <AppAlert v-if="tenant.issue" tone="warning" :title="tenant.issue" class="mt-4">
      <span class="text-xs">Until this is resolved, mail is still sent — just without the tenant.</span>
    </AppAlert>

    <ul v-if="live" class="text-sm mt-4 space-y-1">
      <li :class="checkClass(live.exists)">
        {{ live.exists ? '✓' : '✗' }} Tenant {{ live.exists ? 'exists in AWS' : 'does not exist in AWS' }}
        <span v-if="live.sending_status" class="text-muted-foreground">({{ live.sending_status }})</span>
      </li>
      <li v-if="live.exists && live.associations_unknown_reason" class="text-muted-foreground">
        ? Associations not checked — {{ live.associations_unknown_reason }}
      </li>
      <template v-else-if="live.exists">
        <li :class="checkClass(live.identity_associated)">
          {{ live.identity_associated ? '✓' : '✗' }} Identity associated
        </li>
        <li :class="checkClass(live.configuration_set_associated)">
          {{ live.configuration_set_associated ? '✓' : '✗' }} Configuration set associated
        </li>
      </template>
    </ul>

    <div class="flex flex-wrap items-center justify-end gap-2 mt-4">
      <span v-if="canEdit && hasUnsavedChanges" class="text-xs text-muted-foreground mr-auto">Save your changes before provisioning.</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="checkStatus"
        :disabled="checking"
      >
        <Spinner v-if="checking" />
        Check AWS status
      </Button>
      <Button
        v-if="canEdit"
        type="button"
        size="sm"
        @click="provision"
        :disabled="provisioning || hasUnsavedChanges || !tenant.name_valid"
      >
        <Spinner v-if="provisioning" />
        {{ tenant.provisioned ? 'Re-provision tenant' : 'Provision tenant' }}
      </Button>
    </div>
  </div>
</template>
