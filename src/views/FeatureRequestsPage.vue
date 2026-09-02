<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import PageHeader from '@/components/common/PageHeader.vue';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import StatusChip from '@/components/featureRequests/StatusChip.vue';
import RequestCard from '@/components/featureRequests/RequestCard.vue';
import RequestDetailDrawer from '@/components/featureRequests/RequestDetailDrawer.vue';
import StatusChangeModal from '@/components/featureRequests/StatusChangeModal.vue';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { Toast } from '@/utils/toast';
import { formatDate } from '@/utils/date';
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
  { value: null, name: 'All apps' },
  ...appsStore.apps.map((app) => ({ value: app.id, name: app.app_name })),
]);

const sortOptions = [
  { value: 'votes', name: 'Most voted' },
  { value: 'trending', name: 'Trending' },
  { value: 'newest', name: 'Newest' },
  { value: 'oldest', name: 'Oldest' },
];

const statusOptions = computed(() => [
  { value: null, name: 'All statuses' },
  ...FEATURE_REQUEST_STATUSES.map((s) => ({ value: s.value, name: s.label })),
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
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to load feature requests' });
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
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to load request' });
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
    Toast.fire({ icon: 'success', title: successMessage });
    await load();
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to save' });
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
    Toast.fire({ icon: 'success', title: 'Reply posted' });
    await load();
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to post reply' });
  }
};

const toggleComment = async (comment: FeatureRequestComment) => {
  try {
    await featureRequestService.setCommentHidden(comment.id, !comment.is_hidden);
    await refreshActive();
    Toast.fire({ icon: 'success', title: comment.is_hidden ? 'Comment restored' : 'Comment hidden' });
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to update comment' });
  }
};

const deleteComment = async (comment: FeatureRequestComment) => {
  const confirmed = await Swal.fire({
    icon: 'warning',
    title: 'Delete this comment?',
    text: 'It is removed from the board for everyone.',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#F83939',
  });

  if (!confirmed.isConfirmed) return;

  try {
    await featureRequestService.removeComment(comment.id);
    await refreshActive();
    await load();
    Toast.fire({ icon: 'success', title: 'Comment deleted' });
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to delete comment' });
  }
};

const deleteRequest = async () => {
  if (!activeRequest.value) return;

  const confirmed = await Swal.fire({
    icon: 'warning',
    title: 'Delete this request?',
    text: 'It disappears from the board. Votes are kept.',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#F83939',
  });

  if (!confirmed.isConfirmed) return;

  try {
    await featureRequestService.remove(activeRequest.value.id);
    drawerOpen.value = false;
    Toast.fire({ icon: 'success', title: 'Request deleted' });
    await load();
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to delete request' });
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
      Toast.fire({ icon: 'success', title: response.message || `${response.data.updated} requests moved` });
    } else if (statusModalRequest.value) {
      await featureRequestService.changeStatus(statusModalRequest.value.id, payload);
      Toast.fire({ icon: 'success', title: 'Status updated' });
    }

    statusModalOpen.value = false;
    drawerOpen.value = false;
    await load();
  } catch (err) {
    Toast.fire({ icon: 'error', title: (err as Error).message || 'Failed to update status' });
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
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((value) => value !== id)
    : [...selectedIds.value, id];
};

