<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Lightbulb } from '@lucide/vue';
import PageHeader from '@/components/common/PageHeader.vue';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import AppPagination from '@/components/common/AppPagination.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import StatusChip from '@/components/featureRequests/StatusChip.vue';
import RequestCard from '@/components/featureRequests/RequestCard.vue';
import RequestDetailDrawer from '@/components/featureRequests/RequestDetailDrawer.vue';
import StatusChangeModal from '@/components/featureRequests/StatusChangeModal.vue';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { formatDate } from '@/utils/date';
import { toggleInList } from '@/lib/list';
import {
  FEATURE_REQUEST_STATUSES,
  featureRequestService,
  type FeatureRequest,
  type FeatureRequestComment,
  type FeatureRequestStatus,
} from '@/services/featureRequestService';

type ViewMode = 'kanban' | 'table';

const appsStore = useAppsStore();
const authStore = useAuthStore();

const viewMode = ref<ViewMode>('kanban');
const selectedAppId = ref<number | null>(null);
const searchQuery = ref('');
const sortBy = ref<'votes' | 'trending' | 'newest' | 'oldest'>('votes');
const statusFilter = ref<FeatureRequestStatus | null>(null);

const loading = ref(false);
const columns = ref<Record<FeatureRequestStatus, FeatureRequest[]>>(emptyColumns());
const counts = ref<Record<string, number>>({});
const tableRows = ref<FeatureRequest[]>([]);
const tableTotal = ref(0);
const currentPage = ref(1);

const selectedIds = ref<number[]>([]);
const draggingId = ref<number | null>(null);

const drawerOpen = ref(false);
const drawerLoading = ref(false);
const activeRequest = ref<FeatureRequest | null>(null);

const statusModalOpen = ref(false);
const statusModalTarget = ref<FeatureRequestStatus | null>(null);
const statusModalRequest = ref<FeatureRequest | null>(null);
const statusSaving = ref(false);
const bulkMode = ref(false);

function emptyColumns(): Record<FeatureRequestStatus, FeatureRequest[]> {
  return FEATURE_REQUEST_STATUSES.reduce(
    (acc, status) => ({ ...acc, [status.value]: [] }),
    {} as Record<FeatureRequestStatus, FeatureRequest[]>
  );
}

const appOptions = computed(() => [
  { value: null, label: 'All apps' },
  ...appsStore.appOptions,
]);

const sortOptions: { value: typeof sortBy.value; label: string }[] = [
  { value: 'votes', label: 'Most voted' },
  { value: 'trending', label: 'Trending' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const statusOptions = computed(() => [
  { value: null, label: 'All statuses' },
  ...FEATURE_REQUEST_STATUSES,
]);

const sharedFilters = computed(() => ({
  app_id: selectedAppId.value,
  search: searchQuery.value.trim() || undefined,
  sort: sortBy.value,
}));

onMounted(async () => {
  if (!appsStore.apps.length) await appsStore.fetchApps(1, 100);
  await load();
});

// Refetch on any filter change; the search box is debounced by the watcher below.
watch([selectedAppId, sortBy, statusFilter, viewMode], () => {
  currentPage.value = 1;
  load();
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage.value = 1;
    load();
  }, 350);
});

const load = async () => {
  loading.value = true;
  selectedIds.value = [];

  try {
    await (viewMode.value === 'kanban' ? loadKanban() : loadTable());
  } catch (err) {
    toast.error((err as Error).message || 'Failed to load feature requests');
  } finally {
    loading.value = false;
  }
};

/**
 * One request per column, run in parallel, plus the stats call that fills the
 * column counters.
 */
const loadKanban = async () => {
  const [stats, ...lists] = await Promise.all([
    featureRequestService.getStats(selectedAppId.value),
    ...FEATURE_REQUEST_STATUSES.map((status) =>
      featureRequestService.getAll({ ...sharedFilters.value, status: status.value, per_page: 25 })
    ),
  ]);

  counts.value = Object.fromEntries(stats.data.statuses.map((s) => [s.value, s.count]));

  const next = emptyColumns();
  FEATURE_REQUEST_STATUSES.forEach((status, index) => {
    next[status.value] = lists[index]?.data.data ?? [];
  });
  columns.value = next;
};

