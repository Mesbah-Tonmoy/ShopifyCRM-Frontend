import { computed } from 'vue';
import { boardService, type BoardRequest } from '@/services/boardService';
import { useBoardContext } from '@/composables/useBoardContext';

/**
 * Optimistic voting, shared by the two board tabs.
 *
 * The card flips the moment it is clicked and rolls back if the server
 * disagrees, so a vote never waits on a round trip.
 *
 * @param sync    Folds the server's copy of the request back into whatever the
 *                caller is rendering.
 * @param onVoted Ran after a successful vote, for anything the caller keeps
 *                alongside the list — the "you voted" tally, say.
 */
export function useBoardVoting(
    sync: (request: BoardRequest) => void,
    onVoted?: () => void
) {
    const board = useBoardContext();

    const canVote = computed(
        () => Boolean(board.config.value?.board.allow_voting) && board.canWrite.value
    );

    const toggleVote = async (request: BoardRequest) => {
        if (!canVote.value) {
            board.notify('Open this board from your Shopify admin to vote.');
            return;
        }

        const previous = { has_voted: request.has_voted, votes_count: request.votes_count };

        request.has_voted = !previous.has_voted;
        if (request.votes_count !== null) {
            request.votes_count = previous.has_voted
                ? request.votes_count - 1
                : request.votes_count + 1;
        }

        try {
            const updated = previous.has_voted
                ? await boardService.unvote(board.slug.value, request.id)
                : await boardService.vote(board.slug.value, request.id);

            Object.assign(request, updated);
            sync(request);
            board.notify(previous.has_voted ? 'Vote removed' : 'Vote counted');
            onVoted?.();
            board.refreshCounts();
        } catch (error) {
            Object.assign(request, previous);
            board.handleError(error);
        }
    };

    return { canVote, toggleVote };
}
