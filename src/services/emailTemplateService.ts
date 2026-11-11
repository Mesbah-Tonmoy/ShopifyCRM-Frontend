import { apiService, type ApiResponse } from '@/config/api';
import type { PaginatedResponse } from '@/types';
import { toQuery } from '@/utils/query';

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

/** A template rendered with the given variables, alongside its unrendered source. */
export interface RenderedEmailTemplate {
    id: number;
    type: string;
    rendered_subject: string;
    rendered_body: string;
    original_subject: string;
    original_body: string;
}

export interface EmailTemplateFilters {
    app_id?: number;
    type?: string;
    is_active?: boolean;
    search?: string;
    per_page?: number;
    page?: number;
}

export interface EmailTemplateFilterOptions {
    apps: { id: number; app_name: string }[];
    types: { value: string; label: string }[];
}

export const emailTemplateService = {
    // Options for the filter dropdowns. Served separately from the paginated
    // list so the dropdowns cover every app and type, not just this page.
    async getFilterOptions(): Promise<ApiResponse<EmailTemplateFilterOptions>> {
        return apiService.get<EmailTemplateFilterOptions>('/email-templates/filters');
    },

    // Get all email templates with filters
    async getAll(filters?: EmailTemplateFilters): Promise<ApiResponse<PaginatedResponse<EmailTemplate>>> {
        const endpoint = `/email-templates${toQuery(filters)}`;

        return apiService.get<PaginatedResponse<EmailTemplate>>(endpoint);
    },

    // Get single email template
    async getById(id: number): Promise<ApiResponse<EmailTemplate>> {
        return apiService.get<EmailTemplate>(`/email-templates/${id}`);
    },

    // Create new email template
    async create(data: Partial<EmailTemplate>): Promise<ApiResponse<EmailTemplate>> {
        return apiService.post<EmailTemplate>('/email-templates', data);
    },

    // Update email template
    async update(id: number, data: Partial<EmailTemplate>): Promise<ApiResponse<EmailTemplate>> {
        return apiService.put<EmailTemplate>(`/email-templates/${id}`, data);
    },

    // Delete email template
    async delete(id: number): Promise<ApiResponse<null>> {
        return apiService.delete<null>(`/email-templates/${id}`);
    },

    // Toggle active status
    async toggleActive(id: number): Promise<ApiResponse<EmailTemplate>> {
        return apiService.post<EmailTemplate>(`/email-templates/${id}/toggle-active`, {});
    },

    // Render email template with variables
    async render(id: number, variables: Record<string, unknown>): Promise<ApiResponse<RenderedEmailTemplate>> {
        return apiService.post<RenderedEmailTemplate>(`/email-templates/${id}/render`, { variables });
    },

    // Get templates by app
    async getByApp(appId: number, filters?: Omit<EmailTemplateFilters, 'app_id'>): Promise<ApiResponse<PaginatedResponse<EmailTemplate>>> {
        const endpoint = `/apps/${appId}/email-templates${toQuery(filters)}`;

        return apiService.get<PaginatedResponse<EmailTemplate>>(endpoint);
    },
};
