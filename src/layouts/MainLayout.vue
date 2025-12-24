<script setup lang="ts">
import { ref } from 'vue';
import Sidebar from '@/components/layout/Sidebar.vue';
import Header from '@/components/layout/Header.vue';

const sidebarCollapsed = ref(false);
</script>

<template>
  <div class="flex h-screen bg-background overflow-hidden">
    <!-- Sidebar -->
    <Sidebar v-model:collapsed="sidebarCollapsed" />

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Header -->
      <Header />

      <!-- Page Content -->
      <main class="flex-1 overflow-y-auto bg-background p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>
