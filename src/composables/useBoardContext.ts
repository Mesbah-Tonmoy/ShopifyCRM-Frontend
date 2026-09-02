import { inject, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { BoardConfigResponse, BoardRequest } from '@/services/boardService';

/**
 * Shared board state provided by BoardLayout. Views get the slug, the config
 * and a consistent way to report success and failure, without each one
 * re-implementing session handling.
 */
export interface BoardContext {
    slug: ComputedRef<string>;
    config: Ref<BoardConfigResponse | null>;
    canWrite: ComputedRef<boolean>;
    /** Whether this merchant may open a new request right now. */
    canSubmit: ComputedRef<boolean>;
    notify: (message: string) => void;
    handleError: (error: unknown) => void;
    refreshCounts: () => Promise<void>;
    /** Opens the submission form, which the layout hosts so any tab can raise it. */
    openSubmitForm: () => void;
    /**
     * The last request created, and the last one changed, from outside a view.
     * Views watch these to fold the change into whatever they are showing
     * rather than reloading wholesale.
     */
    lastCreated: Ref<BoardRequest | null>;
    lastUpdated: Ref<BoardRequest | null>;
}

export const BOARD_CONTEXT: InjectionKey<BoardContext> = Symbol('board-context');

export const useBoardContext = (): BoardContext => {
    const context = inject(BOARD_CONTEXT);

    if (!context) {
        throw new Error('useBoardContext must be used inside BoardLayout.');
    }

    return context;
};
