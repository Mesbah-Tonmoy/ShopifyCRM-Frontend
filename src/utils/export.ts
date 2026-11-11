/**
 * Hands a blob to the browser as a download.
 *
 * Used for downloads the server generates, which arrive as a blob because the
 * API needs an auth header and so cannot be fetched by a plain link.
 */
export const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Without this the blob is held until the tab is closed.
    URL.revokeObjectURL(url);
};
