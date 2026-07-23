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

export const integrationService = {
    async getAll() {
        return apiService.get<Integration[]>('/integrations');
    },

    async update(key: string, data: { is_enabled?: boolean; config?: Record<string, any> }) {
        return apiService.put<Integration>(`/integrations/${key}`, data);
    },
};
