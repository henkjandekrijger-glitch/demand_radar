// GET /api/me — wie is ingelogd (naam), voor de knoppen op de pagina. Geen gevoelige gegevens.
import { whoAmI } from '../lib/access.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const name = whoAmI(req);
  res.status(200).json({ signedIn: !!name, name: name || null });
}
