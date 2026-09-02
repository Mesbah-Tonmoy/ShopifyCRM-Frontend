<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import Swal from 'sweetalert2';
import { featureService, type Feature } from '@/services/featureService';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { Toast } from '@/utils/toast';
import { PlusIcon, EditIcon, DeleteIcon, CloseIcon, LoadingIcon } from '@/components/icons';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import dayjs from 'dayjs';
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns';

const appsStore = useAppsStore();
const authStore = useAuthStore();

const features = ref<Feature[]>([]);
const loading = ref(false);
const saving = ref(false);
const deletingId = ref<number | null>(null);

const showModal = ref(false);
const editingFeature = ref<Feature | null>(null);
const uploadingImage = ref(false);
const imageFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);

const selectedAppId = ref<number | null>(null);
const dateFrom = ref('');
const dateTo = ref('');
const dateRange = ref<Date[] | null>(null);
const searchQuery = ref('');

const dateRangePlaceholderText = computed(() => {
  const firstDay = dayjs().startOf('month');
  const lastDay = dayjs().endOf('month');
  return `${firstDay.format('MMM DD, YYYY')} - ${lastDay.format('MMM DD, YYYY')}`;
});

const presetDates = ref([
  { label: 'Today', value: [new Date(), new Date()] },
  { label: 'Last 7 Days', value: [subDays(new Date(), 7), new Date()] },
  { label: 'This Month', value: [startOfMonth(new Date()), endOfMonth(new Date())] },
  {
    label: 'Last Month',
    value: [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))],
  },
  { label: 'This Year', value: [startOfYear(new Date()), endOfYear(new Date())] },
]);

// Handle date range changes (only fetches once both dates are picked, or on clear)
const handleDateChange = (newDate: Date[] | null) => {
  if (newDate && newDate.length === 2 && newDate[0] && newDate[1]) {
    dateFrom.value = dayjs(newDate[0]).format('YYYY-MM-DD');
    dateTo.value = dayjs(newDate[1]).format('YYYY-MM-DD');
    fetchFeatures();
  } else if (!newDate || newDate.length === 0) {
    dateFrom.value = '';
    dateTo.value = '';
    fetchFeatures();
  }
};

const emptyForm = () => ({
  app_id: null as number | null,
  title: '',
  description: '',
  release_date: new Date().toISOString().slice(0, 10),
  is_published: true,
});
const form = ref(emptyForm());

onMounted(() => {
  appsStore.fetchApps(1, 100);
  fetchFeatures();
});

const fetchFeatures = async () => {
  try {
    loading.value = true;

    const filters: any = {};
    if (selectedAppId.value) filters.app_id = selectedAppId.value;
    if (dateFrom.value) filters.date_from = dateFrom.value;
    if (dateTo.value) filters.date_to = dateTo.value;
    if (searchQuery.value) filters.search = searchQuery.value;

    const response = await featureService.getAll(filters);
    if (response.success && response.data) {
      features.value = response.data.data;
    }
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to load features' });
  } finally {
    loading.value = false;
  }
};

const appName = (feature: Feature) => feature.app?.app_name || 'Unknown App';

const openAddModal = () => {
  editingFeature.value = null;
  form.value = emptyForm();
  imageFile.value = null;
  imagePreview.value = null;
  showModal.value = true;
};

const openEditModal = (feature: Feature) => {
  editingFeature.value = feature;
  form.value = {
    app_id: feature.app_id,
    title: feature.title,
    description: feature.description || '',
    release_date: feature.release_date.slice(0, 10),
    is_published: feature.is_published,
  };
  imageFile.value = null;
  imagePreview.value = feature.image_url || null;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editingFeature.value = null;
  imageFile.value = null;
  imagePreview.value = null;
};

const onImageSelected = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  imageFile.value = file;
  imagePreview.value = URL.createObjectURL(file);
};