const loadTable = async () => {
  const response = await featureRequestService.getAll({
    ...sharedFilters.value,
    status: statusFilter.value,
    page: currentPage.value,
    per_page: 20,
  });

  tableRows.value = response.data.data;
  tableTotal.value = response.data.total;
};

/* ---------------------------------------------------------------- detail */

const openDrawer = async (request: FeatureRequest) => {
  drawerOpen.value = true;
  drawerLoading.value = true;
  activeRequest.value = request;

  try {
    const response = await featureRequestService.getById(request.id);
    activeRequest.value = response.data;
  } catch (err) {
    toast.error((err as Error).message || 'Failed to load request');
  } finally {
    drawerLoading.value = false;
  }
};

/**
 * Apply a partial edit to the open request and fold the response back into the
 * drawer, so the badge and buttons reflect the new state without a refetch.
 */
const patchActive = async (data: Partial<FeatureRequest>, successMessage: string) => {
  if (!activeRequest.value) return;

  try {
    const response = await featureRequestService.update(activeRequest.value.id, data);
    activeRequest.value = { ...activeRequest.value, ...response.data };
    toast.success(successMessage);
    await load();
  } catch (err) {
    toast.error((err as Error).message || 'Failed to save');
  }
};

const saveAdminNote = (note: string) => patchActive({ admin_note: note }, 'Internal note saved');

const savePublicResponse = (note: string) => patchActive({ status_note: note }, 'Public response saved');

/**
 * Showing a request also publishes it. Clearing `is_hidden` alone would leave a
 * request that is still awaiting review invisible, which looks like the button
 * did nothing.
 */
const toggleHidden = (hidden: boolean) =>
  patchActive(
    hidden ? { is_hidden: true } : { is_hidden: false, is_visible: true },
    hidden ? 'Hidden from the board' : 'Published to the board'
  );

const togglePinned = (pinned: boolean) =>
  patchActive({ is_pinned: pinned }, pinned ? 'Pinned to the top' : 'Unpinned');

/**
 * Comment actions all refresh the drawer from the server, since hiding or
 * deleting one changes the thread the API returns.
 */
const refreshActive = async () => {
  if (!activeRequest.value) return;

  const response = await featureRequestService.getById(activeRequest.value.id);
  activeRequest.value = response.data;
};

const postReply = async (body: string) => {
  if (!activeRequest.value || body.length < 2) return;

  try {
    const response = await featureRequestService.addComment(activeRequest.value.id, body);
    activeRequest.value = response.data;
    toast.success('Reply posted');
    await load();
  } catch (err) {
    toast.error((err as Error).message || 'Failed to post reply');
  }
};

const toggleComment = async (comment: FeatureRequestComment) => {
  try {
    await featureRequestService.setCommentHidden(comment.id, !comment.is_hidden);
    await refreshActive();
    toast.success(comment.is_hidden ? 'Comment restored' : 'Comment hidden');
  } catch (err) {
    toast.error((err as Error).message || 'Failed to update comment');
  }
};

const deleteComment = async (comment: FeatureRequestComment) => {
  const { confirmed } = await confirmDialog({
    title: 'Delete this comment?',
    description: 'It is removed from the board for everyone.',
    confirmText: 'Delete',
    destructive: true,
  });

  if (!confirmed) return;

  try {
    await featureRequestService.removeComment(comment.id);
    await refreshActive();
    await load();
    toast.success('Comment deleted');
  } catch (err) {
    toast.error((err as Error).message || 'Failed to delete comment');
  }
};

const deleteRequest = async () => {
  if (!activeRequest.value) return;

  const { confirmed } = await confirmDialog({
    title: 'Delete this request?',
    description: 'It disappears from the board. Votes are kept.',
    confirmText: 'Delete',
    destructive: true,
  });

  if (!confirmed) return;

  try {
    await featureRequestService.remove(activeRequest.value.id);
    drawerOpen.value = false;
    toast.success('Request deleted');
    await load();
  } catch (err) {
    toast.error((err as Error).message || 'Failed to delete request');
  }
};

/* --------------------------------------------------------- status changes */

const askStatusChange = (request: FeatureRequest, status: FeatureRequestStatus) => {
  if (request.status === status) return;

  bulkMode.value = false;
  statusModalRequest.value = request;
  statusModalTarget.value = status;
  statusModalOpen.value = true;
};

