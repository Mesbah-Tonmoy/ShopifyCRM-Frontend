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

    // Create downloadable link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
