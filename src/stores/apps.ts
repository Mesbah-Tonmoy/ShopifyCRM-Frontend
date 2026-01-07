// src/stores/apps.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiService } from '@/config/api';
import type { App, PaginatedResponse, AppStats } from '@/types';

export const useAppsStore = defineStore('apps', () => {
  const apps = ref<App[]>([]);
  const currentApp = ref<App | null>(null);
  const appStats = ref<AppStats | null>(null);
  const pagination = ref<Omit<PaginatedResponse<App>, 'data'> | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchApps = async (page = 1, perPage = 15) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.get<PaginatedResponse<App>>(
        `/apps?page=${page}&per_page=${perPage}`
      );

      apps.value = response.data.data;
      const { ...paginationData } = response.data;
      pagination.value = paginationData;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch apps';
    } finally {
      loading.value = false;
    }
  };

  const fetchApp = async (id: number) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.get<App>(`/apps/${id}`);
      currentApp.value = response.data;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch app';
    } finally {
      loading.value = false;
    }
  };

  const fetchAppStats = async (id: number) => {
    try {
      const response = await apiService.get<AppStats>(`/apps/${id}/stats`);
      appStats.value = response.data;
    } catch (err: unknown) {
      console.error('Failed to fetch app stats:', err);
    }
  };

  const createApp = async (data: Partial<App>) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.post<App>('/apps', data);
      apps.value.unshift(response.data);
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to create app';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const updateApp = async (id: number, data: Partial<App>) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.put<App>(`/apps/${id}`, data);
      const index = apps.value.findIndex(app => app.id === id);
      if (index !== -1) {
        apps.value[index] = response.data;
      }
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to update app';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const deleteApp = async (id: number) => {
    try {
      loading.value = true;
      error.value = null;

      await apiService.delete(`/apps/${id}`);
      apps.value = apps.value.filter(app => app.id !== id);
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to delete app';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const resyncApp = async (id: number) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.post<App>(`/apps/${id}/resync`, {});
      const index = apps.value.findIndex(app => app.id === id);
      if (index !== -1) {
        apps.value[index] = response.data;
      }
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to resync app';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const connectApp = async (appUrl: string) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.post<App>('/apps', { app_url: appUrl });
      apps.value.unshift(response.data);
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to connect app';
      return false;
    } finally {
      loading.value = false;
    }
  };

  return {
    apps,
    currentApp,
    appStats,
    pagination,
    loading,
    error,
    fetchApps,
    fetchApp,
    fetchAppStats,
    createApp,
    updateApp,
    deleteApp,
    resyncApp,
    connectApp,
  };
});