// Función serverless (Vercel): lee/borra leads para el panel de administración.
// Usa la clave service_role de Supabase SOLO del lado del servidor (nunca llega al navegador).
// Protegida por contraseña (ADMIN_PASSWORD).
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY → clave secreta service_role (Supabase → Settings → API)
//   ADMIN_PASSWORD            → la contraseña para entrar al panel (elígela tú)
//   SUPABASE_URL              → opcional; por defecto el proyecto ya configurado

const SUPABASE_URL = process.env.SUPABASE_URL || "https://tosqlwepfsotlyzyinyr.supabase.co";

module.exports = async (req, res) => {
  const pass = process.env.ADMIN_PASSWORD;
  const given = req.headers["x-admin-password"] || (req.query && req.query.pw);
  if (!pass || given !== pass) return res.status(401).json({ error: "Contraseña incorrecta" });

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) return res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel" });
  const h = { apikey: KEY, "Authorization": `Bearer ${KEY}` };

  try {
    if (req.method === "GET") {
      const view = (req.query && req.query.view === "all") ? "leads" : "leads_seguimiento";
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${view}?select=*&order=created_at.desc`, { headers: h });
      const data = await r.json();
      return res.status(r.ok ? 200 : 502).json(data);
    }
    if (req.method === "DELETE") {
      const id = req.query && req.query.id;
      if (!id) return res.status(400).json({ error: "Falta id" });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h });
      return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
