import { apiService } from '@/config/api';

export interface EmailTemplate {
    id: number;
    app_id: number;
    type: string;
    subject: string;
    body: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    app?: {
        id: number;
        app_name: string;
    };
}

export interface EmailTemplateFilters {
    app_id?: number;
    type?: string;
    is_active?: boolean;
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

export const emailTemplateService = {
    // Get all email templates with filters
    async getAll(filters?: EmailTemplateFilters): Promise<PaginatedResponse<EmailTemplate>> {
        const params = new URLSearchParams();
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, value.toString());
                }
            });
        }

        const queryString = params.toString();
        const endpoint = `/email-templates${queryString ? `?${queryString}` : ''}`;

        return apiService.get<PaginatedResponse<EmailTemplate>['data']>(endpoint) as Promise<PaginatedResponse<EmailTemplate>>;
    },

    // Get single email template
    async getById(id: number): Promise<ApiResponse<EmailTemplate>> {
        return apiService.get<EmailTemplate>(`/email-templates/${id}`) as Promise<ApiResponse<EmailTemplate>>;
    },

    // Create new email template
    async create(data: Partial<EmailTemplate>): Promise<ApiResponse<EmailTemplate>> {
        return apiService.post<EmailTemplate>('/email-templates', data) as Promise<ApiResponse<EmailTemplate>>;
    },

    // Update email template
    async update(id: number, data: Partial<EmailTemplate>): Promise<ApiResponse<EmailTemplate>> {
        return apiService.put<EmailTemplate>(`/email-templates/${id}`, data) as Promise<ApiResponse<EmailTemplate>>;
    },

    // Delete email template
    async delete(id: number): Promise<ApiResponse<null>> {
        return apiService.delete<null>(`/email-templates/${id}`) as Promise<ApiResponse<null>>;
    },

    // Toggle active status
    async toggleActive(id: number): Promise<ApiResponse<EmailTemplate>> {
        return apiService.post<EmailTemplate>(`/email-templates/${id}/toggle-active`, {}) as Promise<ApiResponse<EmailTemplate>>;
    },

    // Render email template with variables
    async render(id: number, variables: Record<string, any>): Promise<ApiResponse<any>> {
        return apiService.post<any>(`/email-templates/${id}/render`, { variables }) as Promise<ApiResponse<any>>;
    },

    // Get templates by app
    async getByApp(appId: number, filters?: Omit<EmailTemplateFilters, 'app_id'>): Promise<PaginatedResponse<EmailTemplate>> {
        const params = new URLSearchParams();
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, value.toString());
                }
            });
        }

        const queryString = params.toString();
        const endpoint = `/apps/${appId}/email-templates${queryString ? `?${queryString}` : ''}`;

        return apiService.get<PaginatedResponse<EmailTemplate>['data']>(endpoint) as Promise<PaginatedResponse<EmailTemplate>>;
    },
};
