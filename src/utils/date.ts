/**
 * Day-month-year in the viewer's locale, which is how every board and admin
 * surface shows a date.
 *
 * `fallback` covers a missing value: the board leaves the slot empty, the admin
 * tables draw a dash.
 */
export const formatDate = (value?: string | null, fallback = ''): string =>
    value
        ? new Date(value).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          })
        : fallback;
