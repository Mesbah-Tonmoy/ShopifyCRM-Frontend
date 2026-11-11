<script setup lang="ts">
import ConfirmDialogHost from '@/components/common/ConfirmDialogHost.vue';
import { Toaster } from '@/components/ui/sonner';
import { useColorMode } from '@/composables/useColorMode';

const { isDark } = useColorMode();
</script>

<template>
  <router-view />
  <Toaster position="top-right" :theme="isDark ? 'dark' : 'light'" />
  <ConfirmDialogHost />
</template>
