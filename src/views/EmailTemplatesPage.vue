<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import Swal from 'sweetalert2';
import { emailTemplateService, type EmailTemplate as ApiEmailTemplate } from '@/services/emailTemplateService';
import { ViewIcon, EditIcon, CloseIcon, LoadingIcon } from '@/components/icons';
import SearchInput from '@/components/common/SearchInput.vue';
import SelectInput from '@/components/common/SelectInput.vue';

interface EmailTemplate extends ApiEmailTemplate {
  app_name?: string;
  template_name?: string;
  template_type?: string;
}

const templates = ref<EmailTemplate[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const showEditModal = ref(false);
const showPreviewModal = ref(false);
const editingTemplate = ref<EmailTemplate | null>(null);
const previewTemplate = ref<EmailTemplate | null>(null);
const selectedAppId = ref<number | null>(null);
const selectedTemplateType = ref<string | null>(null);
const searchQuery = ref('');

onMounted(() => {
  fetchTemplates();
});

// Watch filter changes and refetch
watch([selectedAppId, selectedTemplateType], () => {
  fetchTemplates();
});

const fetchTemplates = async () => {
  try {
    loading.value = true;
    error.value = null;
    
    const filters: any = {};
    if (selectedAppId.value) filters.app_id = selectedAppId.value;
    if (selectedTemplateType.value) filters.type = selectedTemplateType.value;
    
    const response = await emailTemplateService.getAll(filters);
    
    if (response.success && response.data) {
      // Map API response to frontend format
      templates.value = response.data.data.map(template => ({
        ...template,
        app_name: template.app?.app_name || 'Unknown App',
        template_type: template.type as any,
        template_name: getTemplateTypeName(template.type)
      }));
    }
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || 'Failed to load email templates';
    error.value = errorMessage;
    console.error('Error fetching templates:', err);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: errorMessage,
    });
  } finally {
    loading.value = false;
  }
};

// Get unique apps from templates
const uniqueApps = computed(() => {
  const apps = new Map<number, { id: number; name: string }>();
  templates.value.forEach(template => {
    if (!apps.has(template.app_id)) {
      apps.set(template.app_id, { id: template.app_id, name: template.app_name || 'Unknown' });
    }
  });
  return Array.from(apps.values());
});

// Get unique template types from templates
const uniqueTemplateTypes = computed(() => {
  const types = new Set<string>();
  templates.value.forEach(template => {
    types.add(template.type);
  });
  return Array.from(types).map(type => ({
    value: type,
    name: getTemplateTypeName(type)
  }));
});

// Filter templates based on selected app and template type
const filteredTemplates = computed(() => {
  let filtered = templates.value;
  
  // Filter by app
  if (selectedAppId.value !== null) {
    filtered = filtered.filter(template => template.app_id === selectedAppId.value);
  }
  
  // Filter by template type
  if (selectedTemplateType.value !== null) {
    filtered = filtered.filter(template => template.type === selectedTemplateType.value);
  }
  
  // Search query filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(template => 
      template.subject.toLowerCase().includes(query) ||
      template.app_name?.toLowerCase().includes(query) ||
      template.template_name?.toLowerCase().includes(query) ||
      template.type.toLowerCase().includes(query)
    );
  }
  
  return filtered;
});

