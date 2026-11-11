<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { integrationService, type Integration } from '@/services/integrationService';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { LoadingIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import PageHeader from '@/components/common/PageHeader.vue';
import MailDeliverySettings from '@/components/integrations/MailDeliverySettings.vue';
import GoogleChatSettings from '@/components/integrations/GoogleChatSettings.vue';
import { errorMessage } from '@/utils/errors';

interface IntegrationField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  required?: boolean;
}

interface IntegrationMeta {
  key: string;
  title: string;
  description: string;
  fields: IntegrationField[];
}

const INTEGRATIONS_META: IntegrationMeta[] = [
  {
    key: 'slack',
    title: 'Slack',
    description: 'Send a message to a Slack channel whenever a store\'s pricing plan changes.',
    fields: [
      { key: 'webhook_url', label: 'Incoming Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/services/...' },
    ],
  },
];

const authStore = useAuthStore();
const loading = ref(false);
const saving = ref<string | null>(null);
const integrations = ref<Record<string, Integration>>({});
const formState = ref<Record<string, { is_enabled: boolean; config: Record<string, string> }>>(
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
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to load integrations') });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchIntegrations);

const getMissingRequiredFields = (key: string): IntegrationField[] => {
  const meta = INTEGRATIONS_META.find((m) => m.key === key);
  const state = formState.value[key];
  if (!meta || !state) return [];
  return meta.fields.filter((field) => field.required && !String(state.config[field.key] ?? '').trim());
};

const toggleEnabled = async (key: string) => {
  const state = formState.value[key];
  if (!state) return;

  const turningOn = !state.is_enabled;

  // Enabling requires all mandatory fields to be filled in first; disabling never does.
  if (turningOn) {
    const missing = getMissingRequiredFields(key);
    if (missing.length) {
      // the Switch is bound to state, so it stays off on its own
      const meta = INTEGRATIONS_META.find((m) => m.key === key);
      toast.warning('Missing required fields', {
        description: `Fill in the following before enabling ${meta?.title ?? key}: ${missing.map((f) => f.label).join(', ')}`,
      });
      return;
    }
  }

  // optimistic flip, revert on failure
  state.is_enabled = turningOn;

  try {
    // send config along so values typed but not yet saved persist together with the enable action
    const response = await integrationService.update(key, { is_enabled: state.is_enabled, config: state.config });
    if (response.success) {
      integrations.value[key] = response.data;
      toast.success(`${response.data.name} ${state.is_enabled ? 'enabled' : 'disabled'}`);
    }
  } catch (err) {
    state.is_enabled = !state.is_enabled;
    toast.error('Error', { description: errorMessage(err, 'Failed to update integration status') });
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
      toast.success(`${response.data.name} settings saved`);
    }
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to save integration') });
  } finally {
    saving.value = null;
  }
};
</script>

