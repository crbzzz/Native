export function sanitizeAssistantText(text: string): string {
  // Supprime les blocs de texte type "free plan limit" qui n'ont rien à faire dans l'UI.
  const lines = (text || '').split(/\r?\n/);
  const blockedPhrases = [
    "You've hit the Free plan limit for Crawl-4o",
    'Subscribe to Pro plan to increase limits.',
    'Responses will use another model until your limit resets',
  ];

  const filtered = lines.filter((line) => {
    const l = line.trim();
    if (!l) return true;
    return !blockedPhrases.some((p) => l.includes(p));
  });

  // Nettoyage espaces
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
