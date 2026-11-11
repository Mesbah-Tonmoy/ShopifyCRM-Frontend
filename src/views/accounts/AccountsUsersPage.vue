<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { aclService, type User, type Role } from '@/services/aclService';
import { useAuthStore } from '@/stores/auth';
import { Plus, Pencil, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import SearchInput from '@/components/common/SearchInput.vue';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { errorMessage } from '@/utils/errors';
import { toggleInList } from '@/lib/list';

const users = ref<User[]>([]);
const rolesList = ref<Role[]>([]);
const loading = ref(false);
const searchQuery = ref('');
const selectedRole = ref('all');
const authStore = useAuthStore();
const isSaving = ref(false);

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
  users.value = []; // Clear old data to ensure skeletons are the only thing visible
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
  isSaving.value = true;
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
      toast.success(response.message || 'User saved');
      showModal.value = false;
      fetchUsers();
    }
  } catch (error) {
    toast.error('Error', { description: errorMessage(error, 'Failed to save user') });
  } finally {
    isSaving.value = false;
  }
};

const deleteUser = async (id: number) => {
  const { confirmed } = await confirmDialog({
    title: 'Are you sure?',
    description: "You won't be able to revert this!",
    confirmText: 'Yes, delete it!',
    destructive: true
  });

  if (confirmed) {
    const loadingId = toast.loading('Deleting...', { description: 'Please wait while we delete the user' });

    try {
      const response = await aclService.deleteUser(id);
      if (response.success) {
        toast.success(response.message, { id: loadingId, description: undefined });
        fetchUsers();
      } else {
        toast.dismiss(loadingId);
      }
    } catch {
      toast.error('Error', { id: loadingId, description: 'Failed to delete user' });
    }
  }
};

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  currentUser.value.password = password;
};
</script>

<template>
  <div>
    <PageHeader 
      title="Users List" 
      description="Manage user accounts and assigned roles" 
    />

    <Card class="mb-6 py-4">
      <CardContent class="px-4">
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
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              :spacing="2"
              :model-value="selectedRole"
              class="max-w-full overflow-x-auto no-scrollbar pb-1 md:pb-0"
              @update:model-value="(v) => typeof v === 'string' && v && (selectedRole = v)"
            >
              <ToggleGroupItem
                v-for="role in roleFilters"
                :key="role.value"
                :value="role.value"
              >
                {{ role.name }} <span class="ml-1 opacity-60">({{ role.count }})</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <!-- Add User Button -->
          <Button
            v-if="authStore.hasPermission('users.add')"
            @click="openAddModal"
          >
            <Plus />
            Add New User
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card class="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader class="bg-muted/50">
          <TableRow>
            <TableHead class="px-6">Name</TableHead>
            <TableHead class="px-6">Email</TableHead>
            <TableHead class="px-6">Roles</TableHead>
            <TableHead class="px-6 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell class="px-6 py-4">
                <div class="flex items-center">
                  <SkeletonLoader width="32px" height="32px" custom-class="rounded-full mr-3" />
                  <SkeletonLoader width="120px" height="16px" />
                </div>
              </TableCell>
              <TableCell class="px-6 py-4">
                <SkeletonLoader width="180px" height="16px" />
              </TableCell>
              <TableCell class="px-6 py-4">
                <div class="flex gap-1">
                  <SkeletonLoader width="60px" height="24px" custom-class="rounded-full" />
                  <SkeletonLoader width="70px" height="24px" custom-class="rounded-full" />
                </div>
              </TableCell>
              <TableCell class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <SkeletonLoader width="80px" height="34px" custom-class="rounded-lg" />
                  <SkeletonLoader width="80px" height="34px" custom-class="rounded-lg" />
                </div>
              </TableCell>
            </TableRow>
          </template>
          <TableEmpty v-else-if="filteredUsers.length === 0" :colspan="4" class="text-muted-foreground italic">
            No users found match your criteria
          </TableEmpty>
          <template v-else>
            <TableRow v-for="user in filteredUsers" :key="user.id">
              <TableCell class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <UserAvatar :name="user.name" :image="user.image" class="size-8" />
                  <div class="text-sm font-medium text-foreground">{{ user.name }}</div>
                </div>
              </TableCell>
              <TableCell class="px-6 py-4 text-sm text-muted-foreground">{{ user.email }}</TableCell>
              <TableCell class="px-6 py-4">
                <div class="flex flex-wrap gap-1">
                  <StatusBadge v-for="role in user.roles" :key="role.id" tone="info">
                    {{ role.name }}
                  </StatusBadge>
                </div>
              </TableCell>
              <TableCell class="px-6 py-4 text-right text-sm">
                <div class="flex items-center justify-end gap-2">
                  <Button
                    v-if="authStore.hasPermission('users.edit')"
                    variant="outline"
                    size="sm"
                    @click="openEditModal(user)"
                  >
                    <Pencil />Edit
                  </Button>
                  <Button
                    v-if="authStore.hasPermission('users.edit')"
                    variant="destructive"
                    size="sm"
                    @click="user.id && deleteUser(user.id)"
                  >
                    <Trash2 />Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </Card>

    <!-- User Modal -->
    <Dialog v-model:open="showModal">
      <DialogContent class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? 'Edit User' : 'Add New User' }}</DialogTitle>
        </DialogHeader>

        <form @submit.prevent="saveUser" class="space-y-8">
          <FieldGroup class="gap-4">
            <Field>
              <FieldLabel for="userName">Full Name</FieldLabel>
              <Input id="userName" name="name" v-model="currentUser.name" type="text" required />
            </Field>
            <Field>
              <FieldLabel for="userEmail">Email Address</FieldLabel>
              <Input id="userEmail" name="email" v-model="currentUser.email" type="email" required />
            </Field>
            <Field v-if="!isEditing" class="gap-1.5">
              <FieldLabel for="userPassword">Password</FieldLabel>
              <Input id="userPassword" name="password" v-model="currentUser.password" type="text" required />
              <div>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  class="h-auto p-0"
                  @click="generatePassword"
                >
                  Generate Password
                </Button>
              </div>
            </Field>
            <FieldSet class="gap-3">
              <FieldLegend variant="label" class="mb-2">Roles</FieldLegend>
              <div class="grid grid-cols-2 gap-2">
                <Field v-for="role in rolesList" :key="role.id" orientation="horizontal" class="gap-2">
                  <Checkbox
                    :id="'role-'+role.id"
                    :model-value="currentUser.role_ids?.includes(role.id)"
                    @update:model-value="(v) => (currentUser.role_ids = toggleInList(currentUser.role_ids ?? [], role.id, v))"
                  />
                  <FieldLabel :for="'role-'+role.id" class="font-normal">{{ role.name }}</FieldLabel>
                </Field>
              </div>
            </FieldSet>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" class="flex-1" @click="showModal = false">Cancel</Button>
            <Button
              type="submit"
              :disabled="isSaving || !currentUser.name || !currentUser.email || (!isEditing && !currentUser.password)"
              class="flex-1"
            >
              <Spinner v-if="isSaving" />
              {{ isSaving ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update User' : 'Create User') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
