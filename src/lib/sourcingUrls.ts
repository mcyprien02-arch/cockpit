export function cleanKeyword(kw: string): string {
  return kw
    .replace(/[/\\()[\]{}|#@!?*+,;:.~<>^$&%"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lbcUrl(keyword: string, prixMax: number | null): string {
  const k = encodeURIComponent(cleanKeyword(keyword));
  let url = `https://www.leboncoin.fr/recherche?text=${k}`;
  if (prixMax != null && prixMax > 0) url += `&price=0-${Math.round(prixMax)}`;
  return url;
}

export function vintedUrl(keyword: string, prixMax: number | null): string {
  const k = encodeURIComponent(cleanKeyword(keyword));
  let url = `https://www.vinted.fr/catalog?search_text=${k}`;
  if (prixMax != null && prixMax > 0) url += `&price_to=${Math.round(prixMax)}`;
  return url;
}
