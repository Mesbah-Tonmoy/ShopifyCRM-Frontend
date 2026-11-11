<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { ShopifyIcon } from '@/components/icons';
import { Plus, Trash2, ChevronRight, RefreshCw, Blocks, Package, Link } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import AppAlert from '@/components/common/AppAlert.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';

const router = useRouter();
const appsStore = useAppsStore();
const authStore = useAuthStore();

const showModal = ref(false);
const appUrl = ref('');
const connecting = ref(false);
const connectError = ref('');

const resyncingId = ref<number | null>(null);
const deletingId = ref<number | null>(null);

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
  const { confirmed } = await confirmDialog({
    title: 'Resync App?',
    description: 'This will re-fetch data from the app server.',
    confirmText: 'Yes, resync it!'
  });

  if (confirmed) {
    resyncingId.value = id;
    try {
      const success = await appsStore.resyncApp(id);
      if (success) {
        toast.success('Resynced!', { description: 'App data has been updated.' });
      } else {
        toast.error('Error', { description: appsStore.error || 'Failed to resync app' });
      }
    } finally {
      resyncingId.value = null;
    }
  }
};

const handleDelete = async (id: number) => {
  const { confirmed } = await confirmDialog({
    title: 'Are you sure?',
    description: 'This will disconnect the app and remove its data. This action cannot be undone!',
    confirmText: 'Yes, delete it!',
    destructive: true
  });

  if (confirmed) {
    deletingId.value = id;
    try {
      const success = await appsStore.deleteApp(id);
      if (success) {
        toast.success('Deleted!', { description: 'App has been removed.' });
      } else {
        toast.error('Error', { description: appsStore.error || 'Failed to delete app' });
      }
    } finally {
      deletingId.value = null;
    }
  }
};
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Apps"
      description="Manage and connect your Shopify apps to sync data."
    >
      <template #actions>
        <Button
          v-if="authStore.hasPermission('apps.add')"
          size="lg"
          @click="openModal"
        >
          <Plus />
          Connect New App
        </Button>
      </template>
    </PageHeader>

    <!-- Apps Grid Loading -->
    <div v-if="appsStore.loading && appsStore.apps.length === 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card v-for="i in 3" :key="i">
        <CardContent class="flex flex-1 flex-col">
          <div class="flex items-center space-x-4 mb-6">
            <SkeletonLoader width="56px" height="56px" custom-class="rounded-xl flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <SkeletonLoader width="140px" height="20px" custom-class="mb-2" />
              <div class="flex items-center space-x-2">
                <SkeletonLoader width="60px" height="18px" custom-class="rounded" />
                <SkeletonLoader width="70px" height="14px" />
              </div>
            </div>
          </div>
          <div class="mt-auto flex items-center justify-between pt-6 border-t border-border/50">
            <div class="space-y-1">
              <SkeletonLoader width="60px" height="10px" />
              <SkeletonLoader width="100px" height="14px" />
            </div>
            <SkeletonLoader width="36px" height="36px" custom-class="rounded-lg" />
          </div>
        </CardContent>
        <CardFooter class="gap-2">
          <SkeletonLoader width="100%" height="38px" custom-class="rounded-lg flex-1" />
          <SkeletonLoader width="40px" height="38px" custom-class="rounded-lg" />
        </CardFooter>
      </Card>
    </div>

    <AppAlert v-else-if="appsStore.error && appsStore.apps.length === 0" tone="danger">
      {{ appsStore.error }}
    </AppAlert>

    <div v-else>
      <div v-if="appsStore.apps.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card
          v-for="app in appsStore.apps"
          :key="app.id"
          class="group relative"
        >
          <!-- Accent glow on apps listed in the Shopify App Store -->
          <div
            v-if="app.app_store_url"
            aria-hidden="true"
            class="pointer-events-none absolute -top-4 -right-4 size-24 rounded-full bg-primary/40 blur-2xl transition-colors group-hover:bg-primary/60"
          />

          <CardContent class="relative flex-1">
            <!-- Shopify App Store Link -->
            <Button
              v-if="app.app_store_url"
              as-child
              variant="outline"
              size="icon"
              class="absolute top-0 right-6 z-10"
            >
              <a
                :href="app.app_store_url"
                target="_blank"
                title="View on Shopify App Store"
                aria-label="View on Shopify App Store"
                @click.stop
              >
                <ShopifyIcon size="sm" />
              </a>
            </Button>

            <div class="flex items-start justify-between">
              <div class="flex items-center space-x-4">
                <div v-if="app.icon" class="size-14 rounded-xl overflow-hidden border bg-muted/50 flex-shrink-0">
                  <img :src="app.icon" :alt="app.app_name" class="w-full h-full object-cover" />
                </div>
                <div v-else class="size-14 rounded-xl bg-muted flex items-center justify-center text-foreground flex-shrink-0">
                  <Blocks class="size-7" />
                </div>
                <div class="min-w-0 cursor-pointer" @click="viewAppDetails(app.id)">
                  <h3 class="font-heading text-lg font-semibold text-foreground truncate transition-colors hover:text-primary">
                    {{ app.app_name }}
                  </h3>
                  <div class="flex items-center mt-1 space-x-2">
                    <StatusBadge tone="success">
                      {{ app.active_installations_count || 0 }} Active
                    </StatusBadge>
                    <span class="text-xs text-muted-foreground">•</span>
                    <span class="text-xs text-muted-foreground font-medium">{{ app.installations_count || 0 }} total</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-6 pt-6 border-t border-border/50 flex items-center justify-between">
              <div class="flex flex-col">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last Synced</span>
                <span class="text-xs text-foreground font-medium">
                  {{ app.last_synced ? new Date(app.last_synced).toLocaleString() : 'Never' }}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                @click="viewAppDetails(app.id)"
                title="View Installations"
                aria-label="View Installations"
              >
                <ChevronRight />
              </Button>
            </div>
          </CardContent>

          <CardFooter class="gap-2">
            <Button
              v-if="authStore.hasPermission('apps.add')"
              variant="outline"
              class="flex-1"
              @click="handleResync(app.id)"
              :disabled="appsStore.loading || resyncingId === app.id || deletingId === app.id"
            >
              <Spinner v-if="resyncingId === app.id" />
              <RefreshCw v-else />
              {{ resyncingId === app.id ? 'Resyncing...' : 'Resync' }}
            </Button>
            <Button
              v-if="authStore.hasPermission('apps.delete')"
              variant="destructive"
              size="icon"
              @click="handleDelete(app.id)"
              :disabled="appsStore.loading || resyncingId === app.id || deletingId === app.id"
              title="Delete App"
              aria-label="Delete App"
            >
              <Spinner v-if="deletingId === app.id" />
              <Trash2 v-else />
            </Button>
          </CardFooter>
        </Card>
      </div>

      <!-- Empty State -->
      <Empty v-else class="gap-8 py-32 border bg-card rounded-xl">
        <EmptyHeader>
          <EmptyMedia variant="icon" class="mb-4">
            <Package />
          </EmptyMedia>
          <EmptyTitle>No apps connected yet</EmptyTitle>
          <EmptyDescription>Connect your Shopify apps to start managing installations and syncing data.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent v-if="authStore.hasPermission('apps.add')">
          <Button size="lg" @click="openModal">
            Connect Your First App
          </Button>
        </EmptyContent>
      </Empty>
    </div>

    <!-- Connect App Modal -->
    <Dialog :open="showModal" @update:open="(open) => { if (!open) closeModal(); }">
      <DialogContent class="p-8 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect New App</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel for="app-url">App URL</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="app-url"
                v-model="appUrl"
                type="url"
                placeholder="https://your-shopify-app.com"
                :disabled="connecting"
                @keyup.enter="handleConnect"
              />
              <InputGroupAddon>
                <Link />
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              Enter the base URL where your Shopify app is hosted. We'll use this to sync app data.
            </FieldDescription>
          </Field>

          <AppAlert v-if="connectError" tone="danger">
            {{ connectError }}
          </AppAlert>
        </FieldGroup>

        <DialogFooter class="gap-4">
          <Button
            variant="outline"
            @click="closeModal"
            :disabled="connecting"
          >
            Cancel
          </Button>
          <Button
            @click="handleConnect"
            class="min-w-[140px]"
            :disabled="connecting || !appUrl"
          >
            <Spinner v-if="connecting" />
            {{ connecting ? 'Connecting...' : 'Connect App' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
