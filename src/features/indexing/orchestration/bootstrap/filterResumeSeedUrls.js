export function filterResumeSeedUrls({
  urls = [],
} = {}) {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}
