import app from './_server.mjs';

export default function handler(req, res) {
  try {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const vpath = urlObj.searchParams.get('__vpath');
    const vsite = urlObj.searchParams.get('__vsite');
    if (vsite !== null) {
      urlObj.searchParams.delete('__vsite');
      const qs = urlObj.searchParams.toString();
      req.url = `/site/${vsite.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
    } else if (vpath !== null) {
      urlObj.searchParams.delete('__vpath');
      const qs = urlObj.searchParams.toString();
      req.url = `/api/${vpath.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
    } else if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/site')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
    }
  } catch {
    // Keep req.url unchanged on URL parse fallback
  }
  return app(req, res);
}
