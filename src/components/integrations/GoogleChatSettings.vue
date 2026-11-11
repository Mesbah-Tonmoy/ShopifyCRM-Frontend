<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  integrationService,
  type GoogleChatSpace,
  type GoogleChatOptions,
} from '@/services/integrationService';
import type { ApiError } from '@/config/api';
import { useAuthStore } from '@/stores/auth';
import { Plus } from '@lucide/vue';
import { LoadingIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppAlert from '@/components/common/AppAlert.vue';
import GoogleChatSpaceCard from './GoogleChatSpaceCard.vue';

/**
 * Posts store events (installs, uninstalls, plan changes) to Google Chat.
 * Each space has its own webhook, events and apps, so every Shopify app can
 * notify its own space - or several apps can share one.
 */

interface Row {
  key: string;
  space: GoogleChatSpace | null; // null until a new space is saved
}

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('integrations.edit'));

const loading = ref(true);
const loadError = ref<string | null>(null);
const options = ref<GoogleChatOptions>({ events: [], apps: [] });
const rows = ref<Row[]>([]);
let draftCounter = 0;

onMounted(async () => {
  try {
    const [optionsResponse, spacesResponse] = await Promise.all([
      integrationService.getGoogleChatOptions(),
      integrationService.getGoogleChatSpaces(),
    ]);
    options.value = optionsResponse.data;
    rows.value = spacesResponse.data.map((space) => ({ key: `space-${space.id}`, space }));
  } catch (err) {
    loadError.value = (err as ApiError).message || 'Failed to load Google Chat spaces';
  } finally {
    loading.value = false;
  }
});

const addSpace = () => {
  rows.value.push({ key: `draft-${++draftCounter}`, space: null });
};

const onSaved = (row: Row, space: GoogleChatSpace) => {
  row.space = space;
};

const onRemoved = (row: Row) => {
  rows.value = rows.value.filter((r) => r !== row);
};
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H19v6H8v11H2V4.5Z" fill="#34A853" />
            <path d="M8 8h11v6h-5v5H8V8Z" fill="#FBBC04" />
            <path d="M19 2h4.5A2.5 2.5 0 0 1 26 4.5V19a2.5 2.5 0 0 1-2.5 2.5H14L8 27v-8h6v-5h5V2Z" fill="#4285F4" />
            <path d="M2 19h6v8l-6-6v-2Z" fill="#188038" />
          </svg>
        </div>
        <div>
          <CardTitle class="font-semibold">Google Chat</CardTitle>
          <CardDescription class="mt-1">
            Post to Google Chat spaces when store events happen. Each space has its own webhook, events and apps.
          </CardDescription>
          <p class="text-xs text-muted-foreground mt-1">
            To get a webhook URL: open the space in Google Chat → Apps &amp; integrations → Webhooks → Add webhook.
          </p>
        </div>
      </div>
    </CardHeader>

    <CardContent>
      <div v-if="loading" class="flex justify-center py-6">
        <LoadingIcon size="md" />
      </div>

      <AppAlert v-else-if="loadError" tone="danger">{{ loadError }}</AppAlert>

      <div v-else class="space-y-3">
        <GoogleChatSpaceCard
          v-for="row in rows"
          :key="row.key"
          :space="row.space"
          :options="options"
          :can-edit="canEdit"
          @saved="(space) => onSaved(row, space)"
          @removed="onRemoved(row)"
        />

        <p v-if="!rows.length" class="text-sm text-muted-foreground italic">
          No spaces yet. Add one for each app (or group of apps) you want notifications about.
        </p>

        <div v-if="canEdit" class="flex justify-end">
          <Button
            variant="outline"
            @click="addSpace"
          >
            <Plus />
            Add space
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
