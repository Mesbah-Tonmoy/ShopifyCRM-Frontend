<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { aclService, type Role, type Permission } from '@/services/aclService';
import { useAuthStore } from '@/stores/auth';
import { EditIcon, DeleteIcon, PlusIcon, CloseIcon } from '@/components/icons';
import Swal from 'sweetalert2';

const roles = ref<Role[]>([]);
const permissionsList = ref<Permission[]>([]);
const loading = ref(false);
const authStore = useAuthStore();

const showModal = ref(false);
const isEditing = ref(false);
const currentRole = ref<{ id?: number, name: string, description: string, permission_ids: number[] }>({
  name: '',
  description: '',
  permission_ids: []
});

const fetchRoles = async () => {
  loading.value = true;
  try {
    const response = await aclService.getRoles();
    if (response.success) {
      roles.value = response.data;
    }
  } catch (error) {
    console.error('Error fetching roles:', error);
  } finally {
    loading.value = false;
  }
};

const fetchPermissions = async () => {
  try {
    const response = await aclService.getPermissions();
    if (response.success) {
      permissionsList.value = response.data;
    }
  } catch (error) {
    console.error('Error fetching permissions:', error);
  }
};

onMounted(() => {
  fetchRoles();
  fetchPermissions();
});

const openAddModal = () => {
  isEditing.value = false;
  currentRole.value = {
    name: '',
    description: '',
    permission_ids: []
  };
  showModal.value = true;
};

const openEditModal = (role: Role) => {
  isEditing.value = true;
  currentRole.value = {
    id: role.id,
    name: role.name,
    description: role.description || '',
    permission_ids: role.permissions?.map(p => p.id) || []
  };
  showModal.value = true;
};

const saveRole = async () => {
  try {
    const payload = {
      name: currentRole.value.name,
      description: currentRole.value.description,
      permissions: currentRole.value.permission_ids
    };

    let response;
    if (isEditing.value && currentRole.value.id) {
      response = await aclService.updateRole(currentRole.value.id, payload);
    } else {
      response = await aclService.createRole(payload);
    }

    if (response.success) {
      Swal.fire('Success', response.message, 'success');
      showModal.value = false;
      fetchRoles();
    }
  } catch (error: any) {
    Swal.fire('Error', error.response?.data?.message || 'Failed to save role', 'error');
  }
};

const deleteRole = async (id: number) => {
  const result = await Swal.fire({
    title: 'Are you sure?',
    text: "This will remove the role from all users assigned to it!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Yes, delete it!'
  });

  if (result.isConfirmed) {
    try {
      const response = await aclService.deleteRole(id) as any;
      if (response.success) {
        Swal.fire('Deleted!', response.message, 'success');
        fetchRoles();
      }
    } catch (error) {
      Swal.fire('Error', 'Failed to delete role', 'error');
    }
  }
};
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-dark">Roles</h1>
        <p class="text-b4 text-mid mt-1">Manage user roles and their associated permissions</p>
      </div>
      <button 
        v-if="authStore.hasPermission('roles.add')"
        @click="openAddModal" 
        class="bg-teal text-white px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
      >
        <PlusIcon size="sm" />
        Add Role
      </button>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500">Loading roles...</div>
    
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      <div
        v-for="role in roles"
        :key="role.id"
        class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all"
      >
        <div class="flex items-start justify-between mb-4">
          <h3 class="text-lg font-bold text-dark">{{ role.name }}</h3>
          <div class="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 font-mono">{{ role.slug }}</div>
        </div>
        <p class="text-sm text-gray-500 mb-6 h-10 overflow-hidden line-clamp-2">{{ role.description || 'No description provided' }}</p>
        
        <div class="flex items-center text-sm text-gray-600 mb-6">
          <svg class="w-4 h-4 mr-2 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {{ role.permissions?.length || 0 }} Permissions assigned
        </div>

        <div class="flex space-x-2">
          <button 
            v-if="authStore.hasPermission('roles.edit')"
            @click="openEditModal(role)" 
            class="flex items-center justify-center gap-2 flex-1 px-4 py-2 border border-teal text-teal rounded-lg font-medium hover:bg-teal hover:text-white transition-colors"
          >
            <EditIcon />
            Edit Role
          </button>
          <button 
            v-if="authStore.hasPermission('roles.edit')"
            @click="deleteRole(role.id)" 
            class="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-lg font-medium hover:bg-red-500 hover:text-white transition-colors"
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
    </div>

    <!-- Role Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50 transition-opacity" @click="showModal = false"></div>

      <div class="relative bg-white rounded-xl shadow-2xl transform transition-all max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-100/50">
          <h3 class="text-lg font-bold text-gray-900">{{ isEditing ? 'Edit Role' : 'Create New Role' }}</h3>
          <button @click="showModal = false" class="text-gray-400 hover:text-gray-600">
            <CloseIcon size="lg" />
          </button>
        </div>

        <div class="p-6 overflow-y-auto flex-1">
          <form id="roleForm" @submit.prevent="saveRole">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label for="roleName" class="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">Role Name</label>
                <input id="roleName" name="name" v-model="currentRole.name" type="text" required placeholder="e.g. Compliance Manager" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal focus:border-teal">
              </div>
              <div>
                <label for="roleDescription" class="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">Description</label>
                <input id="roleDescription" name="description" v-model="currentRole.description" type="text" placeholder="Short description of this role" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal focus:border-teal">
              </div>
            </div>

            <div class="mb-2">
              <label class="block text-sm font-medium text-gray-700 mb-3">Assign Permissions</label>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div v-for="permission in permissionsList" :key="permission.id" class="flex items-center p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                  <input type="checkbox" :id="'p-'+permission.id" :value="permission.id" v-model="currentRole.permission_ids" class="rounded text-teal focus:ring-teal h-4 w-4">
                  <label :for="'p-'+permission.id" class="ml-3 text-sm text-gray-600 cursor-pointer select-none">
                    <div class="font-medium text-dark">{{ permission.name }}</div>
                    <div class="text-xs text-gray-400">{{ permission.slug }}</div>
                  </label>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div class="p-6 border-t border-gray-100 flex gap-3">
          <button type="button" @click="showModal = false" class="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg transition-all font-medium hover:bg-gray-50">Cancel</button>
          <button 
            type="submit" 
            form="roleForm" 
            :disabled="!currentRole.name"
            class="flex-1 px-4 py-2.5 bg-teal text-white rounded-lg font-medium hover:shadow-lg hover:shadow-teal/20 transition-all disabled:opacity-50"
          >
            {{ isEditing ? 'Update Role' : 'Create Role' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
