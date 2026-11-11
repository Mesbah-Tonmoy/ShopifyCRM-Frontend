<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { errorMessage } from '@/utils/errors';
import { featureService, type Feature, type FeatureFilters } from '@/services/featureService';
import { useAppsStore } from '@/stores/apps';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { Image as ImageIcon, Plus, Pencil, Star, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/common/StatusBadge.vue';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import DateRangePicker, { type DateFilter } from '@/components/common/DateRangePicker.vue';

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

// A full range was picked or the field was cleared
const handleDateChange = (range: DateFilter) => {
  dateFrom.value = range.from;
  dateTo.value = range.to;
  fetchFeatures();
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

    const filters: FeatureFilters = {};
    if (selectedAppId.value) filters.app_id = selectedAppId.value;
    if (dateFrom.value) filters.date_from = dateFrom.value;
    if (dateTo.value) filters.date_to = dateTo.value;
    if (searchQuery.value) filters.search = searchQuery.value;

    const response = await featureService.getAll(filters);
    if (response.success && response.data) {
      features.value = response.data.data;
    }
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to load features') });
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
    toast.warning('Missing fields', { description: 'App, title and release date are required.' });
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

    toast.success(editingFeature.value ? 'Feature Updated!' : 'Feature Added!');

    await fetchFeatures();
    closeModal();
  } catch (err) {
    toast.error('Error', { description: errorMessage(err, 'Failed to save feature') });
  } finally {
    saving.value = false;
    uploadingImage.value = false;
  }
};

