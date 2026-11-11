<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  emailTemplateService,
  type EmailTemplate as ApiEmailTemplate,
  type EmailTemplateFilterOptions,
} from '@/services/emailTemplateService';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils/toast';
import { Eye, Inbox, Pencil } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import AppPagination from '@/components/common/AppPagination.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { errorMessage } from '@/utils/errors';

interface EmailTemplate extends ApiEmailTemplate {
  app_name?: string;
  template_name?: string;
}

const templates = ref<EmailTemplate[]>([]);
const loading = ref(false);
const saving = ref(false);
const showEditModal = ref(false);
const showPreviewModal = ref(false);
const editingTemplate = ref<EmailTemplate | null>(null);
const previewTemplate = ref<EmailTemplate | null>(null);
const selectedAppId = ref<number | null>(null);
const selectedTemplateType = ref<string | null>(null);
const searchQuery = ref('');
const authStore = useAuthStore();

// Filter dropdown options come from their own endpoint: deriving them from the
// rows on screen would only ever list what fits on the current page.
const filterOptions = ref<EmailTemplateFilterOptions>({ apps: [], types: [] });
const appOptions = computed(() => filterOptions.value.apps.map((app) => ({ value: app.id, label: app.app_name })));

const currentPage = ref(1);
const perPage = ref(15);
const lastPage = ref(1);
const total = ref(0);
const rangeFrom = ref<number | null>(null);
const rangeTo = ref<number | null>(null);

onMounted(() => {
  fetchFilterOptions();
  fetchTemplates();
});

// Filtering narrows the result set, so the current page number no longer means
// anything - go back to the first page before refetching.
watch([selectedAppId, selectedTemplateType, perPage], () => {
  currentPage.value = 1;
  fetchTemplates();
});

// Search runs on the server now that the list is paginated, so it is debounced
// rather than fired on every keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage.value = 1;
    fetchTemplates();
  }, 350);
});

const fetchFilterOptions = async () => {
  try {
    const response = await emailTemplateService.getFilterOptions();
    if (response.success && response.data) {
      filterOptions.value = response.data;
    }
  } catch (err) {
    // Non-fatal: the table still loads, the dropdowns are just empty.
    console.error('Error fetching template filter options:', err);
  }
};

const fetchTemplates = async () => {
  try {
    loading.value = true;

    const filters: Record<string, string | number> = {
      page: currentPage.value,
      per_page: perPage.value,
    };

    if (selectedAppId.value) filters.app_id = selectedAppId.value;
    if (selectedTemplateType.value) filters.type = selectedTemplateType.value;
    if (searchQuery.value.trim()) filters.search = searchQuery.value.trim();

    const response = await emailTemplateService.getAll(filters);

    if (response.success && response.data) {
      const page = response.data;

      templates.value = page.data.map(template => ({
        ...template,
        app_name: template.app?.app_name || 'Unknown App',
        template_name: getTemplateTypeName(template.type),
      }));

      currentPage.value = page.current_page;
      lastPage.value = page.last_page;
      total.value = page.total;
      rangeFrom.value = page.from;
      rangeTo.value = page.to;
    }
  } catch (err) {
    const message = errorMessage(err, 'Failed to load email templates');
    console.error('Error fetching templates:', err);
    toast.error('Error', { description: message });
  } finally {
    loading.value = false;
  }
};

const goToPage = (page: number) => {
  currentPage.value = page;
  fetchTemplates();
};

/**
 * Label for a template type, using the names the API supplies so the admin and
 * the board agree on what each template is called.
 */
