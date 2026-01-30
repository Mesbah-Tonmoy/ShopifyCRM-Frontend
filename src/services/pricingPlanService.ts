import { apiService } from '@/config/api';

export interface PricingPlan {
    id: number;
    app_id: number;
    name: string;
    display_name: string;
    amount: number;
    currency_code: string;
    interval: string;
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
    app?: {
        id: number;
        app_name: string;
        app_url: string;
    };
}

export interface PlanFeature {
    id: number;
    app_id: number;
    plan_id: number;
    feature_id: number;
    value: string;
    feature?: {
        id: number;
        name: string;
        key: string;
        description: string;
        value_type: string;
    };
}

export interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data: T;
}

export const pricingPlanService = {
    async getAll(params = {}) {
        const urlParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                urlParams.append(key, value.toString());
            }
        });
        const queryString = urlParams.toString();
        return apiService.get<any>(`/pricing-plans${queryString ? `?${queryString}` : ''}`);
    },

    async update(id: number, data: any) {
        return apiService.put<any>(`/pricing-plans/${id}`, data);
    },

    async toggleActive(id: number) {
        return apiService.post<any>(`/pricing-plans/${id}/toggle-active`, {});
    },

    async getFeatures(id: number) {
        return apiService.get<any>(`/pricing-plans/${id}/features`);
    },

    async updateFeatures(id: number, features: { id: number; value: any }[]) {
        return apiService.put<any>(`/pricing-plans/${id}/features`, { features });
    },

    async syncPlans(appId: number) {
        return apiService.post<any>(`/apps/${appId}/push-plans`, {});
    }
};