const askBulkStatusChange = (status: FeatureRequestStatus) => {
  if (!selectedIds.value.length) return;

  bulkMode.value = true;
  statusModalRequest.value = null;
  statusModalTarget.value = status;
  statusModalOpen.value = true;
};

const confirmStatusChange = async (payload: {
  status: FeatureRequestStatus;
  note: string | null;
  notify: boolean;
}) => {
  statusSaving.value = true;

  try {
    if (bulkMode.value) {
      const response = await featureRequestService.bulkStatus({ ids: selectedIds.value, ...payload });
      toast.success(response.message || `${response.data.updated} requests moved`);
    } else if (statusModalRequest.value) {
      await featureRequestService.changeStatus(statusModalRequest.value.id, payload);
      toast.success('Status updated');
    }

    statusModalOpen.value = false;
    drawerOpen.value = false;
    await load();
  } catch (err) {
    toast.error((err as Error).message || 'Failed to update status');
  } finally {
    statusSaving.value = false;
  }
};

/* -------------------------------------------------------------- drag drop */

const onDrop = (status: FeatureRequestStatus) => {
  const request = findById(draggingId.value);
  draggingId.value = null;

  if (request) askStatusChange(request, status);
};

const findById = (id: number | null): FeatureRequest | undefined => {
  if (id === null) return undefined;

  return Object.values(columns.value).flat().find((request) => request.id === id);
};

/* ------------------------------------------------------------ table bulk */

const allSelected = computed(
  () => tableRows.value.length > 0 && selectedIds.value.length === tableRows.value.length
);

const toggleAll = () => {
  selectedIds.value = allSelected.value ? [] : tableRows.value.map((row) => row.id);
};

const toggleOne = (id: number) => {
  selectedIds.value = toggleInList(selectedIds.value, id, !selectedIds.value.includes(id));
};

const lastPage = computed(() => Math.max(1, Math.ceil(tableTotal.value / 20)));

const setViewMode = (value: unknown) => {
  // A single ToggleGroup can be deselected; a view mode is always required.
  if (value === 'kanban' || value === 'table') viewMode.value = value;
};

const goToPage = (page: number) => {
  if (page < 1 || page > lastPage.value) return;
  currentPage.value = page;
  load();
};

</script>

