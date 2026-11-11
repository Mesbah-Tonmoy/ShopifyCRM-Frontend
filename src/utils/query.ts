/**
 * Query string for an API filter object: "?a=1&b=x", or '' when nothing is set.
 *
 * undefined and null are left out (and '' too with `skipEmpty`), so only the
 * filters actually in use are sent. Arrays become repeated `key[]=value`
 * pairs, the shape Laravel reads as an array.
 */
export function toQuery(params?: object, { skipEmpty = false }: { skipEmpty?: boolean } = {}): string {
    if (!params) return '';

    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || (skipEmpty && value === '')) return;

        if (Array.isArray(value)) {
            value.forEach((entry) => query.append(`${key}[]`, String(entry)));
        } else {
            query.append(key, String(value));
        }
    });

    const encoded = query.toString();

    return encoded ? `?${encoded}` : '';
}
