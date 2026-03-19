export function formatToMarkdownTable(rows: any[]): string {
  if (!rows || rows.length === 0) return "No results found.";

  const keys = Object.keys(rows[0]);
  
  // Create the header row
  const header = `| ${keys.join(' | ')} |`;
  // Create the separator row
  const separator = `| ${keys.map(() => '---').join(' | ')} |`;
  
  // Create the data rows
  const body = rows.map(row => {
    return `| ${keys.map(key => {
      let val = row[key];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'object') return JSON.stringify(val); // Handle nested JSON/arrays
      return String(val).replace(/\|/g, '\\|'); // Escape markdown pipes
    }).join(' | ')} |`;
  }).join('\n');

  return `${header}\n${separator}\n${body}`;
}

export function formatRows(rows: any[], maxRows: number = 50): string {
  if (!rows || rows.length === 0) return "No results found.";

  let outputText = "";

  if (rows.length > maxRows) {
    const truncatedRows = rows.slice(0, maxRows);
    outputText = formatToMarkdownTable(truncatedRows);
    outputText += `\n\n*(Note: Result truncated. Showing ${maxRows} of ${rows.length} rows)*`;
  } else {
    outputText = formatToMarkdownTable(rows);
  }

  return outputText;
}
