/**
 * Hands a blob to the browser as a download.
 *
 * Shared by the client-side CSV builder below and by downloads the server
 * generates, which arrive as a blob because the API needs an auth header and
 * so cannot be fetched by a plain link.
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

/**
 * Exports data to a CSV file.
 * 
 * @param filename The name of the file to download (without extension).
 * @param headers Array of column headers.
 * @param rows Array of arrays containing the data rows.
 */
export const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    if (rows.length === 0) {
        console.warn('No data to export');
        return;
    }

    const csvContent = [
        headers.join(','),
        ...rows.map(row => {
            // Escape fields that might contain commas
            return row.map(field => {
                const stringField = String(field);
                if (stringField.includes(',')) {
                    return `"${stringField}"`;
                }
                return stringField;
            }).join(',');
        })
    ].join('\n');

    saveBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
};
