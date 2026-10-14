// /api/unlock?key=<sleutel> zet het Pro-cookie; /api/unlock?logout=1 haalt het weg.
import { cookieFor } from '../lib/access.js';

export default function handler(req, res) {
  const go = (loc, cookie) => { if (cookie) res.setHeader('Set-Cookie', cookie); res.statusCode = 302; res.setHeader('Location', loc); res.setHeader('Cache-Control', 'no-store'); res.end(); };
  if (req.query.logout) return go('/', 'dr_pro=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  const c = cookieFor(req.query.key);
  if (!c) return go('/login?fail=1');
  go('/?signedin=1', `dr_pro=${c}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
}
