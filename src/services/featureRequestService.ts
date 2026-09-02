import { apiService } from '@/config/api';

export type FeatureRequestStatus =
    | 'pending'
    | 'approved'
    | 'in_progress'
    | 'completed'
    | 'rejected';

/**
 * Kept in step with App\Enums\FeatureRequestStatus on the backend, which is the
 * source of truth for labels and ordering.
 */
export const FEATURE_REQUEST_STATUSES: { value: FeatureRequestStatus; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'rejected', label: 'Rejected' },
];

export interface FeatureRequestVoter {
    id: number;
    voter_key: string;
    store_name: string | null;
    shopify_plan: string | null;
    app_plan: unknown;
    voted_at: string | null;
}

export interface FeatureRequestStatusLog {
    id: number;
    from_status: FeatureRequestStatus | null;
    to_status: FeatureRequestStatus;
    to_status_label: string;
    note: string | null;
    user: string | null;
    notified_at: string | null;
    created_at: string | null;
}

export interface FeatureRequestComment {
    id: number;
    body: string;
    is_official: boolean;
    is_hidden: boolean;
    author_name: string | null;
    author_shop_domain: string | null;
    created_at: string | null;
}

export interface FeatureRequest {
    id: number;
    title: string;
    description: string | null;
    image_url: string | null;
    status: FeatureRequestStatus;
    status_label: string;
    status_note: string | null;
    votes_count: number;
    recent_votes_count?: number | null;
    has_voted: boolean;
    is_pinned: boolean;
    is_visible: boolean;
    is_hidden: boolean;
    /** Whether merchants can actually see it, accounting for board moderation. */
    is_public: boolean;
    submitter_name: string | null;
    submitter_shop_domain: string | null;
    submitter_email: string | null;
    admin_note: string | null;
    created_at: string | null;
    updated_at?: string | null;
    completed_at: string | null;
    app?: { id: number; app_name: string };
    installation?: {
        id: number;
        store_name: string;
        store_url: string;
        email: string | null;
        shopify_plan: string | null;
        app_plan: unknown;
        is_active: boolean;
    } | null;
    created_by?: { id: number; name: string } | null;
    status_logs?: FeatureRequestStatusLog[];
    comments?: FeatureRequestComment[];
    comments_count?: number;
    voters?: FeatureRequestVoter[];
}

export interface FeatureRequestFilters {
    app_id?: number | null;
    status?: FeatureRequestStatus | null;
    search?: string;
    sort?: 'votes' | 'trending' | 'newest' | 'oldest';
    is_visible?: boolean;
    date_from?: string;
    date_to?: string;
    per_page?: number;
    page?: number;
}

export interface FeatureRequestStats {
    statuses: { value: FeatureRequestStatus; label: string; count: number }[];
    total: number;
    awaiting_review: number;
    top: FeatureRequest[];
}

export interface BoardSettings {
    title: string | null;
    intro: string | null;
    is_enabled: boolean;
    allow_submissions: boolean;
    allow_voting: boolean;
    allow_comments: boolean;
    require_approval: boolean;
    show_vote_counts: boolean;
    notify_on_status_change: boolean;
    submission_limit_per_day: number;
    visible_statuses: FeatureRequestStatus[] | null;
    theme: Record<string, unknown> | null;
}

export interface BoardConfig {
    provisioned: boolean;
    app: { id: number; app_name: string };
    board_slug: string | null;
    board_public_key: string | null;
    board_url: string | null;
    settings: BoardSettings | null;
    available_statuses: { value: FeatureRequestStatus; label: string }[];
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

/**
 * Drop empty filters so the query string only carries what was actually set.
 */
const toQuery = (filters?: Record<string, unknown>): string => {
    if (!filters) return '';

    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.append(key, String(value));
        }
    });

    const query = params.toString();

    return query ? `?${query}` : '';
};

export const featureRequestService = {
    async getAll(filters?: FeatureRequestFilters): Promise<PaginatedResponse<FeatureRequest>> {
        return apiService.get<PaginatedResponse<FeatureRequest>['data']>(
            `/feature-requests${toQuery(filters as Record<string, unknown>)}`
        ) as Promise<PaginatedResponse<FeatureRequest>>;
    },

    async getStats(appId?: number | null): Promise<ApiResponse<FeatureRequestStats>> {
        return apiService.get<FeatureRequestStats>(
            `/feature-requests/stats${toQuery({ app_id: appId })}`
        );
    },

    async getById(id: number): Promise<ApiResponse<FeatureRequest>> {
        return apiService.get<FeatureRequest>(`/feature-requests/${id}`);
    },

    async create(data: Partial<FeatureRequest> & { app_id: number }): Promise<ApiResponse<FeatureRequest>> {
        return apiService.post<FeatureRequest>('/feature-requests', data);
    },

    async update(id: number, data: Partial<FeatureRequest>): Promise<ApiResponse<FeatureRequest>> {
        return apiService.put<FeatureRequest>(`/feature-requests/${id}`, data);
    },

    async changeStatus(
        id: number,
        payload: { status: FeatureRequestStatus; note?: string | null; notify?: boolean }
    ): Promise<ApiResponse<FeatureRequest>> {
        return apiService.post<FeatureRequest>(`/feature-requests/${id}/status`, payload);
    },

    async bulkStatus(payload: {
        ids: number[];
        status: FeatureRequestStatus;
        note?: string | null;
        notify?: boolean;
    }): Promise<ApiResponse<{ updated: number }>> {
        return apiService.post<{ updated: number }>('/feature-requests/bulk-status', payload);
    },

    async remove(id: number): Promise<ApiResponse<null>> {
        return apiService.delete<null>(`/feature-requests/${id}`);
    },

    async addComment(id: number, body: string): Promise<ApiResponse<FeatureRequest>> {
        return apiService.post<FeatureRequest>(`/feature-requests/${id}/comments`, { body });
    },

    async setCommentHidden(commentId: number, isHidden: boolean): Promise<ApiResponse<null>> {
        return apiService.put<null>(`/feature-request-comments/${commentId}`, { is_hidden: isHidden });
    },

    async removeComment(commentId: number): Promise<ApiResponse<null>> {
        return apiService.delete<null>(`/feature-request-comments/${commentId}`);
    },
};

export const boardSettingsService = {
    async get(appId: number): Promise<ApiResponse<BoardConfig>> {
        return apiService.get<BoardConfig>(`/apps/${appId}/board`);
    },

    async update(appId: number, data: Partial<BoardSettings>): Promise<ApiResponse<BoardConfig>> {
        return apiService.put<BoardConfig>(`/apps/${appId}/board`, data);
    },

    async provision(appId: number): Promise<ApiResponse<BoardConfig>> {
        return apiService.post<BoardConfig>(`/apps/${appId}/board/provision`, {});
    },

    async rotateSecret(appId: number): Promise<ApiResponse<{ board_secret: string }>> {
        return apiService.post<{ board_secret: string }>(`/apps/${appId}/board/rotate-secret`, {});
    },
};
