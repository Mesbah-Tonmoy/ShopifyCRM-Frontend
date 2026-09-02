/**
 * The message to show a user for a thrown value.
 *
 * Services reject with an Error carrying the API's own message; anything else
 * that reaches a catch block is not worth showing, so the caller's fallback
 * stands in.
 */
export const errorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error && error.message ? error.message : fallback;
