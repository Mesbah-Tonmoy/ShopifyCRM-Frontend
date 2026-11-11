<script setup lang="ts">
import AppSidebar from '@/components/layout/AppSidebar.vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
</script>

<template>
  <!-- Open/collapsed state is kept in a cookie by SidebarProvider; Ctrl/Cmd+B toggles it.
       The icon rail is widened from shadcn's 3rem so its buttons don't sit edge to edge. -->
  <SidebarProvider :style="{ '--sidebar-width-icon': '4rem' }">
    <AppSidebar />

    <SidebarInset class="h-svh overflow-hidden">
      <AppHeader />

      <!-- Page Content -->
      <div class="flex-1 overflow-y-auto bg-muted/50 p-6">
        <router-view />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
