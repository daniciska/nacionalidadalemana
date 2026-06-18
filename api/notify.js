// Función serverless (Vercel): avisa por email cada nuevo lead.
// La dispara un Database Webhook de Supabase al insertarse una fila en `leads`.
// Variables de entorno (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  → tu clave de Resend (re_...)
//   OWNER_EMAIL     → a qué correo te avisamos (en modo prueba: el de tu cuenta Resend)
//   FROM_EMAIL      → opcional; por defecto onboarding@resend.dev (funciona sin dominio)
//   WEBHOOK_SECRET  → opcional; si lo defines, debe venir en el header x-webhook-secret

function esc(s){ return String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers["x-webhook-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const rec = (body && body.record) || body || {};

  const name    = rec.name  || "Sin nombre";
  const email   = rec.email || "—";
  const phone   = rec.phone || "—";
  const verdict = Array.isArray(rec.verdict) ? rec.verdict : [];
  const top     = verdict.map(v => `${v.name || v.via}: ${v.state}`).join(" · ") || "sin veredicto";

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const OWNER_EMAIL    = process.env.OWNER_EMAIL;
  const FROM           = process.env.FROM_EMAIL || "onboarding@resend.dev";
  if (!RESEND_API_KEY || !OWNER_EMAIL) {
    return res.status(500).json({ error: "Faltan RESEND_API_KEY u OWNER_EMAIL en las variables de entorno" });
  }

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 12px">🇩🇪 Nuevo lead — Nacionalidad Alemana</h2>
      <table style="border-collapse:collapse;font-size:15px">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Nombre</td><td><b>${esc(name)}</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td>${esc(email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Teléfono</td><td>${esc(phone)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Veredicto</td><td>${esc(top)}</td></tr>
      </table>
      <p style="color:#64748b;font-size:13px;margin-top:16px">Revisa el árbol y las respuestas completas en Supabase → Table Editor → <b>leads</b>.</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Nacionalidad Alemana <${FROM}>`,
        to: [OWNER_EMAIL],
        subject: `Nuevo lead: ${name} — ${top}`,
        html
      })
    });
    const detail = await r.text();
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, resend: r.ok ? "sent" : detail });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
