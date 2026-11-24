/** Use words for the separator so a screen reader reads it as a score. */
export function formatOpenPlayScore(score: string): string {
  return score.replace(/^(\d+)\s*-\s*(\d+)$/, '$1 to $2');
}
