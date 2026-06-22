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

// Etiquetas legibles de cada respuesta clave y traducción de sus valores (para el volcado completo).
const FACT_LABELS = {
  emigYear:"¿Cuándo emigró el antepasado?", matrikel:"¿Tiene matrícula consular (Matrikel)?",
  natz1914:"¿Se naturalizó en otro país antes de 1914?", persecution:"¿Hubo persecución del Nacionalsocialismo?",
  persecution_type:"Tipo de persecución", natz25:"¿Se naturalizó voluntariamente en otro país?",
  natz25_eu:"¿La naturalización fue en la UE/Suiza?", natz25_year:"¿Antes o después de 2024?",
  natz25_permit:"¿Pidió permiso de conservación (Beibehaltung)?", natz25_when:"¿La naturalización fue antes o después del nacimiento del hijo/a?",
  adoption:"¿Alguien de la línea fue adoptado?", adoption_age:"¿Adoptado siendo menor o adulto?",
  marriageloss:"¿Una mujer de la línea se casó con un no-alemán antes de 1953?",
  mil28:"¿Servicio militar voluntario en otro país desde 2000?", namechange:"¿Cambios/errores de apellido en la línea?",
  relative:"¿Algún familiar ya obtuvo la nacionalidad por este antepasado?", lives:"¿Vive actualmente en Alemania?",
  hasGermanDoc:"¿Tiene algún documento alemán del antepasado?", germanDocType:"Tipo de documento alemán",
  germanDocTypeOther:"Documento (otro, detalle)"
};
const FACT_VALUES = {
  emigYear:{pre1904:"Antes de 1904","1904_1913":"Entre 1904 y 1913",ns:"No se sabe",post1913:"Después de 1913",noemigro:"No emigró"},
  matrikel:{si:"Sí",no:"No",ns:"No sabe"}, natz1914:{usa:"Sí, en EE.UU.",otro:"Sí, en otro país",no:"No",ns:"No sabe"},
  persecution:{si:"Sí",no:"No",ns:"No sabe"}, natz25:{si:"Sí",no:"No",ns:"No sabe",si_apeticion:"Sí, a petición propia",noeu_apeticion:"Sí (fuera UE), a petición"},
  natz25_eu:{si:"Sí (UE/Suiza)",no:"No",ns:"No sabe"}, natz25_year:{antes:"Antes de 2024",desde2024:"En 2024 o después",ns:"No sabe"},
  natz25_permit:{si:"Sí, concedido",no:"No / no lo pidió",ns:"No sabe"}, natz25_when:{antes:"Antes del nacimiento del hijo/a",despues:"Después del nacimiento del hijo/a",ns:"Fue el solicitante / no sabe"},
  adoption:{si:"Sí",no:"No",ns:"No sabe"}, adoption_age:{menor:"Menor de edad",adulto:"Adulto",ns:"No sabe"},
  marriageloss:{si:"Sí",no:"No",ns:"No sabe"}, mil28:{si:"Sí",no:"No",ns:"No sabe"},
  namechange:{si:"Sí",no:"No",ns:"No sabe"}, relative:{si:"Sí",no:"No",ns:"No sabe"},
  lives:{si:"Sí",no:"No"}, hasGermanDoc:{si:"Sí",no:"No",ns:"No sabe"},
  germanDocType:{acta_nac:"Certificado de nacimiento alemán",doc_aleman:"Otro documento alemán",prueba_emig:"Prueba de emigración",otro:"Otro"}
};
function factVal(k,v){ if(v==null||v==="") return "—"; const m=FACT_VALUES[k]; return (m&&m[v]!=null)?m[v]:String(v); }
function wedLbl(v){ return {si:"Sí",no:"No",ns:"No sabe"}[v]||(v?String(v):"—"); }
function adAgeLbl(v){ return {menor:"Menor de edad",adulto:"Adulto/a",ns:"No sabe"}[v]||(v?String(v):"—"); }
function dlRow(label,value){ return `<tr><td style="padding:3px 14px 3px 0;color:#64748b;font-size:12.5px;vertical-align:top">${esc(label)}</td><td style="padding:3px 0;font-size:12.5px;font-weight:600">${esc(value)}</td></tr>`; }
function fullDataDumpHTML(ans){
  const facts=ans.facts||{}, chain=ans.chain||[], ap=ans.applicant||{};
  let rows=`<tr><td colspan="2" style="font-weight:700;font-size:12.5px;color:#1d4ed8;padding:6px 0 2px">Solicitante</td></tr>`;
  rows+=dlRow("Nombre",ap.name||"—")+dlRow("Año de nacimiento",ap.birthYear||"—")+dlRow("País de nacimiento",ap.country||"—");
  rows+=dlRow("¿Adoptado/a?",wedLbl(ap.adopted))+(ap.adopted==="si"?dlRow("Edad al ser adoptado/a",adAgeLbl(ap.adoptedAge)):"")+dlRow("¿Servicio militar extranjero (desde 2000)?",wedLbl(ap.military));
  chain.forEach((p,i)=>{
    rows+=`<tr><td colspan="2" style="font-weight:700;font-size:12.5px;color:#1d4ed8;padding:10px 0 2px">${esc(genL(i+1,p.rel))} — ${esc(p.name||"(sin nombre)")}</td></tr>`;
    rows+=dlRow("Relación",p.rel||"—")+dlRow("Año de nacimiento",p.birthYear||"—")+dlRow("País de nacimiento",p.country||"—");
    rows+=dlRow("¿Ciudadano alemán?",wedLbl(p.germanCitizen))+dlRow("¿Hijo/a dentro del matrimonio?",wedLbl(p.childInWedlock))+dlRow("Año de matrimonio",p.marriageYear||"—");
    rows+=dlRow("¿Adoptado/a?",wedLbl(p.adopted))+(p.adopted==="si"?dlRow("Edad al ser adoptado/a",adAgeLbl(p.adoptedAge)):"")+dlRow("¿Servicio militar extranjero (desde 2000)?",wedLbl(p.military));
  });
  const skip={notes:1};
  const keys=Object.keys(facts).filter(k=>!skip[k] && facts[k]!=null && facts[k]!=="");
  if(keys.length){
    rows+=`<tr><td colspan="2" style="font-weight:700;font-size:12.5px;color:#1d4ed8;padding:10px 0 2px">Respuestas clave</td></tr>`;
    keys.forEach(k=>{ rows+=dlRow(FACT_LABELS[k]||k, factVal(k,facts[k])); });
  }
  return `<h3 style="font-size:14px;margin:18px 0 6px">📋 Todos los datos ingresados</h3>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 13px">
      <table style="border-collapse:collapse;width:100%">${rows}</table>
    </div>`;
}

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
  let recibido = "";
  try { if (rec.created_at) recibido = new Date(rec.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }); } catch (e) {}

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

  const legalItems = sorted.filter(v => v.legal);
  const legalSection = legalItems.length
    ? `<div style="margin-top:22px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:12px;padding:14px 16px">
         <h3 style="font-size:14px;margin:0 0 4px;color:#3730a3">⚖️ Análisis técnico (uso interno — asesora)</h3>
         <p style="font-size:11.5px;color:#64748b;margin:0 0 10px">Fundamentación jurídica por vía, generada del caso. Verificar con la normativa vigente.</p>
         ${legalItems.map(v => { const s = ST[v.state] || ["#64748b","#f1f5f9", v.state];
           return `<div style="margin-bottom:11px"><div style="font-weight:700;font-size:13px;color:${s[0]}">${esc(v.name || v.via)} — ${s[2]}</div><div style="font-size:13px;color:#1e293b;margin-top:2px">${esc(v.legal)}</div></div>`; }).join("")}
       </div>`
    : "";

  const docItems = Array.isArray(ans.doc_suggestions) ? ans.doc_suggestions : [];
  const docHtml = docItems.length
    ? `<div style="margin-top:22px;border:1px solid #d1fae5;background:#f0fdf4;border-radius:12px;padding:14px 16px">
         <h3 style="font-size:14px;margin:0 0 8px;color:#065f46">📎 Documentación a adjuntar al borrador</h3>
         <ul style="margin:0;padding-left:18px;color:#134e4a;font-size:13px">${docItems.map(x=>`<li style="margin-bottom:5px">${esc(x)}</li>`).join("")}</ul>
         <p style="font-size:11.5px;color:#6b7280;margin:8px 0 0">Sugerencia orientativa — verificar disponibilidad según cada caso.</p>
       </div>`
    : "";

  let draftHtml = "";
  if (ans.consular_draft) {
    const cd = typeof ans.consular_draft === "string" ? { es: ans.consular_draft } : ans.consular_draft;
    const NM = { es: "Español", en: "English", pt: "Português" };
    draftHtml = `<h3 style="font-size:14px;margin:20px 0 6px">✉️ Borrador de consulta al Consulado (ES / EN / PT)</h3>` +
      Object.keys(cd).map(l => `<div style="margin-bottom:10px"><div style="font-size:11.5px;font-weight:700;color:#64748b">${NM[l] || l}</div><div style="font-size:12.5px;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;color:#334155">${esc(cd[l])}</div></div>`).join("");
  }

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
      <h2 style="margin:0 0 4px">🇩🇪 Nuevo lead — Nacionalidad Alemana</h2>
      <p style="color:#64748b;margin:0 0 16px;font-size:14px">Resultado preliminar: <b>${esc(top)}</b></p>

      <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
        <tr><td style="padding:3px 14px 3px 0;color:#64748b">Nombre</td><td><b>${esc(name)}</b></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        <tr><td style="padding:3px 14px 3px 0;color:#64748b">Teléfono</td><td>${esc(phone)}</td></tr>
        ${recibido ? `<tr><td style="padding:3px 14px 3px 0;color:#64748b">Recibido</td><td>${esc(recibido)} <span style="color:#94a3b8">(hora de Chile)</span></td></tr>` : ""}
      </table>

      <h3 style="font-size:14px;margin:0 0 8px">Árbol familiar</h3>
      <div style="display:flex;flex-direction:column;gap:0;margin-bottom:18px">${treeHTML(ans.applicant, ans.chain, markA)}</div>

      <h3 style="font-size:14px;margin:0 0 8px">Vías evaluadas</h3>
      ${viaCards || `<div style="color:#64748b;font-size:13px">Sin vías determinadas — requiere investigar más.</div>`}

      ${invList}
      ${notesHtml}
      ${fullDataDumpHTML(ans)}
      ${legalSection}
      ${docHtml}
      ${draftHtml}

      <p style="color:#94a3b8;font-size:11.5px;margin-top:22px;border-top:1px solid #e2e8f0;padding-top:12px">
        Orientación preliminar automática (no es asesoría jurídica). El detalle completo del árbol y las respuestas está en Supabase → Table Editor → <b>leads</b>.
      </p>
    </div>`;

  const FROM_LABEL = `Raíces Europeas - Nacionalidad Alemana <${FROM}>`;

  // Email a la asesora
  let ownerOk = false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_LABEL, to: [OWNER_EMAIL], subject: `Nuevo lead: ${name} — ${top}`, html })
    });
    ownerOk = r.ok;
    if (!r.ok) { const d = await r.text(); return res.status(502).json({ ok: false, resend: d }); }
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }

  // Email al cliente (la misma información que ve en pantalla)
  if (rec.email && rec.email !== "—") {
    const L = rec.lang || "es";
    const Tx = (es, en, pt) => L === "en" ? en : L === "pt" ? (pt || es) : es;
    const overall = verdict.some(v => v.state === "VIABLE") ? "VIABLE"
      : verdict.some(v => v.state === "DUDOSO") ? "DUDOSO"
      : verdict.some(v => v.state === "POCO") ? "POCO" : "INFO";
    const OV = {
      VIABLE: { color: "#15803d", bg: "#dcfce7", emoji: "🟢",
        title: Tx("Altamente posible", "Highly possible", "Muito provável"),
        desc:  Tx("Según tus respuestas, tu caso tiene buenas bases para avanzar con una consulta formal.", "Based on your answers, your case has solid grounds to move forward with a formal consultation.", "Com base nas suas respostas, o seu caso tem boas bases para avançar.") },
      DUDOSO: { color: "#b45309", bg: "#fef3c7", emoji: "🟡",
        title: Tx("Posible", "Possible", "Possível"),
        desc:  Tx("Tu caso es posible, pero hay puntos que conviene confirmar antes de avanzar.", "Your case is possible, but some points should be confirmed before moving forward.", "O seu caso é possível, mas há pontos a confirmar antes de avançar.") },
      POCO:   { color: "#b91c1c", bg: "#fee2e2", emoji: "🔴",
        title: Tx("Por ahora no calificas", "Not eligible for now", "Por enquanto não elegível"),
        desc:  Tx("Según la normativa alemana vigente, tu caso no calificaría por ahora. Si la legislación cambia, te avisaremos.", "Under current German law, your case would not qualify for now. If the law changes, we'll let you know.", "Segundo a legislação alemã vigente, o seu caso não se qualificaria por enquanto.") },
      INFO:   { color: "#1d4ed8", bg: "#dbeafe", emoji: "🔵",
        title: Tx("Necesitamos más información", "More information needed", "Precisamos de mais informações"),
        desc:  Tx("Para evaluarte mejor necesitamos algunos datos adicionales. Nos pondremos en contacto contigo.", "To assess you better we need a bit more data. We'll reach out to you.", "Para avaliar melhor o seu caso, precisamos de mais dados. Entraremos em contato.") }
    };
    const ov = OV[overall];

    const clientTreeRows = [{p: ans.applicant, rel: null}].concat((ans.chain || []).map(x => ({p: x, rel: x.rel})));
    const clientTree = clientTreeRows.map((row, idx) => {
      const p = row.p || {}; const isDE = isGermanC(p);
      const bd = isDE ? "#15803d" : "#e2e8f0"; const bg = isDE ? "#dcfce7" : "#fff";
      const tag = isDE ? `<span style="background:#15803d;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px">🇩🇪 ${Tx("raíz alemana","German root","raiz alemã")}</span>` : "";
      const gen = idx === 0 ? Tx("Tú","You","Você") : genL(idx, row.rel);
      const meta = [p.birthYear, p.country].filter(Boolean).join(" · ");
      const conn = idx < clientTreeRows.length - 1 ? `<div style="width:2px;height:14px;background:#e2e8f0;margin-left:34px"></div>` : "";
      return `<div style="display:flex;gap:12px;align-items:flex-start;border:1.5px solid ${bd};background:${bg};border-radius:12px;padding:9px 12px">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;min-width:66px;padding-top:2px">${esc(gen)}</div>
          <div><div style="font-weight:700;font-size:14px">${esc(p.name || "(—)")}</div>${meta ? `<div style="color:#64748b;font-size:12px">${esc(meta)}</div>` : ""}${tag ? `<div style="margin-top:5px">${tag}</div>` : ""}</div>
        </div>${conn}`;
    }).join("");

    const clientChecklist = investigate.length
      ? `<h3 style="font-size:14px;margin:18px 0 6px">${Tx("Para avanzar, conviene reunir","To move forward, gather","Para avançar, convém reunir")}</h3>
         <ul style="margin:0;padding-left:18px;color:#334155;font-size:13px">${investigate.map(x => `<li style="margin-bottom:4px">${esc(x)}</li>`).join("")}</ul>`
      : "";

    const closing = overall === "POCO"
      ? Tx("Guardamos tu contacto. Si la legislación alemana cambia o encontramos una vía aplicable, te avisaremos.", "We'll keep your contact. If German law changes or we find an applicable route, we'll let you know.", "Guardamos o seu contato. Se a legislação alemã mudar, avisaremos.")
      : Tx("Nos pondremos en contacto contigo para un análisis más detallado y personalizado.", "We'll contact you for a more detailed and personalized analysis.", "Entraremos em contato para uma análise mais detalhada e personalizada.");

    const clientSubject = Tx(`Tu evaluación de nacionalidad alemana — ${ov.title}`, `Your German nationality assessment — ${ov.title}`, `Sua avaliação de nacionalidade alemã — ${ov.title}`);
    const clientHtml = `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:580px;margin:0 auto;color:#1e293b">
        <h2 style="margin:0 0 16px">🇩🇪 ${Tx("Tu evaluación preliminar","Your preliminary assessment","Sua avaliação preliminar")}</h2>
        <div style="border:1.5px solid ${ov.color};background:${ov.bg};border-radius:14px;padding:20px 18px;text-align:center;margin-bottom:20px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${ov.color};opacity:.85">${Tx("Resultado preliminar","Preliminary result","Resultado preliminar")}</div>
          <div style="font-size:22px;font-weight:800;margin:6px 0;color:${ov.color}">${ov.emoji} ${ov.title}</div>
          <div style="font-size:14.5px;color:#334155">${ov.desc}</div>
        </div>
        <h3 style="font-size:14px;margin:0 0 8px">${Tx("Tu árbol familiar","Your family tree","Sua árvore familiar")}</h3>
        <div style="display:flex;flex-direction:column;gap:0;margin-bottom:18px">${clientTree}</div>
        ${clientChecklist}
        <p style="font-size:14px;color:#334155;margin-top:20px">${closing}</p>
        <p style="font-size:13px;color:#64748b;margin-top:4px">${Tx("Cualquier consulta, responde este correo.","Reply to this email with any questions.","Qualquer dúvida, responda este e-mail.")}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:11.5px;color:#94a3b8">Raíces Europeas · ${Tx("Evaluación orientativa, no constituye asesoría jurídica formal.","Preliminary assessment, not formal legal advice.","Avaliação orientativa, não constitui assessoria jurídica formal.")}</p>
      </div>`;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_LABEL, to: [rec.email], subject: clientSubject, html: clientHtml })
      });
    } catch (e) { /* no bloquear si falla el email al cliente */ }
  }

  return res.status(200).json({ ok: true, resend: "sent" });
};
