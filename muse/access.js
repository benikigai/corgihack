import crypto from 'node:crypto';
import express from 'express';

const hash = (value) => crypto.createHash('sha256').update(value).digest();
const equal = (left, right) => crypto.timingSafeEqual(hash(left), hash(right));

// A private, single-owner deployment. All signed-in devices share the same agent.
// Agent callbacks keep their own per-instance bearer-token authentication.
export function installAccess(app, { password, sessionSecret, publicUrl }) {
  if (!password) return;
  const secure = publicUrl.startsWith('https://') ? '; Secure' : '';
  const signature = (expires) => crypto.createHmac('sha256', sessionSecret)
    .update(`muse-access:${expires}:${password}`).digest('hex');
  const attempts = new Map();

  function signedIn(req) {
    const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim())
      .find((part) => part.startsWith('muse_access='))?.slice('muse_access='.length) || '';
    const [expires, mac] = cookie.split('.');
    return /^\d{13}$/.test(expires || '') && Number(expires) > Date.now()
      && mac && equal(mac, signature(expires));
  }

  app.get('/login', (req, res) => {
    if (signedIn(req)) return res.redirect(303, '/');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Sign in · Muse</title><style>
      *{box-sizing:border-box}body{margin:0;background:#f6f5f1;color:#292725;font:16px system-ui;display:grid;place-items:center;min-height:100dvh;padding:24px}
      main{width:100%;max-width:400px}h1{font-size:48px;letter-spacing:-2px;margin:0 0 12px}
      p{color:#6c6962;line-height:1.6}label{display:block;margin:32px 0 10px}
      input,button{width:100%;font:inherit;border-radius:16px;padding:16px;border:1px solid #d4d1ca}
      input{background:white}button{margin-top:16px;background:#292725;color:white;cursor:pointer}
      .error{color:#a32626;font-size:14px}</style></head><body><main>
      <h1>Your Muse.</h1><p>A private space for your personal agent.</p>
      <form method="post" action="/login"><label for="password">Access password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      ${req.query.error ? '<p class="error">Incorrect password. Please try again.</p>' : ''}
      <button type="submit">Continue</button></form></main></body></html>`);
  });

  app.post('/login', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    if (req.headers.origin && publicUrl && req.headers.origin !== publicUrl) return res.sendStatus(403);
    const now = Date.now();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    const entry = attempts.get(req.ip) || { count: 0, until: now + 60_000 };
    if (entry.count >= 10 || attempts.size >= 1000) {
      res.set('Retry-After', '60');
      return res.status(429).send('Too many sign-in attempts. Please try again in a minute.');
    }
    if (typeof req.body?.password !== 'string' || !equal(req.body.password, password)) {
      entry.count += 1;
      attempts.set(req.ip, entry);
      return res.redirect(303, '/login?error=1');
    }
    attempts.delete(req.ip);
    const expires = String(now + 7 * 24 * 60 * 60 * 1000);
    res.set('Set-Cookie', `muse_access=${expires}.${signature(expires)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
    res.set('Cache-Control', 'no-store');
    res.redirect(303, '/');
  });

  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/api/notify') return next();
    if (!signedIn(req)) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: { code: 'sign_in_required', message: 'Sign in to your Muse first.' } });
      return res.redirect(303, '/login');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && publicUrl && req.headers.origin !== publicUrl) {
      return res.sendStatus(403);
    }
    res.set('Cache-Control', 'no-store');
    req.ownerId = crypto.createHmac('sha256', sessionSecret).update('muse-owner').digest('hex').slice(0, 24);
    next();
  });
}
