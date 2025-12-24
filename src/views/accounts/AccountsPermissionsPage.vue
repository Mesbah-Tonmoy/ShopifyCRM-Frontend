<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { aclService, type Permission, type Role } from '@/services/aclService';
import Swal from 'sweetalert2';
import { CloseIcon, PlusIcon, LoadingIcon } from '@/components/icons';

const roles = ref<Role[]>([]);
const allPermissions = ref<Permission[]>([]);
const loading = ref(false);
const saving = ref(false);
const isCreating = ref(false);
const showAddModal = ref(false);
const showPermissionModal = ref(false);
const isCreatingPermission = ref(false);
const selectedRoleId = ref<number | null>(null);
const selectedPermissionIds = ref<number[]>([]);

const newRole = ref({
  name: '',
  description: ''
});

const newPermission = ref({
  name: '',
  slug: '',
  description: ''
});

const fetchInitialData = async () => {
  loading.value = true;
  try {
    const [rolesRes, permsRes] = await Promise.all([
      aclService.getRoles(),
      aclService.getPermissions()
    ]);
    
    if (rolesRes.success) {
      roles.value = rolesRes.data;
      const firstRole = roles.value[0];
      if (firstRole) {
        selectRole(firstRole);
      }
    }
    
    if (permsRes.success) {
      allPermissions.value = permsRes.data;
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    loading.value = false;
  }
};

const selectRole = (role: Role) => {
  selectedRoleId.value = role.id;
  selectedPermissionIds.value = role.permissions?.map(p => p.id) || [];
};

const isPermissionSelected = (id: number) => {
  return selectedPermissionIds.value.includes(id);
};

const togglePermission = (id: number) => {
  const index = selectedPermissionIds.value.indexOf(id);
  if (index > -1) {
    selectedPermissionIds.value.splice(index, 1);
  } else {
    selectedPermissionIds.value.push(id);
  }
};

const isGroupSelected = (groupPermissions: Permission[]) => {
  return groupPermissions.length > 0 && groupPermissions.every(p => selectedPermissionIds.value.includes(p.id));
};

const toggleGroup = (groupPermissions: Permission[]) => {
  const allSelected = isGroupSelected(groupPermissions);
  groupPermissions.forEach(p => {
    const index = selectedPermissionIds.value.indexOf(p.id);
    if (allSelected) {
      if (index > -1) selectedPermissionIds.value.splice(index, 1);
    } else {
      if (index === -1) selectedPermissionIds.value.push(p.id);
    }
  });
};

const permissionGroups = computed<Record<string, { title: string, permissions: Permission[] }>>(() => {
  const groups: Record<string, { title: string, permissions: Permission[] }> = {
    roles: { title: 'Roles', permissions: [] },
    permissions: { title: 'Permission Groups', permissions: [] },
    users: { title: 'Users', permissions: [] },
    installations: { title: 'Installations', permissions: [] },
    email_templates: { title: 'Email Templates', permissions: [] },
  };

  allPermissions.value.forEach(p => {
    const key = p.slug.split('.')[0] || 'other';
    if (groups[key]) {
      groups[key].permissions.push(p);
    } else {
      const title = key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ');
      groups[key] = { title, permissions: [p] };
    }
  });

  return groups;
});

const savePermissions = async () => {
  if (!selectedRoleId.value) return;
  
  saving.value = true;
  try {
    const roleId = selectedRoleId.value;
    const role = roles.value.find(r => r.id === roleId);
    if (!role) return;

    const response = await aclService.updateRole(roleId, {
      name: role.name,
      description: role.description || '',
      permissions: selectedPermissionIds.value
    });

    if (response.success) {
      Swal.fire({
        title: 'Success',
        text: 'Permissions updated successfully',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
      // Update local role data
      const roleToUpdate = roles.value.find(r => r.id === selectedRoleId.value);
      if (roleToUpdate) {
        roleToUpdate.permissions = allPermissions.value.filter(p => 
          selectedPermissionIds.value.includes(p.id)
        );
      }
    }
  } catch (error) {
    Swal.fire('Error', 'Failed to update permissions', 'error');
  } finally {
    saving.value = false;
  }
};

const handleCreateRole = async () => {
  if (!newRole.value.name) return;
  
  isCreating.value = true;
  try {
    const response = await aclService.createRole({
      name: newRole.value.name,
      description: newRole.value.description,
      slug: newRole.value.name.toLowerCase().replace(/\s+/g, '-'),
      permissions: []
    });

    if (response.success) {
      roles.value.push(response.data);
      selectRole(response.data);
      showAddModal.value = false;
      newRole.value = { name: '', description: '' };
      
      Swal.fire({
        title: 'Success',
        text: 'Role created successfully',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  } catch (error) {
    Swal.fire('Error', 'Failed to create role', 'error');
  } finally {
    isCreating.value = false;
  }
};

const handleCreatePermission = async () => {
  if (!newPermission.value.name || !newPermission.value.slug) return;
  
  isCreatingPermission.value = true;
  try {
    const response = await aclService.createPermission({
      name: newPermission.value.name,
      slug: newPermission.value.slug,
      description: newPermission.value.description
    });

    if (response.success) {
      allPermissions.value.push(response.data);
      showPermissionModal.value = false;
      newPermission.value = { name: '', slug: '', description: '' };
      
      Swal.fire({
        title: 'Success',
        text: 'Permission created successfully',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  } catch (error) {
    Swal.fire('Error', 'Failed to create permission', 'error');
  } finally {
    isCreatingPermission.value = false;
  }
};

onMounted(fetchInitialData);
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-dark">Permissions List</h1>
      <p class="text-b4 text-mid mt-1">Manage user permissions</p>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <!-- Top Active Roles and Add Button -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <button 
            v-for="role in roles" 
            :key="role.id"
            @click="selectRole(role)"
            :class="[
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border cursor-pointer',
              selectedRoleId === role.id 
                ? 'bg-teal/5 text-teal border-teal/20 shadow-sm' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            ]"
          >
            {{ role.name }}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button 
            @click="showPermissionModal = true"
            class="bg-teal text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
          >
            <PlusIcon size="sm" />
            Add Permission
          </button>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 p-8">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <LoadingIcon size="lg" color-class="text-teal" />
        <span class="text-sm">Loading Permission Matrix...</span>
      </div>

      <div v-else class="space-y-12">
        <!-- Accounts Section -->
        <div class="space-y-6">
          <h2 class="text-xl font-bold text-gray-900 border-l-4 border-teal pl-4">Accounts</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-8">
            <!-- Group: Roles -->
            <div class="space-y-4" v-if="permissionGroups.roles">
              <h3 class="text-sm font-bold text-gray-900 mb-4">{{ permissionGroups.roles.title }}</h3>
              <div class="space-y-3">
                <label class="flex items-center group cursor-pointer">
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isGroupSelected(permissionGroups.roles.permissions)"
                    @change="toggleGroup(permissionGroups.roles.permissions)"
                  >
                  <span class="ml-3 text-sm font-semibold text-gray-700 group-hover:text-teal transition-colors">Select All</span>
                </label>
                <label 
                  v-for="perm in permissionGroups.roles.permissions" 
                  :key="perm.id" 
                  class="flex items-center group cursor-pointer"
                >
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isPermissionSelected(perm.id)"
                    @change="togglePermission(perm.id)"
                  >
                  <span class="ml-3 text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{{ perm.name }}</span>
                </label>
              </div>
            </div>

            <!-- Group: Permission Groups -->
            <div class="space-y-4" v-if="permissionGroups.permissions">
              <h3 class="text-sm font-bold text-gray-900 mb-4">{{ permissionGroups.permissions.title }}</h3>
              <div class="space-y-3">
                <label class="flex items-center group cursor-pointer">
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isGroupSelected(permissionGroups.permissions.permissions)"
                    @change="toggleGroup(permissionGroups.permissions.permissions)"
                  >
                  <span class="ml-3 text-sm font-semibold text-gray-700 group-hover:text-teal transition-colors">Select All</span>
                </label>
                <label 
                  v-for="perm in permissionGroups.permissions.permissions" 
                  :key="perm.id" 
                  class="flex items-center group cursor-pointer"
                >
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isPermissionSelected(perm.id)"
                    @change="togglePermission(perm.id)"
                  >
                  <span class="ml-3 text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{{ perm.name }}</span>
                </label>
              </div>
            </div>

            <!-- Group: Users -->
            <div class="space-y-4" v-if="permissionGroups.users">
              <h3 class="text-sm font-bold text-gray-900 mb-4">{{ permissionGroups.users.title }}</h3>
              <div class="space-y-3">
                <label class="flex items-center group cursor-pointer">
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isGroupSelected(permissionGroups.users.permissions)"
                    @change="toggleGroup(permissionGroups.users.permissions)"
                  >
                  <span class="ml-3 text-sm font-semibold text-gray-700 group-hover:text-teal transition-colors">Select All</span>
                </label>
                <label 
                  v-for="perm in permissionGroups.users.permissions" 
                  :key="perm.id" 
                  class="flex items-center group cursor-pointer"
                >
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isPermissionSelected(perm.id)"
                    @change="togglePermission(perm.id)"
                  >
                  <span class="ml-3 text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{{ perm.name }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Data Section -->
        <div class="space-y-6 pt-6 border-t border-gray-100">
          <h2 class="text-xl font-bold text-gray-900 border-l-4 border-teal pl-4">Data</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-8">
            <!-- Group: Installations -->
            <div class="space-y-4" v-if="permissionGroups.installations">
              <h3 class="text-sm font-bold text-gray-900 mb-4">{{ permissionGroups.installations.title }}</h3>
              <div class="space-y-3">
                <label class="flex items-center group cursor-pointer">
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isGroupSelected(permissionGroups.installations.permissions)"
                    @change="toggleGroup(permissionGroups.installations.permissions)"
                  >
                  <span class="ml-3 text-sm font-semibold text-gray-700 group-hover:text-teal transition-colors">Select All</span>
                </label>
                <label 
                  v-for="perm in permissionGroups.installations.permissions" 
                  :key="perm.id" 
                  class="flex items-center group cursor-pointer"
                >
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isPermissionSelected(perm.id)"
                    @change="togglePermission(perm.id)"
                  >
                  <span class="ml-3 text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{{ perm.name }}</span>
                </label>
              </div>
            </div>

            <!-- Group: Email Templates -->
            <div class="space-y-4" v-if="permissionGroups.email_templates">
              <h3 class="text-sm font-bold text-gray-900 mb-4">{{ permissionGroups.email_templates.title }}</h3>
              <div class="space-y-3">
                <label class="flex items-center group cursor-pointer">
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal focus:ring-offset-0 cursor-pointer"
                    :checked="isGroupSelected(permissionGroups.email_templates.permissions)"
                    @change="toggleGroup(permissionGroups.email_templates.permissions)"
                  >
                  <span class="ml-3 text-sm font-semibold text-gray-700 group-hover:text-teal transition-colors">Select All</span>
                </label>
                <label 
                  v-for="perm in permissionGroups.email_templates.permissions" 
                  :key="perm.id" 
                  class="flex items-center group cursor-pointer"
                >
                  <input 
                    type="checkbox" 
                    class="h-4 w-4 rounded border-gray-300 text-teal focus:ring-teal cursor-pointer"
                    :checked="isPermissionSelected(perm.id)"
                    @change="togglePermission(perm.id)"
                  >
                  <span class="ml-3 text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{{ perm.name }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button Bar -->
        <div class="flex justify-end pt-8 border-t border-gray-100">
          <button 
            @click="savePermissions"
            :disabled="saving || !selectedRoleId"
            class="bg-teal text-white px-8 py-2.5 rounded-lg font-bold hover:bg-teal-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            <LoadingIcon v-if="saving" size="sm" color-class="text-white" />
            {{ saving ? 'Saving Changes...' : 'Save Permissions' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Add Role Modal -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-gray-500/25 backdrop-blur-sm transition-opacity" @click="showAddModal = false"></div>

        <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-md w-full overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 class="text-lg font-bold text-gray-900">Add New Role</h3>
            <button @click="showAddModal = false" class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
              <CloseIcon class="w-6 h-6" />
            </button>
          </div>

          <form @submit.prevent="handleCreateRole" class="p-6 space-y-5">
            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Role Name</label>
              <input
                v-model="newRole.name"
                type="text"
                required
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all placeholder:text-gray-400"
                placeholder="e.g. Sales Manager"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Description</label>
              <textarea
                v-model="newRole.description"
                rows="3"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all placeholder:text-gray-400 resize-none"
                placeholder="Briefly describe what this role can do..."
              ></textarea>
            </div>

            <div class="pt-2 flex justify-end gap-3">
              <button 
                type="button"
                @click="showAddModal = false" 
                class="px-5 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isCreating || !newRole.name"
                class="px-6 py-2 bg-teal text-white rounded-lg text-sm font-bold hover:bg-teal-dark transition-all shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                <LoadingIcon v-if="isCreating" size="sm" color-class="text-white" />
                {{ isCreating ? 'Creating...' : 'Create Role' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Add Permission Modal -->
    <div v-if="showPermissionModal" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="fixed inset-0 bg-gray-500/25 backdrop-blur-sm transition-opacity" @click="showPermissionModal = false"></div>

        <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-md w-full overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 class="text-lg font-bold text-gray-900">Add New Permission</h3>
            <button @click="showPermissionModal = false" class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
              <CloseIcon class="w-6 h-6" />
            </button>
          </div>

          <form @submit.prevent="handleCreatePermission" class="p-6 space-y-5">
            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Permission Name</label>
              <input
                v-model="newPermission.name"
                type="text"
                required
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all placeholder:text-gray-400"
                placeholder="e.g. View Reports"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Permission Slug</label>
              <input
                v-model="newPermission.slug"
                type="text"
                required
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all placeholder:text-gray-400"
                placeholder="e.g. reports.view"
              />
              <p class="text-[10px] text-gray-400">Use dot notation: module.action (e.g. users.edit)</p>
            </div>

            <div class="space-y-1.5">
              <label class="block text-sm font-bold text-gray-700">Description</label>
              <textarea
                v-model="newPermission.description"
                rows="3"
                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-teal focus:border-teal outline-none transition-all placeholder:text-gray-400 resize-none"
                placeholder="What does this permission allow?"
              ></textarea>
            </div>

            <div class="pt-2 flex justify-end gap-3">
              <button 
                type="button"
                @click="showPermissionModal = false" 
                class="px-5 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isCreatingPermission || !newPermission.name || !newPermission.slug"
                class="px-6 py-2 bg-teal text-white rounded-lg text-sm font-bold hover:bg-teal-dark transition-all shadow-sm hover:shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                <LoadingIcon v-if="isCreatingPermission" size="sm" color-class="text-white" />
                {{ isCreatingPermission ? 'Creating...' : 'Create Permission' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
