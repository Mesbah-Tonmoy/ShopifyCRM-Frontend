import { apiService } from '@/config/api';

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

export interface PaginatedResponse<T> {
    success: boolean;
    data: {
        data: T[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

export interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data: T;
}

export const featureService = {
    // Get all features with filters
    async getAll(filters?: FeatureFilters): Promise<PaginatedResponse<Feature>> {
        const params = new URLSearchParams();
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, value.toString());
                }
            });
        }

        const queryString = params.toString();
        const endpoint = `/features${queryString ? `?${queryString}` : ''}`;

        return apiService.get<PaginatedResponse<Feature>['data']>(endpoint) as Promise<PaginatedResponse<Feature>>;
    },

    // Get single feature
    async getById(id: number): Promise<ApiResponse<Feature>> {
        return apiService.get<Feature>(`/features/${id}`) as Promise<ApiResponse<Feature>>;
    },

    // Create new feature
    async create(data: Partial<Feature>): Promise<ApiResponse<Feature>> {
        return apiService.post<Feature>('/features', data) as Promise<ApiResponse<Feature>>;
    },

    // Update feature
    async update(id: number, data: Partial<Feature>): Promise<ApiResponse<Feature>> {
        return apiService.put<Feature>(`/features/${id}`, data) as Promise<ApiResponse<Feature>>;
    },

    // Delete feature
    async delete(id: number): Promise<ApiResponse<null>> {
        return apiService.delete<null>(`/features/${id}`) as Promise<ApiResponse<null>>;
    },

    // Toggle published status
    async togglePublished(id: number): Promise<ApiResponse<Feature>> {
        return apiService.post<Feature>(`/features/${id}/toggle-published`, {}) as Promise<ApiResponse<Feature>>;
    },

    // Upload/replace the feature image
    async uploadImage(id: number, file: File): Promise<ApiResponse<Feature>> {
        const formData = new FormData();
        formData.append('image', file);
        return apiService.postForm<Feature>(`/features/${id}/image`, formData) as Promise<ApiResponse<Feature>>;
    },

    // Get features by app
    async getByApp(appId: number, filters?: Omit<FeatureFilters, 'app_id'>): Promise<PaginatedResponse<Feature>> {
        const params = new URLSearchParams();
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, value.toString());
                }
            });
        }

        const queryString = params.toString();
        const endpoint = `/apps/${appId}/features${queryString ? `?${queryString}` : ''}`;

        return apiService.get<PaginatedResponse<Feature>['data']>(endpoint) as Promise<PaginatedResponse<Feature>>;
    },
};
