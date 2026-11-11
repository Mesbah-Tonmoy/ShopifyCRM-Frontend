<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { aclService, type Role, type Permission } from '@/services/aclService';
import { useAuthStore } from '@/stores/auth';
import { Plus, Pencil, Trash2, ShieldCheck } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/common/PageHeader.vue';
import PermissionChecklist from '@/components/common/PermissionChecklist.vue';
import { toast } from '@/utils/toast';
import { confirmDialog } from '@/utils/confirm';
import { errorMessage } from '@/utils/errors';

const roles = ref<Role[]>([]);
const permissionsList = ref<Permission[]>([]);
const loading = ref(false);
const isSaving = ref(false);
const authStore = useAuthStore();

const showModal = ref(false);
const isEditing = ref(false);
const currentRole = ref<{ id?: number, name: string, description: string, permission_ids: number[] }>({
  name: '',
  description: '',
  permission_ids: []
});

// Permission picker groups, keyed by the slug's module prefix (users.edit -> users).
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
  isSaving.value = true;
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
      toast.success(response.message || 'Role saved');
      showModal.value = false;
      fetchRoles();
    }
  } catch (error) {
    toast.error('Error', { description: errorMessage(error, 'Failed to save role') });
  } finally {
    isSaving.value = false;
  }
};

const deleteRole = async (id: number) => {
  const { confirmed } = await confirmDialog({
    title: 'Are you sure?',
    description: "This will remove the role from all users assigned to it!",
    confirmText: 'Yes, delete it!',
    destructive: true
  });

  if (confirmed) {
    const loadingId = toast.loading('Deleting...', { description: 'Please wait while we delete the role' });

    try {
      const response = await aclService.deleteRole(id);
      if (response.success) {
        toast.success(response.message, { id: loadingId, description: undefined });
        fetchRoles();
      } else {
        toast.dismiss(loadingId);
      }
    } catch {
      toast.error('Error', { id: loadingId, description: 'Failed to delete role' });
    }
  }
};
</script>

<template>
  <div>
    <PageHeader 
      title="Roles" 
      description="Manage user roles and their associated permissions"
    >
      <template #actions>
        <Button
          v-if="authStore.hasPermission('roles.add')"
          @click="openAddModal"
        >
          <Plus />
          Add Role
        </Button>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-center py-12 text-muted-foreground">Loading roles...</div>
    
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      <Card v-for="role in roles" :key="role.id">
        <CardHeader>
          <div class="flex items-start justify-between gap-2">
            <CardTitle class="text-lg font-semibold">{{ role.name }}</CardTitle>
            <Badge variant="secondary" class="font-mono">{{ role.slug }}</Badge>
          </div>
          <CardDescription class="h-10 overflow-hidden line-clamp-2">{{ role.description || 'No description provided' }}</CardDescription>
        </CardHeader>

        <CardContent class="flex items-center text-sm text-muted-foreground">
          <ShieldCheck class="size-4 mr-2 text-primary" />
          {{ role.permissions?.length || 0 }} Permissions assigned
        </CardContent>

        <CardFooter class="gap-2">
          <Button
            v-if="authStore.hasPermission('roles.edit')"
            variant="outline"
            class="flex-1"
            @click="openEditModal(role)"
          >
            <Pencil />
            Edit Role
          </Button>
          <Button
            v-if="authStore.hasPermission('roles.edit')"
            variant="destructive"
            size="icon"
            aria-label="Delete role"
            @click="deleteRole(role.id)"
          >
            <Trash2 />
          </Button>
        </CardFooter>
      </Card>
    </div>

    <!-- Role Modal -->
    <Dialog v-model:open="showModal">
      <DialogContent class="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? 'Edit Role' : 'Create New Role' }}</DialogTitle>
        </DialogHeader>

        <form id="roleForm" @submit.prevent="saveRole" class="space-y-8">
          <FieldGroup class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field>
              <FieldLabel for="roleName">Role Name</FieldLabel>
              <Input id="roleName" name="name" v-model="currentRole.name" type="text" required placeholder="e.g. Compliance Manager" />
            </Field>
            <Field>
              <FieldLabel for="roleDescription">Description</FieldLabel>
              <Input id="roleDescription" name="description" v-model="currentRole.description" type="text" placeholder="Short description of this role" />
            </Field>
          </FieldGroup>

          <FieldSet class="gap-4">
            <PermissionChecklist
              v-model="currentRole.permission_ids"
              :permissions="permissionsList"
              select-all
              id-prefix="role-perm"
              class="sm:grid-cols-2"
            />
          </FieldSet>

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" class="flex-1" @click="showModal = false">Cancel</Button>
            <Button
              type="submit"
              size="lg"
              :disabled="isSaving || !currentRole.name"
              class="flex-1"
            >
              <Spinner v-if="isSaving" />
              {{ isSaving ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Role' : 'Create Role') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
