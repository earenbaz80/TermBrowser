export const TERMINUS_SEARCH_URL = 'terminus://search';
export const TERMINUS_SEARCH_PROVIDER = 'DuckDuckGo + Wikipedia';

export const isTerminusSearchUrl = (url?: string): boolean =>
  Boolean(url && url.startsWith(TERMINUS_SEARCH_URL));

export const buildTerminusSearchUrl = (query?: string): string => {
  const cleanQuery = (query ?? '').trim();
  return cleanQuery ? `${TERMINUS_SEARCH_URL}?q=${encodeURIComponent(cleanQuery)}` : TERMINUS_SEARCH_URL;
};

export const getTerminusSearchQuery = (url?: string): string => {
  if (!isTerminusSearchUrl(url)) return '';
  try {
    return (new URL(url as string).searchParams.get('q') ?? '').trim();
  } catch {
    return '';
  }
};
