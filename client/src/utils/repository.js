/**
 * CodeWhy Repository Normalization & Shared Utilities
 */

export function normalizeRepoInput(input) {
  if (!input || typeof input !== 'string') return '';
  let clean = input.trim();
  clean = clean.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '');
  clean = clean.replace(/^git@github\.com:/i, '');
  clean = clean.replace(/\.git$/i, '');
  clean = clean.replace(/^\/+|\/+$/g, '');
  const parts = clean.split('/');
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`.toLowerCase();
  }
  return clean.toLowerCase();
}

