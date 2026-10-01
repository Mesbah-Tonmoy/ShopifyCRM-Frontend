import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiService } from '@/config/api';
import type { Installation, PaginatedResponse } from '@/types';

export const useInstallationsStore = defineStore('installations', () => {
  const installations = ref<Installation[]>([]);
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

  // Toggling filters quickly fires overlapping requests; only the latest
  // one may write its result, or an older response can overwrite a newer.
  let latestListRequest = 0;

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
    const requestId = ++latestListRequest;

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
      if (requestId !== latestListRequest) return;

      installations.value = response.data.data;
      const { ...paginationData } = response.data;
      pagination.value = paginationData;
    } catch (err: unknown) {
      if (requestId !== latestListRequest) return;
      error.value = (err as Error).message || 'Failed to fetch installations';
    } finally {
      if (requestId === latestListRequest) loading.value = false;
    }
  };

  let latestFiltersRequest = 0;

  // Scoped to one app when appId is given, so its list offers only its plans.
  const fetchFilters = async (appId?: number) => {
    const requestId = ++latestFiltersRequest;

    try {
      const response = await apiService.get<{ shopify_plans: string[], app_plans: string[] }>(
        appId ? `/installations/filters?app_id=${appId}` : '/installations/filters'
      );
      if (requestId !== latestFiltersRequest) return;
      filterOptions.value = response.data;
    } catch (err: unknown) {
      console.error('Failed to fetch filters', err);
    }
  };

  return {
    installations,
    pagination,
    loading,
    error,
    fetchInstallations,
    filterOptions,
    fetchFilters,
  };
});