const getTemplateTypeName = (type: string) => {
  const match = filterOptions.value.types.find(option => option.value === type);
  if (match) return match.label;

  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getShortBody = (body: string, maxLength: number = 100) => {
  const stripped = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
};

const openEditModal = (template: EmailTemplate) => {
  editingTemplate.value = { ...template };
  showEditModal.value = true;
};

const closeEditModal = () => {
  // editingTemplate is left in place so the dialog keeps its content while it animates out;
  // opening always loads a fresh copy.
  showEditModal.value = false;
};

const openPreviewModal = (template: EmailTemplate) => {
  previewTemplate.value = template;
  showPreviewModal.value = true;
};

const closePreviewModal = () => {
  showPreviewModal.value = false;
  previewTemplate.value = null;
};

const saveTemplate = async () => {
  if (!editingTemplate.value) return;

  try {
    saving.value = true;

    await emailTemplateService.update(editingTemplate.value.id, {
      subject: editingTemplate.value.subject,
      body: editingTemplate.value.body,
      is_active: editingTemplate.value.is_active,
    });

    await fetchTemplates();

    closeEditModal();

    toast.success('Template Updated!', { description: 'Email template has been saved successfully.' });
  } catch (err) {
    const message = errorMessage(err, 'Failed to update template');
    toast.error('Error', { description: message });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div>
    <PageHeader title="Email Templates" />

    <!-- Filter/Search Bar -->
    <Card class="mb-6 py-4">
      <CardContent class="flex flex-wrap items-center gap-4 px-4">
        <!-- Search Field -->
        <SearchInput 
          v-model="searchQuery" 
          placeholder="Search templates..." 
          container-class="max-w-[300px] flex-1"
        />

        <!-- Dropdowns Container -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- App Filter -->
          <SelectInput
            v-model="selectedAppId"
            :options="appOptions"
            label="App"
            placeholder="All Apps"
            select-class="w-48"
          />

          <!-- Template Type Filter -->
          <SelectInput
            v-model="selectedTemplateType"
            :options="filterOptions.types"
            label="Type"
            placeholder="All Types"
            select-class="w-56"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Content Area -->
    <Card class="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="px-6">App Name</TableHead>
            <TableHead class="px-6">Template Name</TableHead>
            <TableHead class="px-6">Subject</TableHead>
            <TableHead class="px-6">Body</TableHead>
            <TableHead class="px-6">Status</TableHead>
            <TableHead class="px-6">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell class="px-6 py-4"><SkeletonLoader width="120px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4">
                <SkeletonLoader width="100px" height="16px" custom-class="mb-2" />
                <SkeletonLoader width="60px" height="12px" />
              </TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="150px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="250px" height="16px" /></TableCell>
              <TableCell class="px-6 py-4"><SkeletonLoader width="60px" height="24px" custom-class="rounded-full" /></TableCell>
              <TableCell class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <SkeletonLoader width="24px" height="24px" />
                  <SkeletonLoader width="24px" height="24px" />
                </div>
              </TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else-if="templates.length === 0" :colspan="6" class="text-muted-foreground">
            <div class="flex flex-col items-center py-10">
              <Inbox class="size-12 mb-4 opacity-20" />
              <p class="text-sm italic">No email templates found matching your criteria</p>
            </div>
          </TableEmpty>
          <template v-else>
            <TableRow v-for="template in templates" :key="template.id">
              <TableCell class="px-6 py-4">
                <div class="text-sm font-medium text-foreground">{{ template.app_name }}</div>
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="text-sm text-foreground font-medium">{{ template.template_name }}</div>
                <div class="text-xs text-muted-foreground font-mono">{{ template.type }}</div>
              </TableCell>
              <TableCell class="px-6 py-4 whitespace-normal">
                <div class="text-sm text-foreground max-w-xs truncate font-medium">{{ template.subject }}</div>
              </TableCell>
              <TableCell class="px-6 py-4 whitespace-normal">
                <div class="text-sm text-muted-foreground max-w-md line-clamp-1 italic">{{ getShortBody(template.body) }}</div>
              </TableCell>
              <TableCell class="px-6 py-4">
                <StatusBadge :tone="template.is_active ? 'success' : 'neutral'">
                  {{ template.is_active ? 'Active' : 'Inactive' }}
                </StatusBadge>
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <Button
                    v-if="authStore.hasPermission('email_templates.edit')"
                    variant="ghost"
                    size="icon-sm"
                    @click="openEditModal(template)"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    @click="openPreviewModal(template)"
                    title="Preview"
                    aria-label="Preview"
                  >
                    <Eye />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>

      <AppPagination
        v-if="!loading && total > 0"
        :current-page="currentPage"
        :last-page="lastPage"
        :per-page="perPage"
        :total="total"
        :from="rangeFrom"
        :to="rangeTo"
        item-label="templates"
        @update:current-page="goToPage"
        @update:per-page="perPage = $event"
      />
    </Card>

    <!-- Edit Modal -->
    <Dialog :open="showEditModal && !!editingTemplate" @update:open="(open) => { if (!open) closeEditModal(); }">
      <DialogContent class="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <template v-if="editingTemplate">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
            <DialogDescription>{{ editingTemplate.app_name }} • {{ editingTemplate.template_name }}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <!-- Active Toggle -->
            <Field orientation="horizontal" class="rounded-xl border bg-muted/50 p-4 has-[>[data-slot=field-content]]:items-center">
              <FieldContent>
                <FieldLabel for="template-status" class="font-semibold">Template Status</FieldLabel>
                <FieldDescription>Enable or disable this email template</FieldDescription>
              </FieldContent>
              <Switch id="template-status" v-model="editingTemplate.is_active" />
            </Field>

            <!-- Subject Field -->
            <Field>
              <FieldLabel for="subject" class="font-semibold">Email Subject</FieldLabel>
              <Input
                id="subject"
                v-model="editingTemplate.subject"
                type="text"
                placeholder="Enter email subject"
              />
            </Field>

            <!-- Body Field -->
            <Field>
              <FieldLabel for="body" class="font-semibold">Email Body (HTML)</FieldLabel>
              <Textarea
                id="body"
                v-model="editingTemplate.body"
                rows="10"
                class="field-sizing-fixed font-mono text-sm"
                placeholder="Enter email body (HTML supported)"
              />
              <div class="flex flex-wrap gap-2 pt-0.5">
                <span v-for="tag in ['customer_name', 'customer_email', 'store_name', 'app_name']" :key="tag" 
                  class="px-2 py-1 bg-muted text-muted-foreground rounded-md text-[10px] font-mono cursor-default border"
                  v-text="'{{' + tag + '}}'"
                >
                </span>
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter class="gap-3">
            <Button variant="outline" @click="closeEditModal">
              Cancel
            </Button>
            <Button
              @click="saveTemplate"
              :disabled="saving"
            >
              <Spinner v-if="saving" />
              {{ saving ? 'Saving...' : 'Save Template' }}
            </Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>

    <!-- Preview Modal -->
    <Dialog :open="showPreviewModal && !!previewTemplate" @update:open="(open) => { if (!open) closePreviewModal(); }">
      <DialogContent class="sm:max-w-3xl">
        <template v-if="previewTemplate">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>{{ previewTemplate.app_name }} • {{ previewTemplate.template_name }}</DialogDescription>
          </DialogHeader>

          <div class="border rounded-xl overflow-hidden">
            <div class="px-6 py-4 border-b">
              <div class="flex items-start gap-4">
                <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Subject</span>
                <div class="text-sm font-semibold text-foreground flex-1">{{ previewTemplate.subject }}</div>
              </div>
            </div>

            <div class="bg-muted/50 max-h-[min(600px,60vh)] overflow-y-auto custom-scrollbar">
              <!-- Simulated Email Container: stays a white "paper", like a mail client renders it -->
              <div class="py-10 px-4 min-h-full flex justify-center">
                <div class="email-paper w-full max-w-[600px] rounded-xl border overflow-hidden">
                  <div class="p-10">
                    <div v-html="previewTemplate.body" class="email-preview-content prose prose-sm max-w-none"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" @click="closePreviewModal">
              Close Preview
            </Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* The preview imitates a mail client, so the email itself keeps a white canvas in every theme. */
.email-paper { background: #ffffff; }
.email-preview-content { 
  white-space: pre-wrap;
  overflow-wrap: break-word;
  color: #374151;
  line-height: 1.6;
  font-size: 14px;
}
.email-preview-content :deep(p) { margin-top: 0; margin-bottom: 1.25em; }
.email-preview-content :deep(a) { color: #1299A7; text-decoration: underline; font-weight: 500; }
.email-preview-content :deep(ul), .email-preview-content :deep(ol) { margin-top: 1.25em; margin-bottom: 1.25em; padding-left: 1.625em; }
.email-preview-content :deep(li) { margin-top: 0.5em; margin-bottom: 0.5em; }

</style>
