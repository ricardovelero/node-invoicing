export const normalizeCatalogText = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

export const shortCatalogName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').slice(0, 80).trim();
