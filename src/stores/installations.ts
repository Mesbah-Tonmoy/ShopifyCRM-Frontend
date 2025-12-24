import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiService } from '@/config/api';
import type { Installation, PaginatedResponse } from '@/types';

export const useInstallationsStore = defineStore('installations', () => {
  const installations = ref<Installation[]>([]);
  const currentInstallation = ref<Installation | null>(null);
  const pagination = ref<Omit<PaginatedResponse<Installation>, 'data'> | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filterOptions = ref<{
    shopify_plans: string[];
    app_plans: string[];
  }>({
    shopify_plans: [],
    app_plans: [],
  });

  const fetchInstallations = async (params: {
    page?: number;
    per_page?: number;
    app_id?: number;
    is_active?: boolean;
    search?: string;
    sort_by?: string;
    sort_order?: string;
    date_from?: string;
    date_to?: string;
    plan_name?: string[];
    shopify_plans?: string[];
    install_count_min?: number;
    install_count_max?: number;
  } = {}) => {
    try {
      loading.value = true;
      error.value = null;

      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(`${key}[]`, String(v)));
          } else {
            queryParams.append(key, String(value));
          }
        }
      });

      const response = await apiService.get<PaginatedResponse<Installation>>(
        `/installations?${queryParams.toString()}`
      );

      installations.value = response.data.data;
      const { ...paginationData } = response.data;
      pagination.value = paginationData;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch installations';
    } finally {
      loading.value = false;
    }
  };

  const fetchInstallation = async (id: number) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.get<Installation>(`/installations/${id}`);
      currentInstallation.value = response.data;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch installation';
    } finally {
      loading.value = false;
    }
  };

  const fetchInstallationsByApp = async (appId: number, params: {
    page?: number;
    per_page?: number;
    is_active?: boolean;
    search?: string;
  } = {}) => {
    try {
      loading.value = true;
      error.value = null;

      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(`${key}[]`, String(v)));
          } else {
            queryParams.append(key, String(value));
          }
        }
      });

      const response = await apiService.get<PaginatedResponse<Installation>>(
        `/apps/${appId}/installations?${queryParams.toString()}`
      );

      installations.value = response.data.data;
      const { ...paginationData } = response.data;
      pagination.value = paginationData;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch installations';
    } finally {
      loading.value = false;
    }
  };

  const createInstallation = async (data: Partial<Installation>) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.post<Installation>('/installations', data);
      installations.value.unshift(response.data);
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to create installation';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const updateInstallation = async (id: number, data: Partial<Installation>) => {
    try {
      loading.value = true;
      error.value = null;

      const response = await apiService.put<Installation>(`/installations/${id}`, data);
      const index = installations.value.findIndex(inst => inst.id === id);
      if (index !== -1) {
        installations.value[index] = response.data;
      }
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to update installation';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const deleteInstallation = async (id: number) => {
    try {
      loading.value = true;
      error.value = null;

      await apiService.delete(`/installations/${id}`);
      installations.value = installations.value.filter(inst => inst.id !== id);
      return true;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to delete installation';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const fetchFilters = async () => {
    try {
      const response = await apiService.get<{ shopify_plans: string[], app_plans: string[] }>(
        '/installations/filters'
      );
      filterOptions.value = response.data;
    } catch (err: unknown) {
      console.error('Failed to fetch filters', err);
    }
  };

  return {
    installations,
    currentInstallation,
    pagination,
    loading,
    error,
    fetchInstallations,
    fetchInstallation,
    fetchInstallationsByApp,
    createInstallation,
    updateInstallation,
    deleteInstallation,
    filterOptions,
    fetchFilters,
  };
});