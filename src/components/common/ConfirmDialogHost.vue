<template>
  <AlertDialog :open="!!current" @update:open="onOpenChange">
    <AlertDialogContent v-if="current" :class="current.wide && 'sm:max-w-xl'">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ current.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="current.html" as="div">
          <div class="space-y-2 [&_b]:font-semibold [&_b]:text-foreground" v-html="current.html" />
        </AlertDialogDescription>
        <AlertDialogDescription v-else-if="current.description">{{ current.description }}</AlertDialogDescription>
      </AlertDialogHeader>

      <Field v-if="input" :data-invalid="!!error || undefined">
        <template v-if="input.type === 'checkbox'">
          <div class="flex items-center gap-2">
            <Checkbox id="confirm-input" v-model="checked" />
            <FieldLabel for="confirm-input" class="font-normal">{{ input.label || input.placeholder }}</FieldLabel>
          </div>
        </template>
        <template v-else>
          <FieldLabel v-if="input.label" for="confirm-input">{{ input.label }}</FieldLabel>
          <Textarea v-if="input.type === 'textarea'" id="confirm-input" v-model="text" :placeholder="input.placeholder" :aria-invalid="!!error" />
          <Select v-else-if="input.type === 'select'" v-model="text">
            <SelectTrigger id="confirm-input" class="w-full" :aria-invalid="!!error">
              <SelectValue :placeholder="input.placeholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in input.options" :key="option.value" :value="option.value">{{ option.label }}</SelectItem>
            </SelectContent>
          </Select>
          <Input v-else id="confirm-input" v-model="text" :placeholder="input.placeholder" :aria-invalid="!!error" />
        </template>
        <FieldError v-if="error">{{ error }}</FieldError>
      </Field>

      <AlertDialogFooter>
        <AlertDialogCancel v-if="current.cancelText !== false">{{ current.cancelText || 'Cancel' }}</AlertDialogCancel>
        <Button :variant="current.destructive ? 'destructive' : 'default'" @click="confirm">
          {{ current.confirmText || 'Confirm' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { pendingConfirm } from '@/utils/confirm';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const current = pendingConfirm;
const input = computed(() => current.value?.input);

const text = ref('');
const checked = ref(false);
const error = ref<string | null>(null);

// Reset the field for each new prompt.
watch(current, (prompt) => {
  const initial = prompt?.input?.initialValue;
  text.value = typeof initial === 'string' ? initial : '';
  checked.value = initial === true;
  error.value = null;
});

const settle = (confirmed: boolean, value?: string | boolean) => {
  const prompt = current.value;
  if (!prompt) return;
  pendingConfirm.value = null;
  prompt.resolve(value === undefined ? { confirmed } : { confirmed, value });
};

const confirm = () => {
  if (!input.value) return settle(true);

  const value = input.value.type === 'checkbox' ? checked.value : text.value;
  error.value = input.value.validate?.(value) ?? null;
  if (!error.value) settle(true, value);
};

// Escape, overlay click and Cancel all close the dialog: that is a cancel.
const onOpenChange = (open: boolean) => {
  if (!open) settle(false);
};
</script>
