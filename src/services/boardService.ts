import type { FeatureRequestStatus } from '@/services/featureRequestService';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://crm.zapioapps.com/backendapp';
const API_URL = `${BASE_URL}/api/board`;

export interface BoardVoter {
    shop_domain: string;
    store_name: string | null;
    is_installed: boolean;
}

export interface BoardComment {
    id: number;
    body: string;
    is_official: boolean;
    author_name: string;
    created_at: string | null;
}

export interface BoardRequest {
    id: number;
    title: string;
    description: string | null;
    image_url: string | null;
    status: FeatureRequestStatus;
    status_label: string;
    status_note: string | null;
    votes_count: number | null;
    has_voted: boolean;
    is_subscribed: boolean;
    is_pinned: boolean;
    comments_count: number;
    submitter_name: string | null;
    created_at: string | null;
    completed_at: string | null;
}

export interface BoardConfigResponse {
    app: { name: string; icon: string | null };
    board: {
        slug: string;
        title: string;
        intro: string | null;
        theme: Record<string, unknown> | null;
        allow_submissions: boolean;
        allow_voting: boolean;
        allow_comments: boolean;
        show_vote_counts: boolean;
    };
    statuses: { value: FeatureRequestStatus; label: string; count: number }[];
    voter: BoardVoter | null;
}

export interface BoardColumn {
    status: FeatureRequestStatus;
    label: string;
    total: number;
    requests: BoardRequest[];
}

export interface BoardMe {
    voter: BoardVoter;
    submissions: BoardRequest[];
    stats: { submitted: number; voted: number; shipped: number };
}

export interface BoardPaginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export type BoardSort = 'votes' | 'trending' | 'newest' | 'oldest';

/**
 * The orderings offered on both tabs. Kept here beside the filter type so the
 * labels and the values the API accepts cannot drift apart.
 */
export const BOARD_SORT_OPTIONS: readonly { value: BoardSort; label: string }[] = [
    { value: 'votes', label: 'Most voted' },
    { value: 'trending', label: 'Trending' },
    { value: 'newest', label: 'Newest' },
];

export interface BoardListFilters {
    status?: FeatureRequestStatus | null;
    search?: string;
    match?: 'all' | 'any';
    sort?: BoardSort;
    per_page?: number;
    page?: number;
}

/**
 * Raised when the board session is missing or has expired. The layout catches
 * this and asks the merchant to reload, which mints a fresh token.
 */
export class BoardSessionExpired extends Error {
    constructor() {
        super('Your session has expired. Reload the page to continue.');
        this.name = 'BoardSessionExpired';
    }
}

const sessionKey = (slug: string) => `board_session:${slug}`;

export const boardSession = {
    get: (slug: string): string | null => sessionStorage.getItem(sessionKey(slug)),
    set: (slug: string, session: string) => sessionStorage.setItem(sessionKey(slug), session),
    clear: (slug: string) => sessionStorage.removeItem(sessionKey(slug)),
};

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

/**
 * The board never carries the CRM's admin bearer token. It authenticates only
 * with the board session minted from the app's HMAC-signed token, so an admin
 * browsing the board has no more power there than any merchant.
 */
const request = async <T>(
    path: string,
    {
        method = 'GET',
        body,
        form,
        slug,
    }: { method?: string; body?: unknown; form?: FormData; slug?: string } = {}
): Promise<T> => {
    const headers: Record<string, string> = {
        Accept: 'application/json',
    };

    // Let the browser set the multipart boundary; setting it by hand breaks
    // the upload.
    if (!form) {
        headers['Content-Type'] = 'application/json';
    }

    const session = slug ? boardSession.get(slug) : null;

    if (session) {
        headers.Authorization = `Board ${session}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 && slug) {
        boardSession.clear(slug);
        throw new BoardSessionExpired();
    }

    if (!response.ok) {
        throw new Error(payload.message || 'Something went wrong. Please try again.');
    }

    return payload.data as T;
};

export const boardService = {
    /**
     * Exchange the app-signed token for a session. Called once on load.
     */
    async createSession(token: string): Promise<{ session: string; board_slug: string; voter: BoardVoter }> {
        return request('/session', { method: 'POST', body: { token } });
    },

    async getConfig(slug: string): Promise<BoardConfigResponse> {
        return request(`/${slug}/config`, { slug });
    },

    async getRequests(slug: string, filters?: BoardListFilters): Promise<BoardPaginated<BoardRequest>> {
        return request(`/${slug}/requests${toQuery(filters as Record<string, unknown>)}`, { slug });
    },

    async getRoadmap(slug: string, sort?: BoardSort): Promise<{ columns: BoardColumn[] }> {
        return request(`/${slug}/roadmap${toQuery({ sort })}`, { slug });
    },

    async getMe(slug: string): Promise<BoardMe> {
        return request(`/${slug}/me`, { slug });
    },

    /**
     * Submissions may carry a screenshot, so they go up as multipart rather
     * than JSON.
     */
    async submit(
        slug: string,
        body: { title: string; description: string; image?: File | null }
    ): Promise<BoardRequest> {
        const form = new FormData();
        form.append('title', body.title);
        form.append('description', body.description);

        if (body.image) {
            form.append('image', body.image);
        }

        return request(`/${slug}/requests`, { method: 'POST', form, slug });
    },

    async subscribe(slug: string, id: number): Promise<BoardRequest> {
        return request(`/${slug}/requests/${id}/subscribe`, { method: 'POST', body: {}, slug });
    },

    async unsubscribe(slug: string, id: number): Promise<BoardRequest> {
        return request(`/${slug}/requests/${id}/subscribe`, { method: 'DELETE', slug });
    },

    async getComments(slug: string, id: number): Promise<BoardComment[]> {
        return request(`/${slug}/requests/${id}/comments`, { slug });
    },

    async addComment(slug: string, id: number, body: string): Promise<BoardComment> {
        return request(`/${slug}/requests/${id}/comments`, { method: 'POST', body: { body }, slug });
    },

    async vote(slug: string, id: number): Promise<BoardRequest> {
        return request(`/${slug}/requests/${id}/vote`, { method: 'POST', body: {}, slug });
    },

    async unvote(slug: string, id: number): Promise<BoardRequest> {
        return request(`/${slug}/requests/${id}/vote`, { method: 'DELETE', slug });
    },
};
