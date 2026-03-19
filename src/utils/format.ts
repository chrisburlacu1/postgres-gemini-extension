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

export const CHARACTER_LIMIT = 30000;

export function formatRows(rows: any[], maxRows: number = 100): string {
  if (!rows || rows.length === 0) return "No results found.";

  let outputText = "";

  if (rows.length > maxRows) {
    const truncatedRows = rows.slice(0, maxRows);
    outputText = formatToMarkdownTable(truncatedRows);
    outputText += `\n\n*(Note: Result truncated to first ${maxRows} rows)*`;
  } else {
    outputText = formatToMarkdownTable(rows);
  }

  // Final safety check for character limit
  if (outputText.length > CHARACTER_LIMIT) {
    outputText = outputText.substring(0, CHARACTER_LIMIT) + "... [Truncated due to response size limit]";
  }

  return outputText;
}
