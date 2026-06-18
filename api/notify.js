// Función serverless (Vercel): avisa por email cada nuevo lead con un informe completo del caso.
// La dispara un Database Webhook de Supabase al insertarse una fila en `leads`.
// Variables de entorno (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  → tu clave de Resend (re_...)
//   OWNER_EMAIL     → a qué correo te avisamos (en modo prueba: el de tu cuenta Resend)
//   FROM_EMAIL      → opcional; por defecto onboarding@resend.dev (funciona sin dominio)
//   WEBHOOK_SECRET  → opcional; si lo defines, debe venir en el header x-webhook-secret

function esc(s){ return String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function isGermanC(p){ return !!(p && ((p.country && /alemania|germany|deutschland/i.test(p.country)) || p.germanCitizen==="si")); }
function genL(depth, rel){ const f=rel==="madre"; const es=["", f?"Madre":"Padre", f?"Abuela":"Abuelo", f?"Bisabuela":"Bisabuelo", f?"Tatarabuela":"Tatarabuelo"]; return depth<es.length?es[depth]:"Ancestro/a"; }

const ST = {
  VIABLE: ["#15803d","#dcfce7","Prometedor"],
  DUDOSO: ["#b45309","#fef3c7","Posible"],
  POCO:   ["#b91c1c","#fee2e2","Difícil por esta vía"],
  INFO:   ["#1d4ed8","#dbeafe","Falta información"]
};

function treeHTML(applicant, chain, mark){
  const rows = [{p:applicant, rel:null}].concat((chain||[]).map(x=>({p:x, rel:x.rel})));
  return rows.map((row, idx) => {
    const p = row.p || {};
    const isMark = mark && p.name && p.name === mark.person;
    const isDE = isGermanC(p);
    let bd = "#e2e8f0", bg = "#fff", tag = "";
    if (isMark){ const r = mark.type==="legit"; bd = r?"#b45309":"#b91c1c"; bg = r?"#fef3c7":"#fee2e2";
      tag = `<span style="background:${bd};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px">⚠ ${r?"a revisar (legitimación)":(mark.type==="loss"?"posible pérdida aquí":"la línea se corta aquí")}</span>`; }
    else if (isDE){ bd = "#15803d"; bg = "#dcfce7"; tag = `<span style="background:#15803d;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px">🇩🇪 raíz alemana</span>`; }
    const gen = idx===0 ? "Tú" : genL(idx, row.rel);
    const meta = [p.birthYear, p.country].filter(Boolean).join(" · ");
    const conn = idx < rows.length-1 ? `<div style="width:2px;height:14px;background:#e2e8f0;margin-left:34px"></div>` : "";
    return `<div style="display:flex;gap:12px;align-items:flex-start;border:1.5px solid ${bd};background:${bg};border-radius:12px;padding:9px 12px">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;min-width:66px;padding-top:2px">${esc(gen)}</div>
        <div><div style="font-weight:700;font-size:14px">${esc(p.name||"(sin nombre)")}</div>${meta?`<div style="color:#64748b;font-size:12px">${esc(meta)}</div>`:""}${tag?`<div style="margin-top:5px">${tag}</div>`:""}</div>
      </div>${conn}`;
  }).join("");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers["x-webhook-secret"] !== secret) return res.status(401).json({ error: "Unauthorized" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const rec = (body && body.record) || body || {};

  // Solo avisamos cuando el cuestionario se completa; los "parciales" quedan en la tabla para seguimiento.
  if (rec.status === "parcial") return res.status(200).json({ ok: true, skipped: "parcial" });

  const name = rec.name || "Sin nombre";
  const email = rec.email || "—";
  const phone = rec.phone || "—";
  const ans = rec.answers || {};
  const verdict = Array.isArray(rec.verdict) ? rec.verdict : [];
  const investigate = Array.isArray(ans.investigate) ? ans.investigate : [];
  const markA = (verdict.find(v => v.via === "A") || {}).mark || null;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const OWNER_EMAIL = process.env.OWNER_EMAIL;
  const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";
  if (!RESEND_API_KEY || !OWNER_EMAIL) return res.status(500).json({ error: "Faltan RESEND_API_KEY u OWNER_EMAIL" });

  // orden de vías por prioridad
  const order = { VIABLE:0, DUDOSO:1, INFO:2, POCO:3 };
  const sorted = [...verdict].sort((a,b)=>(order[a.state]??9)-(order[b.state]??9));
  const top = sorted[0] ? `${ST[sorted[0].state] ? ST[sorted[0].state][2] : sorted[0].state}` : "sin veredicto";

  const viaCards = sorted.map(v => {
    const s = ST[v.state] || ["#64748b","#f1f5f9", v.state];
    return `<div style="border:1px solid ${s[0]};background:${s[1]};border-radius:12px;padding:12px 14px;margin-bottom:10px">
        <span style="background:${s[0]};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px">${s[2]}</span>
        <div style="font-weight:700;font-size:14px;margin:6px 0 2px">${esc(v.name||v.via)}</div>
        ${v.msg?`<div style="font-size:13px;color:#334155">${esc(v.msg)}</div>`:""}
      </div>`;
  }).join("");

  const invList = investigate.length
    ? `<h3 style="font-size:14px;margin:18px 0 6px">Qué conviene averiguar</h3>
       <ul style="margin:0;padding-left:18px;color:#334155;font-size:13px">${investigate.map(x=>`<li style="margin-bottom:3px">${esc(x)}</li>`).join("")}</ul>`
    : "";

  const notesHtml = (ans.facts && ans.facts.notes)
    ? `<h3 style="font-size:14px;margin:18px 0 6px">Nota del solicitante</h3>
       <div style="font-size:13px;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;color:#334155">${esc(ans.facts.notes)}</div>`
    : "";

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
      <h2 style="margin:0 0 4px">🇩🇪 Nuevo lead — Nacionalidad Alemana</h2>
      <p style="color:#64748b;margin:0 0 16px;font-size:14px">Resultado preliminar: <b>${esc(top)}</b></p>

      <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
        <tr><td style="padding:3px 14px 3px 0;color:#64748b">Nombre</td><td><b>${esc(name)}</b></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b">Teléfono</td><td>${esc(phone)}</td></tr>
      </table>

      <h3 style="font-size:14px;margin:0 0 8px">Árbol familiar</h3>
      <div style="display:flex;flex-direction:column;gap:0;margin-bottom:18px">${treeHTML(ans.applicant, ans.chain, markA)}</div>

      <h3 style="font-size:14px;margin:0 0 8px">Vías evaluadas</h3>
      ${viaCards || `<div style="color:#64748b;font-size:13px">Sin vías determinadas — requiere investigar más.</div>`}

      ${invList}
      ${notesHtml}

      <p style="color:#94a3b8;font-size:11.5px;margin-top:22px;border-top:1px solid #e2e8f0;padding-top:12px">
        Orientación preliminar automática (no es asesoría jurídica). El detalle completo del árbol y las respuestas está en Supabase → Table Editor → <b>leads</b>.
      </p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Nacionalidad Alemana <${FROM}>`, to: [OWNER_EMAIL], subject: `Nuevo lead: ${name} — ${top}`, html })
    });
    const detail = await r.text();
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, resend: r.ok ? "sent" : detail });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
