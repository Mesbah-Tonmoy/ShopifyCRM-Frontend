import { apiService } from '@/config/api';

export interface Integration {
    id: number;
    key: string;
    name: string;
    is_enabled: boolean;
    config: Record<string, any> | null;
    created_at: string;
    updated_at: string;
}

export interface GoogleChatSpace {
    id: number;
    name: string;
    webhook_url: string;
    events: string[];
    app_scope: 'all' | 'selected';
    app_ids: number[];
    is_enabled: boolean;
}

export type GoogleChatSpaceInput = Omit<GoogleChatSpace, 'id'>;

export interface GoogleChatOptions {
    events: { key: string; label: string }[];
    apps: { id: number; app_name: string }[];
}

export const integrationService = {
    async getAll() {
        return apiService.get<Integration[]>('/integrations');
    },

    async update(key: string, data: { is_enabled?: boolean; config?: Record<string, any> }) {
        return apiService.put<Integration>(`/integrations/${key}`, data);
    },

    async getGoogleChatOptions() {
        return apiService.get<GoogleChatOptions>('/integrations/google-chat/options');
    },

    async getGoogleChatSpaces() {
        return apiService.get<GoogleChatSpace[]>('/integrations/google-chat/spaces');
    },

    async createGoogleChatSpace(data: GoogleChatSpaceInput) {
        return apiService.post<GoogleChatSpace>('/integrations/google-chat/spaces', data);
    },

    async updateGoogleChatSpace(id: number, data: GoogleChatSpaceInput) {
        return apiService.put<GoogleChatSpace>(`/integrations/google-chat/spaces/${id}`, data);
    },

    async deleteGoogleChatSpace(id: number) {
        return apiService.delete<null>(`/integrations/google-chat/spaces/${id}`);
    },

    async testGoogleChat(webhookUrl: string) {
        return apiService.post<null>('/integrations/google-chat/test', { webhook_url: webhookUrl });
    },
};