const handleDelete = async (feature: Feature) => {
  const { confirmed } = await confirmDialog({
    title: 'Delete this feature?',
    description: `"${feature.title}" will be removed and no longer shown in the app updates panel.`,
    confirmText: 'Yes, delete it!',
    destructive: true,
  });

  if (confirmed) {
    deletingId.value = feature.id;
    try {
      await featureService.delete(feature.id);
      features.value = features.value.filter(f => f.id !== feature.id);
      toast.success('Deleted!');
    } catch (err) {
      toast.error('Error', { description: errorMessage(err, 'Failed to delete feature') });
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
        <Button
          v-if="authStore.hasPermission('features.add')"
          size="lg"
          @click="openAddModal"
        >
          <Plus />
          Add New Feature
        </Button>
      </template>
    </PageHeader>

    <!-- Filter/Search Bar -->
    <Card class="mb-6 py-4">
      <CardContent class="px-4">
        <div class="flex flex-wrap items-center gap-4">
          <SearchInput
            v-model="searchQuery"
            placeholder="Search features..."
            container-class="max-w-[300px] flex-1"
            @search="fetchFeatures"
          />

          <div class="flex flex-wrap items-center gap-3">
            <SelectInput v-model="selectedAppId" :options="appsStore.appOptions" label="App" placeholder="All Apps" select-class="w-48" @update:modelValue="fetchFeatures" />

            <div class="w-64">
              <DateRangePicker v-model="dateRange" @change="handleDateChange" />
            </div>

            <Button
              v-if="hasFilters"
              variant="link"
              @click="clearFilters"
            >
              Clear filters
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Content Area -->
    <Card class="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="px-6">App</TableHead>
            <TableHead class="px-6">Title</TableHead>
            <TableHead class="px-6">Description</TableHead>
            <TableHead class="px-6">Release Date</TableHead>
            <TableHead class="px-6">Status</TableHead>
            <TableHead class="px-6">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell class="px-6 py-4"><SkeletonLoader width="120px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="150px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4 whitespace-normal"><SkeletonLoader width="250px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="90px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></TableCell>
              <TableCell class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <SkeletonLoader width="24px" height="24px" />
                  <SkeletonLoader width="24px" height="24px" />
                </div>
              </TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else-if="features.length === 0" :colspan="6">
            <Empty class="px-0 py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Star />
                </EmptyMedia>
                <EmptyDescription>No features found matching your criteria</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TableEmpty>
          <template v-else>
            <TableRow v-for="feature in features" :key="feature.id">
              <TableCell class="px-6 py-4 font-medium text-foreground">
                {{ appName(feature) }}
              </TableCell>
              <TableCell class="px-6 py-4 font-medium text-foreground">
                {{ feature.title }}
              </TableCell>
              <TableCell class="px-6 py-4 whitespace-normal">
                <div class="max-w-md line-clamp-1 italic text-muted-foreground">{{ feature.description }}</div>
              </TableCell>
              <TableCell class="px-6 py-4 text-foreground">
                {{ formatDate(feature.release_date) }}
              </TableCell>
              <TableCell class="px-6 py-4">
                <StatusBadge :tone="feature.is_published ? 'success' : 'neutral'">
                  {{ feature.is_published ? 'Published' : 'Draft' }}
                </StatusBadge>
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <Button
                    v-if="authStore.hasPermission('features.edit')"
                    variant="ghost"
                    size="icon-sm"
                    @click="openEditModal(feature)"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    v-if="authStore.hasPermission('features.delete')"
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    @click="handleDelete(feature)"
                    :disabled="deletingId === feature.id"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Spinner v-if="deletingId === feature.id" />
                    <Trash2 v-else />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </Card>

    <!-- Add/Edit Modal -->
    <Dialog :open="showModal" @update:open="(open) => { if (!open) closeModal(); }">
      <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle class="font-heading text-lg font-semibold">{{ editingFeature ? 'Edit Feature' : 'Add New Feature' }}</DialogTitle>
        </DialogHeader>

        <FieldGroup class="gap-5">
          <div class="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel for="feature-app">App</FieldLabel>
              <SelectInput id="feature-app" v-model="form.app_id" :options="appsStore.appOptions" placeholder="Select App" select-class="w-full" />
            </Field>

            <Field>
              <FieldLabel for="feature-release-date">Release Date</FieldLabel>
              <Input id="feature-release-date" v-model="form.release_date" type="date" />
            </Field>
          </div>

          <Field>
            <FieldLabel for="feature-title">Title</FieldLabel>
            <Input
              id="feature-title"
              v-model="form.title"
              type="text"
              placeholder="e.g. Analytics 2.0 is live"
            />
          </Field>

          <Field>
            <FieldLabel for="feature-description">Description</FieldLabel>
            <Textarea
              id="feature-description"
              v-model="form.description"
              rows="4"
              placeholder="Short description shown to merchants"
            />
          </Field>

          <Field>
            <FieldLabel for="feature-image">Image</FieldLabel>
            <div class="flex items-center gap-4">
              <div class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
                <img v-if="imagePreview" :src="imagePreview" alt="Preview" class="size-full object-cover" />
                <ImageIcon v-else class="size-8 text-muted-foreground" />
              </div>
              <div class="flex-1">
                <input
                  id="feature-image"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  @change="onImageSelected"
                  class="block w-full cursor-pointer text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
                />
                <FieldDescription class="mt-1 text-xs">PNG, JPG, GIF or WEBP. Max 5MB.</FieldDescription>
                <p v-if="uploadingImage" class="mt-1 text-xs text-primary">Uploading image...</p>
              </div>
            </div>
          </Field>

          <Field orientation="horizontal" class="rounded-lg border bg-muted/50 p-4">
            <FieldContent>
              <FieldLabel for="feature-published">Published</FieldLabel>
              <FieldDescription class="text-xs">Visible in the app's updates panel</FieldDescription>
            </FieldContent>
            <Switch id="feature-published" v-model="form.is_published" />
          </Field>
        </FieldGroup>

        <DialogFooter class="gap-3">
          <Button variant="outline" @click="closeModal">
            Cancel
          </Button>
          <Button
            @click="saveFeature"
            :disabled="saving"
          >
            <Spinner v-if="saving" />
            {{ saving ? 'Saving...' : editingFeature ? 'Save Changes' : 'Add Feature' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
