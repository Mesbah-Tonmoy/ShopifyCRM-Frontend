<template>
  <div :class="cn('grid gap-10', props.class)">
    <FieldSet v-for="group in groups" :key="group.key" class="gap-3">
      <FieldLegend variant="label" class="mb-4 font-semibold">{{ group.title }}</FieldLegend>

      <Field v-if="selectAll" orientation="horizontal" class="gap-3">
        <Checkbox
          :id="`${idPrefix}-group-${group.key}`"
          class="!mt-[2px]"
          :model-value="groupState(group)"
          :disabled="disabled"
          @update:model-value="(checked) => setGroup(group, checked === true)"
        />
        <FieldLabel :for="`${idPrefix}-group-${group.key}`" class="font-semibold">Select All</FieldLabel>
      </Field>

      <Field v-for="permission in group.permissions" :key="permission.id" orientation="horizontal" class="gap-3">
        <Checkbox
          :id="`${idPrefix}-${permission.id}`"
          class="!mt-[2px]"
          :model-value="modelValue.includes(permission.id)"
          :disabled="disabled"
          @update:model-value="(checked) => setOne(permission.id, checked === true)"
        />
        <!-- The slug repeats the name, so it is only a hover hint -->
        <FieldLabel :for="`${idPrefix}-${permission.id}`" :title="permission.slug" class="text-[13px] font-normal cursor-pointer">{{ permission.name }}</FieldLabel>
      </Field>
    </FieldSet>
  </div>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import type { Permission } from '@/services/aclService';
import { cn } from '@/lib/utils';
import { groupPermissions, type PermissionGroup } from '@/lib/permissions';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { toggleInList } from '@/lib/list';

/**
 * Permissions grouped by slug prefix, each with a checkbox. v-model is the
 * list of selected permission ids. Used by the Roles dialog and the
 * Permissions page.
 */
const props = withDefaults(
  defineProps<{
    modelValue: number[];
    permissions: Permission[];
    /** Only these groups (slug prefixes), in this order. Default: every group. */
    groupKeys?: string[];
    /** A "Select All" checkbox per group. */
    selectAll?: boolean;
    disabled?: boolean;
    /** Keeps checkbox ids unique when two checklists are on one page. */
    idPrefix?: string;
    /** Grid columns for the groups, e.g. "sm:grid-cols-2 lg:grid-cols-4". */
    class?: HTMLAttributes['class'];
  }>(),
  {
    selectAll: false,
    disabled: false,
    idPrefix: 'perm',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', ids: number[]): void;
}>();

const groups = computed(() => groupPermissions(props.permissions, props.groupKeys));

const groupState = (group: PermissionGroup) => {
  const selected = group.permissions.filter((p) => props.modelValue.includes(p.id)).length;
  if (selected === 0) return false;
  return selected === group.permissions.length ? true : 'indeterminate';
};

const setOne = (id: number, checked: boolean) => {
  emit('update:modelValue', toggleInList(props.modelValue, id, checked));
};

const setGroup = (group: PermissionGroup, checked: boolean) => {
  const ids = group.permissions.map((p) => p.id);
  const rest = props.modelValue.filter((selected) => !ids.includes(selected));
  emit('update:modelValue', checked ? [...rest, ...ids] : rest);
};
</script>
