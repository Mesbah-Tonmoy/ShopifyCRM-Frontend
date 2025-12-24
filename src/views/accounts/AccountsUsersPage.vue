<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { aclService, type User, type Role } from '@/services/aclService';
import { EditIcon, DeleteIcon, PlusIcon, LoadingIcon } from '@/components/icons';
import SearchInput from '@/components/common/SearchInput.vue';
import Swal from 'sweetalert2';

const users = ref<User[]>([]);
const rolesList = ref<Role[]>([]);
const loading = ref(false);
const searchQuery = ref('');
const selectedRole = ref('all');

// Computed roles with counts for filtering
const roleFilters = computed(() => {
  const allUsersCount = users.value.length;
  
  const filters = rolesList.value.map(role => {
    const count = users.value.filter(user => 
      user.roles?.some(r => r.id === role.id)
    ).length;
    
    return {
      name: role.name,
      value: role.slug,
      count: count
    };
  });
  
  return [
    { name: 'All Users', value: 'all', count: allUsersCount },
    ...filters
  ];
});

// Filtered users based on role and search query
const filteredUsers = computed(() => {
  return users.value.filter(user => {
    const matchesSearch = !searchQuery.value || 
      user.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.value.toLowerCase());
      
    const matchesRole = selectedRole.value === 'all' || 
      user.roles?.some(role => role.slug === selectedRole.value);
      
    return matchesSearch && matchesRole;
  });
});

// Modal state
const showModal = ref(false);
const isEditing = ref(false);
const currentUser = ref<Partial<User & { password?: string, role_ids: number[] }>>({
  name: '',
  email: '',
  password: '',
  role_ids: []
});

const fetchUsers = async () => {
  loading.value = true;
  try {
    const response = await aclService.getUsers();
    if (response.success) {
      users.value = response.data;
    }
  } catch (error) {
    console.error('Error fetching users:', error);
  } finally {
    loading.value = false;
  }
};

const fetchRoles = async () => {
  try {
    const response = await aclService.getRoles();
    if (response.success) {
      rolesList.value = response.data;
    }
  } catch (error) {
    console.error('Error fetching roles:', error);
  }
};

onMounted(() => {
  fetchUsers();
  fetchRoles();
});

const openAddModal = () => {
  isEditing.value = false;
  currentUser.value = {
    name: '',
    email: '',
    password: '',
    role_ids: []
  };
  showModal.value = true;
};

const openEditModal = (user: User) => {
  isEditing.value = true;
  currentUser.value = {
    id: user.id,
    name: user.name,
    email: user.email,
    role_ids: user.roles?.map(r => r.id) || []
  };
  showModal.value = true;
};

const saveUser = async () => {
  try {
    const payload = {
      name: currentUser.value.name,
      email: currentUser.value.email,
      roles: currentUser.value.role_ids,
      password: currentUser.value.password
    };

    let response;
    if (isEditing.value && currentUser.value.id) {
      response = await aclService.updateUser(currentUser.value.id, payload);
    } else {
      response = await aclService.createUser(payload);
    }

    if (response.success) {
      Swal.fire('Success', response.message, 'success');
      showModal.value = false;
      fetchUsers();
    }
  } catch (error: any) {
    Swal.fire('Error', error.response?.data?.message || 'Failed to save user', 'error');
  }
};

const deleteUser = async (id: number) => {
  const result = await Swal.fire({
    title: 'Are you sure?',
    text: "You won't be able to revert this!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Yes, delete it!'
  });

  if (result.isConfirmed) {
    try {
      const response = await aclService.deleteUser(id) as any;
      if (response.success) {
        Swal.fire('Deleted!', response.message, 'success');
        fetchUsers();
      }
    } catch (error) {
      Swal.fire('Error', 'Failed to delete user', 'error');
    }
  }
};
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-dark">Users List</h1>
      <p class="text-b4 text-mid mt-1">Manage user accounts and assigned roles</p>
    </div>

    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <!-- Search Bar -->
        <SearchInput 
          v-model="searchQuery" 
          placeholder="Search" 
          container-class="max-w-[250px] flex-1"
        />

        <!-- Roles and Search Container -->
        <div class="flex flex-wrap items-center gap-4 flex-1">
          <!-- Roles Filters -->
          <div class="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            <button 
              v-for="role in roleFilters" 
              :key="role.value"
              @click="selectedRole = role.value"
              :class="[
                'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border cursor-pointer',
                selectedRole === role.value 
                  ? 'bg-teal/5 text-teal border-teal/20' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              ]"
            >
              {{ role.name }} <span class="ml-1 opacity-60">({{ role.count }})</span>
            </button>
          </div>
        </div>

        <!-- Add User Button -->
        <button @click="openAddModal" class="bg-teal text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-all flex items-center gap-2 shadow-sm hover:shadow-md">
          <PlusIcon size="sm" />
          Add New User
        </button>
      </div>
    </div>

    <div class="bg-white rounded-lg border border-gray-200">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50/50">
            <tr>
              <th scope="col" class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Name</th>
              <th scope="col" class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Email</th>
              <th scope="col" class="px-6 py-4 text-left text-sm font-semibold text-gray-600">Roles</th>
              <th scope="col" class="px-6 py-4 text-right text-sm font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="loading">
              <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                <div class="flex items-center justify-center gap-2">
                  <LoadingIcon size="sm" color-class="text-teal" />
                  Loading users...
                </div>
              </td>
            </tr>
            <tr v-else-if="filteredUsers.length === 0">
              <td colspan="4" class="px-6 py-4 text-center text-gray-500 italic">No users found match your criteria</td>
            </tr>
            <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-gray-50/50 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                  <div class="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center mr-3 overflow-hidden">
                    <img v-if="user.image" :src="user.image" :alt="user.name" class="w-full h-full object-cover">
                    <svg v-else class="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div class="text-sm font-medium text-gray-900">{{ user.name }}</div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ user.email }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex flex-wrap gap-1">
                  <span v-for="role in user.roles" :key="role.id" class="p-[4px_12px_6px] bg-blue-50 text-blue-600 text-xs rounded-full">
                    {{ role.name }}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                <div class="flex items-center justify-end gap-2">
                  <button @click="openEditModal(user)" class="inline-flex items-center px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-teal-500 bg-white hover:bg-teal-50 transition-colors gap-1.5">
                    <EditIcon size="md" />Edit
                  </button>
                  <button @click="user.id && deleteUser(user.id)" class="inline-flex items-center px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-red-500 bg-white hover:bg-red-50 transition-colors gap-1.5">
                    <DeleteIcon size="md" />Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- User Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-bold text-dark">{{ isEditing ? 'Edit User' : 'Add New User' }}</h2>
          <button @click="showModal = false" class="text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="saveUser">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input v-model="currentUser.name" type="text" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal focus:border-teal">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input v-model="currentUser.email" type="email" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal focus:border-teal">
            </div>
            <div v-if="!isEditing">
              <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input v-model="currentUser.password" type="password" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-teal focus:border-teal">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Roles</label>
              <div class="grid grid-cols-2 gap-2">
                <label v-for="role in rolesList" :key="role.id" class="flex items-center space-x-2 text-sm">
                  <input type="checkbox" :value="role.id" v-model="currentUser.role_ids" class="rounded text-teal focus:ring-teal">
                  <span>{{ role.name }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="mt-8 flex gap-3">
            <button type="button" @click="showModal = false" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" class="flex-1 px-4 py-2 bg-teal text-white rounded-lg font-medium hover:bg-teal-dark">
              {{ isEditing ? 'Update User' : 'Create User' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