const lastPage = computed(() => Math.max(1, Math.ceil(tableTotal.value / 20)));

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
        <router-link
          v-if="authStore.hasPermission('board_settings.edit')"
          :to="{ name: 'board-settings' }"
          class="rounded-sm border border-grey px-3 py-2 text-b5 font-semibold text-mid hover:bg-lighter"
        >
          Board settings
        </router-link>
        <div class="flex items-center gap-1 rounded-sm bg-lighter p-1">
          <button
            v-for="mode in (['kanban', 'table'] as ViewMode[])"
            :key="mode"
            class="rounded-xsm px-3 py-1.5 text-b5 font-semibold capitalize transition"
            :class="viewMode === mode ? 'bg-white text-dark shadow-sm' : 'text-mid hover:text-dark'"
            @click="viewMode = mode"
          >
            {{ mode }}
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- filters -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <SearchInput v-model="searchQuery" placeholder="Search requests" container-class="w-full sm:w-72" />
      <SelectInput v-model="selectedAppId" select-class="w-44">
        <option v-for="option in appOptions" :key="String(option.value)" :value="option.value">
          {{ option.name }}
        </option>
      </SelectInput>
      <SelectInput v-model="sortBy" select-class="w-40">
        <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.name }}</option>
      </SelectInput>
      <SelectInput v-if="viewMode === 'table'" v-model="statusFilter" select-class="w-40">
        <option v-for="option in statusOptions" :key="String(option.value)" :value="option.value">
          {{ option.name }}
        </option>
      </SelectInput>

      <!-- bulk bar -->
      <div v-if="viewMode === 'table' && selectedIds.length" class="ml-auto flex items-center gap-2">
        <span class="text-b5 text-mid">{{ selectedIds.length }} selected</span>
        <button
          v-for="status in FEATURE_REQUEST_STATUSES"
          :key="status.value"
          class="rounded-sm border border-grey px-2.5 py-1.5 text-b6 font-semibold text-mid hover:border-primary hover:text-primary"
          @click="askBulkStatusChange(status.value)"
        >
          {{ status.label }}
        </button>
      </div>
    </div>

    <!-- kanban -->
    <div v-if="viewMode === 'kanban'" class="custom-scrollbar grid grid-flow-col auto-cols-[300px] gap-4 overflow-x-auto pb-4">
      <section
        v-for="status in FEATURE_REQUEST_STATUSES"
        :key="status.value"
        class="flex min-w-0 flex-col"
        @dragover.prevent
        @drop="onDrop(status.value)"
      >
        <header class="mb-3 flex items-center gap-2 rounded-md border border-lighter bg-white px-3 py-2.5">
          <StatusChip :status="status.value" :label="status.label" />
          <span class="ml-auto rounded-full bg-lighter px-2 py-0.5 text-b6 font-semibold tabular-nums text-mid">
            {{ counts[status.value] ?? 0 }}
          </span>
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
          <p v-if="!columns[status.value].length" class="rounded-md border border-dashed border-grey px-3 py-6 text-center text-b5 text-light">
            Nothing here
          </p>
          <p
            v-else-if="(counts[status.value] ?? 0) > columns[status.value].length"
            class="px-1 text-b6 text-light"
          >
            Showing {{ columns[status.value].length }} of {{ counts[status.value] }} — use the table view for the rest.
          </p>
        </div>
      </section>
    </div>

    <!-- table -->
    <div v-else class="overflow-hidden rounded-md border border-lighter bg-white">
      <table class="w-full text-left">
        <thead class="bg-artboard text-b6 tracking-wide text-light uppercase">
          <tr>
            <th class="w-10 px-3 py-3">
              <input type="checkbox" class="h-4 w-4 accent-primary" :checked="allSelected" @change="toggleAll" />
            </th>
            <th class="px-3 py-3 font-semibold">Request</th>
            <th class="px-3 py-3 font-semibold">Store</th>
            <th class="px-3 py-3 font-semibold">Status</th>
            <th class="px-3 py-3 text-right font-semibold">Votes</th>
            <th class="px-3 py-3 font-semibold">Opened</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="px-3 py-6"><SkeletonLoader height="1.5rem" /></td>
          </tr>
          <tr v-else-if="!tableRows.length">
            <td colspan="6" class="px-3 py-10 text-center text-b4 text-light">No feature requests match these filters.</td>
          </tr>
          <tr
            v-for="request in tableRows"
            v-else
            :key="request.id"
            class="cursor-pointer border-t border-lighter hover:bg-artboard"
            @click="openDrawer(request)"
          >
            <td class="px-3 py-3" @click.stop>
              <input
                type="checkbox"
                class="h-4 w-4 accent-primary"
                :checked="selectedIds.includes(request.id)"
                @change="toggleOne(request.id)"
              />
            </td>
            <td class="px-3 py-3">
              <span class="block text-b4 font-semibold text-dark">{{ request.title }}</span>
              <span v-if="request.app" class="block text-b6 text-light">{{ request.app.app_name }}</span>
            </td>
            <td class="px-3 py-3 text-b5 text-mid">
              {{ request.installation?.store_name || request.submitter_name || '—' }}
            </td>
            <td class="px-3 py-3"><StatusChip :status="request.status" :label="request.status_label" /></td>
            <td class="px-3 py-3 text-right text-b4 font-semibold tabular-nums text-dark">{{ request.votes_count }}</td>
            <td class="px-3 py-3 text-b5 text-mid">{{ formatDate(request.created_at, '—') }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="tableTotal > 20" class="flex items-center justify-between border-t border-lighter px-4 py-3">
        <span class="text-b5 text-mid">{{ tableTotal }} requests</span>
        <div class="flex items-center gap-2">
          <button
            class="rounded-sm border border-grey px-3 py-1.5 text-b5 text-mid disabled:opacity-40"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            Previous
          </button>
          <span class="text-b5 text-mid">Page {{ currentPage }} of {{ lastPage }}</span>
          <button
            class="rounded-sm border border-grey px-3 py-1.5 text-b5 text-mid disabled:opacity-40"
            :disabled="currentPage === lastPage"
            @click="goToPage(currentPage + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <RequestDetailDrawer
      :open="drawerOpen"
      :request="activeRequest"
      :loading="drawerLoading"
      @close="drawerOpen = false"
      @change-status="(status) => activeRequest && askStatusChange(activeRequest, status)"
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