<template>
  <div>
    <PageHeader title="Integrations" description="Connect Slack and Google Chat, and choose how this CRM sends email" />

    <div v-if="loading" class="flex justify-center py-12">
      <LoadingIcon size="md" />
    </div>

    <div v-else class="max-w-200 flex flex-col gap-5">
      <Card
        v-for="meta in INTEGRATIONS_META"
        :key="meta.key"
      >
        <CardHeader>
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg v-if="meta.key === 'slack'" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.36595 17.4889C6.36595 19.0233 5.1268 20.2634 3.59362 20.2634C2.06044 20.2634 0.821289 19.0233 0.821289 17.4889C0.821289 15.9545 2.06044 14.7144 3.59362 14.7144H6.36595V17.4889ZM7.75212 17.4889C7.75212 15.9545 8.99126 14.7144 10.5244 14.7144C12.0576 14.7144 13.2968 15.9545 13.2968 17.4889V24.4252C13.2968 25.9596 12.0576 27.1998 10.5244 27.1998C8.99126 27.1998 7.75212 25.9596 7.75212 24.4252V17.4889Z" fill="#E01E5A"/>
                <path d="M10.524 6.34888C8.99078 6.34888 7.75164 5.10875 7.75164 3.57434C7.75164 2.03994 8.99078 0.799805 10.524 0.799805C12.0571 0.799805 13.2963 2.03994 13.2963 3.57434V6.34888H10.524ZM10.524 7.75717C12.0571 7.75717 13.2963 8.9973 13.2963 10.5317C13.2963 12.0661 12.0571 13.3062 10.524 13.3062H3.57214C2.03895 13.3062 0.799805 12.0661 0.799805 10.5317C0.799805 8.9973 2.03895 7.75717 3.57214 7.75717H10.524Z" fill="#36C5F0"/>
                <path d="M21.6349 10.5317C21.6349 8.9973 22.8741 7.75717 24.4073 7.75717C25.9404 7.75717 27.1796 8.9973 27.1796 10.5317C27.1796 12.0661 25.9404 13.3062 24.4073 13.3062H21.6349V10.5317ZM20.2488 10.5317C20.2488 12.0661 19.0096 13.3062 17.4764 13.3062C15.9432 13.3062 14.7041 12.0661 14.7041 10.5317V3.57434C14.7041 2.03994 15.9432 0.799805 17.4764 0.799805C19.0096 0.799805 20.2488 2.03994 20.2488 3.57434V10.5317Z" fill="#2EB67D"/>
                <path d="M17.4764 21.6507C19.0096 21.6507 20.2488 22.8908 20.2488 24.4252C20.2488 25.9596 19.0096 27.1998 17.4764 27.1998C15.9432 27.1998 14.7041 25.9596 14.7041 24.4252V21.6507H17.4764ZM17.4764 20.2634C15.9432 20.2634 14.7041 19.0233 14.7041 17.4889C14.7041 15.9545 15.9432 14.7144 17.4764 14.7144H24.4283C25.9614 14.7144 27.2006 15.9545 27.2006 17.4889C27.2006 19.0233 25.9614 20.2634 24.4283 20.2634H17.4764Z" fill="#ECB22E"/>
              </svg>
            </div>
            <div>
              <CardTitle class="font-semibold">{{ meta.title }}</CardTitle>
              <CardDescription class="mt-1">{{ meta.description }}</CardDescription>
            </div>
          </div>

          <CardAction class="ml-4">
            <Switch
              :aria-label="`Enable ${meta.title}`"
              :model-value="formState[meta.key]!.is_enabled"
              :disabled="!authStore.hasPermission('integrations.edit')"
              @update:model-value="toggleEnabled(meta.key)"
            />
          </CardAction>
        </CardHeader>

        <CardContent v-if="formState[meta.key]">
          <FieldGroup class="gap-3">
            <Field v-for="field in meta.fields" :key="field.key" class="gap-1.5">
              <FieldLabel :for="`${meta.key}-${field.key}`">
                {{ field.label }}<span v-if="field.required" class="text-destructive"> *</span>
              </FieldLabel>
              <Input
                :id="`${meta.key}-${field.key}`"
                :name="`${meta.key}-${field.key}`"
                :type="field.type"
                v-model="formState[meta.key]!.config[field.key]"
                :placeholder="field.placeholder"
                :disabled="!authStore.hasPermission('integrations.edit')"
              />
            </Field>
          </FieldGroup>
        </CardContent>

        <CardFooter class="justify-end" v-if="authStore.hasPermission('integrations.edit')">
          <Button
            @click="save(meta.key)"
            :disabled="saving === meta.key"
          >
            <Spinner v-if="saving === meta.key" />
            {{ saving === meta.key ? 'Saving...' : 'Save' }}
          </Button>
        </CardFooter>
      </Card>

      <GoogleChatSettings />

      <MailDeliverySettings />
    </div>
  </div>
</template>