const getTemplateTypeName = (type: string) => {
  const types: Record<string, string> = {
    'install': 'Install Welcome',
    'uninstall': 'Uninstall Feedback',
    'after_7_days': 'After 7 Days'
  };
  return types[type] || type;
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
  showEditModal.value = false;
  editingTemplate.value = null;
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
    loading.value = true;
    
    // Update template via API
    await emailTemplateService.update(editingTemplate.value.id, {
      subject: editingTemplate.value.subject,
      body: editingTemplate.value.body,
      is_active: editingTemplate.value.is_active,
    });

    // Refresh templates list
    await fetchTemplates();
    
    closeEditModal();

    // Show success toast
    Swal.fire({
      icon: 'success',
      title: 'Template Updated!',
      text: 'Email template has been saved successfully.',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
    });
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || 'Failed to update template';
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: errorMessage,
    });
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-semibold text-dark">Email Templates</h1>
    </div>

    <!-- Filter/Search Bar -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div class="flex flex-wrap items-center gap-4">
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
            label="App"
            placeholder="All Apps"
            select-class="w-48"
          >
            <option v-for="app in uniqueApps" :key="app.id" :value="app.id">
              {{ app.name }}
            </option>
          </SelectInput>

          <!-- Template Type Filter -->
          <SelectInput
            v-model="selectedTemplateType"
            label="Type"
            placeholder="All Types"
            select-class="w-48"
          >
            <option v-for="type in uniqueTemplateTypes" :key="type.value" :value="type.value">
              {{ type.name }}
            </option>
          </SelectInput>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="bg-white rounded-lg border border-gray-200">
      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <LoadingIcon size="lg" color-class="text-teal" />
        <span class="text-sm">Loading templates...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredTemplates.length === 0" class="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg class="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p class="text-sm italic">No email templates found matching your criteria</p>
      </div>

      <!-- Templates Table -->
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">App Name</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Template Name</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Subject</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Body</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Status</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="template in filteredTemplates" :key="template.id" class="hover:bg-gray-50/50 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ template.app_name }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900 font-medium">{{ template.template_name }}</div>
                <div class="text-xs text-gray-500 font-mono">{{ template.type }}</div>
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-gray-900 max-w-xs truncate font-medium">{{ template.subject }}</div>
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-gray-500 max-w-md line-clamp-1 italic">{{ getShortBody(template.body) }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span 
                  :class="[
                      'p-[4px_12px_6px] text-xs font-medium rounded-full',
                    template.is_active 
                        ? 'bg-green-lighter text-green' 
                        : 'bg-gray-200 text-gray-600'
                  ]"
                >
                  {{ template.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex items-center gap-3">
                  <button
                    @click="openEditModal(template)"
                      class="text-teal hover:text-teal-dark transition-colors"
                    title="Edit"
                  >
                    <EditIcon class="w-5 h-5" />
                  </button>
                  <button
                    @click="openPreviewModal(template)"
                      class="text-blue hover:text-blue-600 transition-colors"
                    title="Preview"
                  >
                    <ViewIcon class="w-5 h-5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="showEditModal && editingTemplate" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-dark/20 backdrop-blur-sm transition-opacity" @click="closeEditModal"></div>

        <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-3xl w-full overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Edit Email Template</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ editingTemplate.app_name }} • {{ editingTemplate.template_name }}</p>
            </div>
            <button @click="closeEditModal" class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1">
              <CloseIcon class="w-6 h-6" />
            </button>
          </div>

          <div class="p-6 space-y-5">
            <!-- Active Toggle -->
            <div class="flex items-center justify-between p-4 bg-teal/5 rounded-xl border border-teal/10">
              <div>
                <label class="text-sm font-bold text-gray-900">Template Status</label>
                <p class="text-xs text-gray-500">Enable or disable this email template</p>
              </div>
              <button
                @click="editingTemplate.is_active = !editingTemplate.is_active"
                :class="[
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  editingTemplate.is_active ? 'bg-teal' : 'bg-gray-200'
                ]"
              >
                <span :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out',
                  editingTemplate.is_active ? 'translate-x-5' : 'translate-x-0'
                ]" />
              </button>
            </div>

            <!-- Subject Field -->
            <div class="space-y-1.5">
              <label for="subject" class="block text-sm font-bold text-gray-700">Email Subject</label>
              <input
                id="subject"
                v-model="editingTemplate.subject"
                type="text"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all placeholder:text-gray-400"
                placeholder="Enter email subject"
              />
            </div>

            <!-- Body Field -->
            <div class="space-y-1.5">
              <label for="body" class="block text-sm font-bold text-gray-700">Email Body (HTML)</label>
              <textarea
                id="body"
                v-model="editingTemplate.body"
                rows="10"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all font-mono text-sm resize-none"
                placeholder="Enter email body (HTML supported)"
              ></textarea>
              <div class="flex flex-wrap gap-2 pt-2">
                <span v-for="tag in ['customer_name', 'customer_email', 'store_name', 'app_name']" :key="tag" 
                  class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-mono cursor-default hover:bg-gray-200 transition-colors border border-gray-200"
                  v-text="'{{' + tag + '}}'"
                >
                </span>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
            <button @click="closeEditModal" class="px-5 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors cursor-pointer">
              Cancel
            </button>
            <button
              @click="saveTemplate"
              :disabled="loading"
              class="px-6 py-2 bg-teal text-white rounded-lg text-sm font-bold hover:bg-teal-dark transition-all shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <LoadingIcon v-if="loading" size="sm" color-class="text-white" />
              {{ loading ? 'Saving...' : 'Save Template' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <div v-if="showPreviewModal && previewTemplate" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-dark/20 backdrop-blur-sm transition-opacity" @click="closePreviewModal"></div>

        <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-3xl w-full overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Email Preview</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ previewTemplate.app_name }} • {{ previewTemplate.template_name }}</p>
            </div>
            <button @click="closePreviewModal" class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1">
              <CloseIcon class="w-6 h-6" />
            </button>
          </div>

          <div class="p-6">
            <div class="border border-gray-200 rounded-xl overflow-hidden shadow-inner">
              <div class="bg-gray-50 px-4 py-3 border-b border-gray-100">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Subject</span>
                  <div class="h-4 w-[1px] bg-gray-200"></div>
                  <div class="text-sm font-bold text-gray-900">{{ previewTemplate.subject }}</div>
                </div>
              </div>

              <div class="p-8 bg-white max-h-[500px] overflow-y-auto custom-scrollbar">
                <div v-html="previewTemplate.body" class="email-preview-content prose prose-sm max-w-none"></div>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button @click="closePreviewModal" class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 transition-all cursor-pointer">
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.email-preview-content :deep(p) { margin-bottom: 1em; }
.email-preview-content :deep(a) { color: #1299A7; text-decoration: underline; }
.email-preview-content :deep(ul), .email-preview-content :deep(ol) { margin: 1em 0; padding-left: 1.5em; }
.email-preview-content :deep(li) { margin-bottom: 0.5em; }

.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
</style>
