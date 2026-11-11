<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { aclService, type Permission, type Role } from '@/services/aclService';
import { useAuthStore } from '@/stores/auth';

import { Plus } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import SkeletonLoader from '@/components/common/SkeletonLoader.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import PermissionChecklist from '@/components/common/PermissionChecklist.vue';
import { toast } from '@/utils/toast';

const roles = ref<Role[]>([]);
const allPermissions = ref<Permission[]>([]);
const loading = ref(false);
const saving = ref(false);
const showPermissionModal = ref(false);
const isCreatingPermission = ref(false);
const selectedRoleId = ref<number | null>(null);
const authStore = useAuthStore();
const selectedPermissionIds = ref<number[]>([]);
const originalPermissionIds = ref<number[]>([]);

const hasChanges = computed(() => {
  if (selectedPermissionIds.value.length !== originalPermissionIds.value.length) return true;
  return !selectedPermissionIds.value.every(id => originalPermissionIds.value.includes(id));
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
  originalPermissionIds.value = [...selectedPermissionIds.value];
};

// Role picker (ToggleGroup) hands back the role id as a string.
const onRolePicked = (value: unknown) => {
  const role = roles.value.find(r => String(r.id) === value);
  if (role) selectRole(role);
};

// Group keys shown in each section, in display order.
const permissionSections = [
  { title: 'Accounts', keys: ['roles', 'permissions', 'users'] },
  { title: 'Data', keys: ['installations', 'email_templates', 'apps', 'pricing_plans', 'integrations', 'features', 'smtp', 'ses_tenants'] },
];

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
      toast.success('Permissions updated successfully');
      // Update local role data
      const roleToUpdate = roles.value.find(r => r.id === selectedRoleId.value);
      if (roleToUpdate) {
        roleToUpdate.permissions = allPermissions.value.filter(p => 
          selectedPermissionIds.value.includes(p.id)
        );
      }
      originalPermissionIds.value = [...selectedPermissionIds.value];
    }
  } catch {
    toast.error('Error', { description: 'Failed to update permissions' });
  } finally {
    saving.value = false;
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
        
        toast.success('Permission created successfully');
      }
  } catch {
    toast.error('Error', { description: 'Failed to create permission' });
  } finally {
    isCreatingPermission.value = false;
  }
};

onMounted(fetchInitialData);
</script>

<template>
  <div>
    <PageHeader 
      title="Permissions List" 
      description="Manage user permissions" 
    />

    <Card class="mb-6 py-4">
      <CardContent class="px-4">
        <!-- Top Active Roles and Add Button -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :spacing="2"
            :model-value="selectedRoleId !== null ? String(selectedRoleId) : undefined"
            class="flex-wrap"
            @update:model-value="(v) => v && onRolePicked(v)"
          >
            <ToggleGroupItem
              v-for="role in roles"
              :key="role.id"
              :value="String(role.id)"
            >
              {{ role.name }}
            </ToggleGroupItem>
          </ToggleGroup>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              v-if="authStore.hasPermission('permissions.add')"
              @click="showPermissionModal = true"
            >
              <Plus />
              Add Permission
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card class="py-8">
      <CardContent v-if="loading" class="px-8 space-y-12">
        <div v-for="(section, sIndex) in permissionSections" :key="section.title" class="space-y-6">
          <Separator v-if="sIndex > 0" class="mb-6" />
          <SkeletonLoader :width="sIndex === 0 ? '120px' : '80px'" height="28px" />
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div v-for="i in 3" :key="i" class="space-y-4">
              <SkeletonLoader :width="sIndex === 0 ? '80px' : '100px'" height="16px" />
              <div class="space-y-3">
                <SkeletonLoader v-for="j in (sIndex === 0 ? 5 : 4)" :key="j" width="100%" height="20px" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      <template v-else>
        <CardContent class="px-8 space-y-12">
          <div v-for="(section, sIndex) in permissionSections" :key="section.title" class="space-y-6">
            <Separator v-if="sIndex > 0" class="mb-6" />
            <h2 class="font-heading text-xl font-semibold text-foreground border-l-4 border-primary pl-4">{{ section.title }}</h2>
            <PermissionChecklist
              v-model="selectedPermissionIds"
              :permissions="allPermissions"
              :group-keys="section.keys"
              select-all
              :id-prefix="`perm-${sIndex}`"
              class="md:grid-cols-2 lg:grid-cols-4 gap-x-12"
            />
          </div>
        </CardContent>

        <!-- Save Button Bar -->
        <CardFooter class="justify-end border-t mt-6 px-8 pt-8">
          <Button
            v-if="authStore.hasPermission('permissions.edit')"
            size="lg"
            @click="savePermissions"
            :disabled="saving || !selectedRoleId || !hasChanges"
          >
            <Spinner v-if="saving" />
            {{ saving ? 'Saving Changes...' : 'Save Permissions' }}
          </Button>
        </CardFooter>
      </template>
    </Card>

    <!-- Add Permission Modal -->
    <Dialog v-model:open="showPermissionModal">
      <DialogContent class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Permission</DialogTitle>
        </DialogHeader>

        <form @submit.prevent="handleCreatePermission" class="space-y-7">
          <FieldGroup class="gap-5">
            <Field>
              <FieldLabel for="permName">Permission Name</FieldLabel>
              <Input
                id="permName"
                name="name"
                v-model="newPermission.name"
                type="text"
                required
                placeholder="e.g. View Reports"
              />
            </Field>

            <Field>
              <FieldLabel for="permSlug">Permission Slug</FieldLabel>
              <Input
                id="permSlug"
                name="slug"
                v-model="newPermission.slug"
                type="text"
                required
                placeholder="e.g. reports.view"
              />
              <FieldDescription class="text-xs">Use dot notation: module.action (e.g. users.edit)</FieldDescription>
            </Field>

            <Field>
              <FieldLabel for="permDescription">Description</FieldLabel>
              <Textarea
                id="permDescription"
                name="description"
                v-model="newPermission.description"
                rows="3"
                class="resize-none"
                placeholder="What does this permission allow?"
              />
            </Field>
          </FieldGroup>

          <DialogFooter class="gap-3">
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              @click="showPermissionModal = false"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              :disabled="isCreatingPermission || !newPermission.name || !newPermission.slug"
              class="flex-1"
            >
              <Spinner v-if="isCreatingPermission" />
              {{ isCreatingPermission ? 'Creating...' : 'Create Permission' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
