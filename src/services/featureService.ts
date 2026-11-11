import { apiService, type ApiResponse } from '@/config/api';
import type { PaginatedResponse } from '@/types';
import { toQuery } from '@/utils/query';

export interface Feature {
    id: number;
    app_id: number;
    title: string;
    description: string | null;
    image: string | null;
    image_url: string | null;
    release_date: string;
    is_published: boolean;
    created_at: string;
    updated_at: string;
    app?: {
        id: number;
        app_name: string;
    };
}

export interface FeatureFilters {
    app_id?: number;
    date_from?: string;
    date_to?: string;
    is_published?: boolean;
    search?: string;
    per_page?: number;
    page?: number;
}

export const featureService = {
    // Get all features with filters
    async getAll(filters?: FeatureFilters): Promise<ApiResponse<PaginatedResponse<Feature>>> {
        const endpoint = `/features${toQuery(filters)}`;

        return apiService.get<PaginatedResponse<Feature>>(endpoint);
    },

    // Get single feature
    async getById(id: number): Promise<ApiResponse<Feature>> {
        return apiService.get<Feature>(`/features/${id}`);
    },

    // Create new feature
    async create(data: Partial<Feature>): Promise<ApiResponse<Feature>> {
        return apiService.post<Feature>('/features', data);
    },

    // Update feature
    async update(id: number, data: Partial<Feature>): Promise<ApiResponse<Feature>> {
        return apiService.put<Feature>(`/features/${id}`, data);
    },

    // Delete feature
    async delete(id: number): Promise<ApiResponse<null>> {
        return apiService.delete<null>(`/features/${id}`);
    },

    // Toggle published status
    async togglePublished(id: number): Promise<ApiResponse<Feature>> {
        return apiService.post<Feature>(`/features/${id}/toggle-published`, {});
    },

    // Upload/replace the feature image
    async uploadImage(id: number, file: File): Promise<ApiResponse<Feature>> {
        const formData = new FormData();
        formData.append('image', file);
        return apiService.postForm<Feature>(`/features/${id}/image`, formData);
    },

    // Get features by app
    async getByApp(appId: number, filters?: Omit<FeatureFilters, 'app_id'>): Promise<ApiResponse<PaginatedResponse<Feature>>> {
        const endpoint = `/apps/${appId}/features${toQuery(filters)}`;

        return apiService.get<PaginatedResponse<Feature>>(endpoint);
    },
};