const saveFeature = async () => {
  const { app_id: appId, title, release_date: releaseDate } = form.value;

  if (!appId || !title.trim() || !releaseDate) {
    Swal.fire({ icon: 'warning', title: 'Missing fields', text: 'App, title and release date are required.' });
    return;
  }

  // Rebuilt from the narrowed id, so the payload carries a real app_id rather
  // than the form's `number | null`.
  const payload = { ...form.value, app_id: appId };

  try {
    saving.value = true;

    let featureId: number;

    if (editingFeature.value) {
      const response = await featureService.update(editingFeature.value.id, payload);
      featureId = response.data.id;
    } else {
      const response = await featureService.create(payload);
      featureId = response.data.id;
    }

    if (imageFile.value) {
      uploadingImage.value = true;
      await featureService.uploadImage(featureId, imageFile.value);
      uploadingImage.value = false;
    }

    Toast.fire({ icon: 'success', title: editingFeature.value ? 'Feature Updated!' : 'Feature Added!' });

    await fetchFeatures();
    closeModal();
  } catch (err: any) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to save feature' });
  } finally {
    saving.value = false;
    uploadingImage.value = false;
  }
};

const handleDelete = async (feature: Feature) => {
  const result = await Swal.fire({
    title: 'Delete this feature?',
    text: `"${feature.title}" will be removed and no longer shown in the app updates panel.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6B7280',
    confirmButtonText: 'Yes, delete it!',
  });

  if (result.isConfirmed) {
    deletingId.value = feature.id;
    try {
      await featureService.delete(feature.id);
      features.value = features.value.filter(f => f.id !== feature.id);
      Toast.fire({ icon: 'success', title: 'Deleted!' });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to delete feature' });
    } finally {
      deletingId.value = null;
    }
  }
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const hasFilters = computed(() => !!(selectedAppId.value || dateFrom.value || dateTo.value || searchQuery.value));

const clearFilters = () => {
  selectedAppId.value = null;
  dateRange.value = null;
  dateFrom.value = '';
  dateTo.value = '';
  searchQuery.value = '';
  fetchFeatures();
};
</script>

<template>
  <div>
    <PageHeader title="Features" description="Publish new feature updates that show in each app's updates panel.">
      <template #actions>
        <button
          v-if="authStore.hasPermission('features.add')"
          @click="openAddModal"
          class="bg-teal text-white px-4 py-2.5 rounded-lg font-medium hover:bg-teal-dark transition-all duration-200 flex items-center shadow-sm hover:shadow-md"
        >
          <PlusIcon size="md" class="mr-2" />
          Add New Feature
        </button>
      </template>
    </PageHeader>

    <!-- Filter/Search Bar -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div class="flex flex-wrap items-center gap-4">
        <SearchInput
          v-model="searchQuery"
          placeholder="Search features..."
          container-class="max-w-[300px] flex-1"
          @keyup.enter="fetchFeatures"
        />

        <div class="flex flex-wrap items-center gap-3">
          <SelectInput v-model="selectedAppId" label="App" placeholder="All Apps" select-class="w-48" @update:modelValue="fetchFeatures">
            <option v-for="app in appsStore.apps" :key="app.id" :value="app.id">{{ app.app_name }}</option>
          </SelectInput>

          <div class="w-64">
            <VueDatePicker
              v-model="dateRange"
              multi-calendars
              auto-apply
              :range="true"
              :time-config="{ enableTimePicker: false }"
              :placeholder="dateRangePlaceholderText"
              :preset-dates="presetDates"
              @update:model-value="handleDateChange"
            />
          </div>

          <button
            v-if="hasFilters"
            @click="clearFilters"
            class="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="bg-white rounded-lg border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">App</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Title</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Description</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Release Date</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Status</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <template v-if="loading">
              <tr v-for="i in 5" :key="i">
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="120px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="150px" height="16px" /></td>
                <td class="px-6 py-4"><SkeletonLoader width="250px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="90px" height="16px" /></td>
                <td class="px-6 py-4 whitespace-nowrap"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <div class="flex items-center gap-3">
                    <SkeletonLoader width="24px" height="24px" />
                    <SkeletonLoader width="24px" height="24px" />
                  </div>
                </td>
              </tr>
            </template>
            <tr v-else-if="features.length === 0">
              <td colspan="6" class="py-20 text-center text-gray-400">
                <svg class="w-12 h-12 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <p class="text-sm italic">No features found matching your criteria</p>
              </td>
            </tr>
            <template v-else>
              <tr v-for="feature in features" :key="feature.id" class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">{{ appName(feature) }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900 font-medium">{{ feature.title }}</div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-500 max-w-md line-clamp-1 italic">{{ feature.description }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-700">{{ formatDate(feature.release_date) }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'p-[4px_12px_6px] text-xs font-medium rounded-full',
                      feature.is_published ? 'bg-green-lighter text-green' : 'bg-gray-200 text-gray-600'
                    ]"
                  >
                    {{ feature.is_published ? 'Published' : 'Draft' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <div class="flex items-center gap-3">
                    <button
                      v-if="authStore.hasPermission('features.edit')"
                      @click="openEditModal(feature)"
                      class="text-teal hover:text-teal-dark transition-colors"
                      title="Edit"
                    >
                      <EditIcon class="w-5 h-5" />
                    </button>
                    <button
                      v-if="authStore.hasPermission('features.delete')"
                      @click="handleDelete(feature)"
                      :disabled="deletingId === feature.id"
                      class="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <LoadingIcon v-if="deletingId === feature.id" size="sm" />
                      <DeleteIcon v-else class="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-dark/20 backdrop-blur-sm transition-opacity" @click="closeModal"></div>

        <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-2xl w-full overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 class="text-lg font-bold text-gray-900">{{ editingFeature ? 'Edit Feature' : 'Add New Feature' }}</h3>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1">
              <CloseIcon class="w-6 h-6" />
            </button>
          </div>

          <div class="p-6 space-y-5">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-sm font-bold text-gray-700">App</label>
                <SelectInput v-model="form.app_id" placeholder="Select App" select-class="w-full">
                  <option v-for="app in appsStore.apps" :key="app.id" :value="app.id">{{ app.app_name }}</option>
                </SelectInput>
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm font-bold text-gray-700">Release Date</label>
                <input
                  type="date"
                  v-model="form.release_date"
                  class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Title</label>
              <input
                v-model="form.title"
                type="text"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all"
                placeholder="e.g. Analytics 2.0 is live"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Description</label>
              <textarea
                v-model="form.description"
                rows="4"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all resize-none"
                placeholder="Short description shown to merchants"
              ></textarea>
            </div>

            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Image</label>
              <div class="flex items-center gap-4">
                <div class="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img v-if="imagePreview" :src="imagePreview" alt="Preview" class="w-full h-full object-cover" />
                  <svg v-else class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div class="flex-1">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    @change="onImageSelected"
                    class="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal/10 file:text-teal hover:file:bg-teal/20 file:cursor-pointer cursor-pointer"
                  />
                  <p class="text-[10px] text-gray-400 mt-1">PNG, JPG, GIF or WEBP. Max 5MB.</p>
                  <p v-if="uploadingImage" class="text-xs text-teal mt-1">Uploading image...</p>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between p-4 bg-teal/5 rounded-xl border border-teal/10">
              <div>
                <label class="text-sm font-bold text-gray-900">Published</label>
                <p class="text-xs text-gray-500">Visible in the app's updates panel</p>
              </div>
              <button
                @click="form.is_published = !form.is_published"
                :class="[
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  form.is_published ? 'bg-teal' : 'bg-gray-200'
                ]"
              >
                <span :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out',
                  form.is_published ? 'translate-x-5' : 'translate-x-0'
                ]" />
              </button>
            </div>
          </div>

          <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <button @click="closeModal" class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-all">
              Cancel
            </button>
            <button
              @click="saveFeature"
              :disabled="saving"
              class="px-6 py-2 bg-teal text-white rounded-lg font-medium hover:shadow-lg hover:shadow-teal/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <LoadingIcon v-if="saving" size="sm" color-class="text-white" />
              {{ saving ? 'Saving...' : editingFeature ? 'Save Changes' : 'Add Feature' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
