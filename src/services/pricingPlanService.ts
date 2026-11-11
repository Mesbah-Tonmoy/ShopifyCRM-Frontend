import { apiService } from '@/config/api';
import type { PaginatedResponse } from '@/types';
import { toQuery } from '@/utils/query';

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

/** Query filters for the plans list; `is_active` is sent as 1/0. */
export interface PricingPlanFilters {
    per_page?: number;
    app_id?: number;
    is_active?: number;
}

export type PricingPlanUpdate = Partial<Pick<PricingPlan, 'display_name' | 'amount' | 'is_active'>>;

export interface PlanFeaturesResponse {
    plan: PricingPlan;
    features: PlanFeature[];
}

export const pricingPlanService = {
    async getAll(params: PricingPlanFilters = {}) {
        return apiService.get<PaginatedResponse<PricingPlan>>(`/pricing-plans${toQuery(params)}`);
    },

    async update(id: number, data: PricingPlanUpdate) {
        return apiService.put<PricingPlan>(`/pricing-plans/${id}`, data);
    },

    async toggleActive(id: number) {
        return apiService.post<PricingPlan>(`/pricing-plans/${id}/toggle-active`, {});
    },

    async getFeatures(id: number) {
        return apiService.get<PlanFeaturesResponse>(`/pricing-plans/${id}/features`);
    },

    async updateFeatures(id: number, features: { id: number; value: PlanFeature['value'] }[]) {
        return apiService.put<null>(`/pricing-plans/${id}/features`, { features });
    },

    async syncPlans(appId: number) {
        return apiService.post<null>(`/apps/${appId}/push-plans`, {});
    }
};
