/** First letter upper case: labels, hints and names that start a line ("rulli" → "Rulli"). */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase("it-IT") + s.slice(1) : s;
}
