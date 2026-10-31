// Notes shown under the player's profile.

/** The free text of an Intervals.icu workout description, without the step lines. */
export function workoutNotes(description: string | null): string | null {
  if (!description) return null;
  const lines = description.split(/\r?\n/);
  const firstStep = lines.findIndex((l) => /^\s*-\s/.test(l));
  const keep = firstStep < 0 ? lines : lines.slice(0, firstStep);
  // Drop the section title right above the first step ("Riscaldamento", "Sweet spot 3x").
  if (firstStep > 0 && keep[keep.length - 1].trim()) keep.pop();
  const text = keep.join("\n").trim();
  return text || null;
}
