import { defineStore } from 'pinia';
import { apiService } from '@/config/api';

interface DashboardStats {
    total_apps: number;
    total_installations: number;
    active_stores: number;
    total_users: number;
}

interface ChartDataset {
    app_name: string;
    data: { date: string; count: number }[];
}

interface RecentActivityItem {
    id: number;
    app_name: string;
    store_name: string;
    is_active: boolean;
    created_at: string;
}

interface DashboardState {
    stats: DashboardStats | null;
    chartData: ChartDataset[];
    recentActivity: RecentActivityItem[];
    loading: boolean;
    error: string | null;
}

export const useDashboardStore = defineStore('dashboard', {
    state: (): DashboardState => ({
        stats: null,
        chartData: [],
        recentActivity: [],
        loading: false,
        error: null,
    }),

    actions: {
        async fetchDashboardStats() {
            this.loading = true;
            this.error = null;
            try {
                const response = await apiService.get<any>('/dashboard/stats');
                if (response.success) {
                    this.stats = response.data.stats;
                    this.chartData = response.data.chart_data;
                    this.recentActivity = response.data.recent_activity;
                }
            } catch (error: any) {
                this.error = error.message || 'Failed to fetch dashboard stats';
            } finally {
                this.loading = false;
            }
        },
    },
});