<template>
  <div>
    <PageHeader title="Feature Requests" description="What merchants are asking for, and what you've promised them.">
      <template #actions>
        <Button
          v-if="authStore.hasPermission('board_settings.edit')"
          as-child
          variant="outline"
          size="sm"
        >
          <router-link :to="{ name: 'board-settings' }">
            Board settings
          </router-link>
        </Button>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="viewMode"
          aria-label="View mode"
          @update:model-value="setViewMode"
        >
          <ToggleGroupItem
            v-for="mode in (['kanban', 'table'] as ViewMode[])"
            :key="mode"
            :value="mode"
            class="capitalize"
          >
            {{ mode }}
          </ToggleGroupItem>
        </ToggleGroup>
      </template>
    </PageHeader>

    <!-- filters -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <SearchInput v-model="searchQuery" placeholder="Search requests" container-class="w-full sm:w-72" />
      <SelectInput v-model="selectedAppId" :options="appOptions" select-class="w-44" />
      <SelectInput v-model="sortBy" :options="sortOptions" select-class="w-40" />
      <SelectInput v-if="viewMode === 'table'" v-model="statusFilter" :options="statusOptions" select-class="w-40" />

      <!-- bulk bar -->
      <div v-if="viewMode === 'table' && selectedIds.length" class="ml-auto flex flex-wrap items-center gap-2">
        <span class="text-[13px] text-muted-foreground">{{ selectedIds.length }} selected</span>
        <Button
          v-for="status in FEATURE_REQUEST_STATUSES"
          :key="status.value"
          variant="outline"
          size="xs"
          @click="askBulkStatusChange(status.value)"
        >
          {{ status.label }}
        </Button>
      </div>
    </div>

    <!-- kanban -->
    <div v-if="viewMode === 'kanban'" class="custom-scrollbar grid grid-flow-col auto-cols-[300px] gap-4 overflow-x-auto pb-4">
      <!-- Original layout: a header box per column, cards straight on the page background -->
      <section
        v-for="status in FEATURE_REQUEST_STATUSES"
        :key="status.value"
        class="flex min-w-0 flex-col"
        @dragover.prevent
        @drop="onDrop(status.value)"
      >
        <header class="mb-3 flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-xs">
          <StatusChip :status="status.value" :label="status.label" />
          <Badge variant="secondary" class="ml-auto tabular-nums">
            {{ counts[status.value] ?? 0 }}
          </Badge>
        </header>

        <div v-if="loading" class="space-y-2">
          <SkeletonLoader v-for="n in 3" :key="n" height="5rem" />
        </div>

        <div v-else class="flex min-h-24 flex-col gap-2">
          <RequestCard
            v-for="request in columns[status.value]"
            :key="request.id"
            :request="request"
            :dragging="draggingId === request.id"
            :show-app="!selectedAppId"
            @open="openDrawer(request)"
            @dragstart="draggingId = request.id"
            @dragend="draggingId = null"
          />
          <p
            v-if="!columns[status.value].length"
            class="rounded-lg border border-dashed px-3 py-6 text-center text-[13px] text-muted-foreground"
          >
            Nothing here
          </p>
          <p
            v-else-if="(counts[status.value] ?? 0) > columns[status.value].length"
            class="px-1 text-xs text-muted-foreground"
          >
            Showing {{ columns[status.value].length }} of {{ counts[status.value] }} — use the table view for the rest.
          </p>
        </div>
      </section>
    </div>

    <!-- table -->
    <Card v-else class="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="w-10">
              <Checkbox :model-value="allSelected" aria-label="Select all requests" @update:model-value="toggleAll" />
            </TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Votes</TableHead>
            <TableHead>Opened</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="6" class="py-6"><SkeletonLoader height="1.5rem" /></TableCell>
          </TableRow>
          <TableEmpty v-else-if="!tableRows.length" :colspan="6">
            <Empty class="p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Lightbulb />
                </EmptyMedia>
                <EmptyDescription>No feature requests match these filters.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TableEmpty>
          <TableRow
            v-for="request in tableRows"
            v-else
            :key="request.id"
            class="cursor-pointer"
            :data-state="selectedIds.includes(request.id) ? 'selected' : undefined"
            @click="openDrawer(request)"
          >
            <TableCell @click.stop>
              <Checkbox
                :model-value="selectedIds.includes(request.id)"
                aria-label="Select request"
                @update:model-value="toggleOne(request.id)"
              />
            </TableCell>
            <TableCell class="whitespace-normal">
              <span class="block text-sm font-semibold text-foreground">{{ request.title }}</span>
              <span v-if="request.app" class="block text-xs text-muted-foreground">{{ request.app.app_name }}</span>
            </TableCell>
            <TableCell class="text-[13px] text-muted-foreground">
              {{ request.installation?.store_name || request.submitter_name || '—' }}
            </TableCell>
            <TableCell><StatusChip :status="request.status" :label="request.status_label" /></TableCell>
            <TableCell class="text-right text-sm font-semibold tabular-nums text-foreground">{{ request.votes_count }}</TableCell>
            <TableCell class="text-[13px] text-muted-foreground">{{ formatDate(request.created_at, '—') }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <AppPagination
        v-if="tableTotal > 20"
        :current-page="currentPage"
        :last-page="lastPage"
        :per-page="20"
        :total="tableTotal"
        item-label="requests"
        :per-page-options="[]"
        @update:current-page="goToPage"
      />
    </Card>

    <RequestDetailDrawer
      :open="drawerOpen"
      :request="activeRequest"
      :loading="drawerLoading"
      @close="drawerOpen = false"
      @change-status="(status: FeatureRequestStatus) => activeRequest && askStatusChange(activeRequest, status)"
      @save-note="saveAdminNote"
      @save-response="savePublicResponse"
      @toggle-hidden="toggleHidden"
      @toggle-pinned="togglePinned"
      @reply="postReply"
      @toggle-comment="toggleComment"
      @delete-comment="deleteComment"
      @delete="deleteRequest"
    />

    <StatusChangeModal
      :open="statusModalOpen"
      :request="statusModalRequest"
      :target-status="statusModalTarget"
      :saving="statusSaving"
      @close="statusModalOpen = false"
      @confirm="confirmStatusChange"
    />
  </div>
</template>
