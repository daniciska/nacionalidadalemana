// Función serverless (Vercel): recibe un lead, verifica el captcha (Cloudflare Turnstile)
// e inserta en Supabase con la clave service_role (del lado del servidor).
//
// Flujo: el primer guardado ('parcial') exige captcha y devuelve un "pase" firmado;
//        el guardado final ('completo') usa ese pase (no se vuelve a pedir captcha).
//
// Variables de entorno (Vercel):
//   SUPABASE_SERVICE_ROLE_KEY → clave secreta service_role
//   TURNSTILE_SECRET          → clave secreta del widget Turnstile (Cloudflare)
//   SESSION_SECRET            → cadena aleatoria para firmar el pase de sesión
//   SUPABASE_URL              → opcional; por defecto el proyecto configurado

const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://tosqlwepfsotlyzyinyr.supabase.co";

function sign(sid, exp){
  const h = crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev").update(sid + "." + exp).digest("hex");
  return sid + "." + exp + "." + h;
}
function verifyPass(pass, sid){
  if (!pass || typeof pass !== "string") return false;
  const parts = pass.split("."); if (parts.length < 3) return false;
  const [s, exp, h] = parts;
  if (s !== sid || Number(exp) < Date.now()) return false;
  const good = crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev").update(s + "." + exp).digest("hex");
  if (h.length !== good.length) return false;
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(good));
}
async function verifyTurnstile(token, ip){
  if (!process.env.TURNSTILE_SECRET) return true;        // no configurado todavía → no bloquea (transición)
  if (!token) return false;
  const params = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token });
  if (ip) params.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params
    });
    const d = await r.json();
    return !!d.success;
  } catch { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) return res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" });

  const sessionId = String(body.session_id || "");
  if (!sessionId) return res.status(400).json({ error: "Falta session_id" });
  const status = body.status === "completo" ? "completo" : "parcial";
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();

  if (status === "parcial") {
    if (!(await verifyTurnstile(body.token, ip))) return res.status(403).json({ error: "Captcha inválido" });
  } else {
    if (!verifyPass(body.pass, sessionId)) return res.status(403).json({ error: "Sesión no autorizada" });
  }

  const str = (v, n) => v ? String(v).slice(0, n) : null;
  const row = {
    session_id: sessionId, status,
    lang: str(body.lang, 5), name: str(body.name, 200), email: str(body.email, 200), phone: str(body.phone, 60),
    answers: (body.answers && typeof body.answers === "object") ? body.answers : {},
    verdict: Array.isArray(body.verdict) ? body.verdict : []
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: { apikey: KEY, "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(row)
    });
    if (!r.ok) { const t = await r.text(); return res.status(502).json({ error: "DB", detail: t }); }
    const out = { ok: true };
    if (status === "parcial") out.pass = sign(sessionId, Date.now() + 1000 * 60 * 60 * 6); // pase válido 6 h
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
