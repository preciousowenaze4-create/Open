import app from '../server/app.js';

export default function handler(req: any, res: any) {
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/site')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  return app(req, res);
}
