# CLAUDE.md — Proyecto: Cuestionario de Nacionalidad Alemana

## Contexto general

Aplicación web para capturar leads (potenciales clientes) de una **asesora legal chilena** especializada en ciudadanía alemana por ascendencia. El cuestionario dinámico evalúa el caso de cada usuario, genera un veredicto preliminar, y registra el lead en una base de datos para que la asesora haga seguimiento.

**Idiomas del sistema**: español (ES), inglés (EN), portugués (PT) — el usuario elige al inicio.  
**Idioma de esta base de código y comentarios**: español.  
**Asesora**: habla español; los textos del panel y emails son en español.

---

## Stack técnico

| Componente | Tecnología |
|---|---|
| Frontend | SPA en HTML/JS estático (`webapp/index.html`) |
| Hosting | Vercel (auto-deploy desde GitHub) |
| Base de datos | Supabase (Postgres + RLS) |
| Funciones serverless | Vercel (`webapp/api/`) |
| Email | Resend API |
| Anti-spam | Cloudflare Turnstile (captcha) |
| Repositorio | https://github.com/daniciska/nacionalidadalemana |
| URL producción | https://nacionalidadalemana.vercel.app/ |

### Variables de entorno (Vercel)
- `SUPABASE_URL` → `https://tosqlwepfsotlyzyinyr.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` → clave secreta service_role (no exponer al cliente)
- `TURNSTILE_SECRET` → clave secreta del widget Cloudflare
- `SESSION_SECRET` → cadena aleatoria para firmar el pase de sesión HMAC
- `RESEND_API_KEY` → clave Resend
- `OWNER_EMAIL` → email de la asesora (destino de notificaciones)
- `FROM_EMAIL` → opcional; por defecto `onboarding@resend.dev`
- `WEBHOOK_SECRET` → opcional; valida el webhook de Supabase

### Configuración en index.html (`CONFIG`)
```js
const CONFIG = {
  SUPABASE_URL: "https://tosqlwepfsotlyzyinyr.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",   // fallback directo (transición)
  TURNSTILE_SITEKEY: "0x4AAAAAADnaUBCSdYce1EBp"
};
```

---

## Archivos clave

```
webapp/
├── index.html          # App principal (SPA) — más editado
├── panel.html          # Panel de administración para la asesora
├── api/
│   ├── lead.js         # POST /api/lead — verifica captcha, inserta en Supabase
│   ├── leads.js        # GET/DELETE /api/leads — panel admin (password protegido)
│   └── notify.js       # POST webhook de Supabase → envía email por Resend
├── supabase_schema.sql # Schema, vistas y políticas RLS
├── casos_regresion.js  # Suite de regresión (34 casos), correr con: node casos_regresion.js
└── CLAUDE.md           # Este archivo
```

---

## Arquitectura del cuestionario (`index.html`)

### Flujo de estado
- Todo el estado vive en el objeto global `state`
- `render()` → renderiza la pantalla actual según `state.step`
- `advance()` → avanza al siguiente paso y llama `render()`
- El cuestionario construye el árbol familiar primero (con nombres reales), luego hace preguntas ancladas a cada persona

### Funciones principales
| Función | Rol |
|---|---|
| `analyze()` | Motor legal: lee `state.facts` y `state.chain`, retorna `{vias, investigate}` |
| `buildConsularDrafts(vias)` | Genera borrador ES/EN/PT para enviar al Consulado |
| `buildDocSuggestions(facts, chain, verdict)` | Lista de documentos a adjuntar según el caso |
| `pushLead(status, vias, checklist)` | Guarda el lead: primero `/api/lead`, luego fallback Supabase directo |
| `renderResult()` | Muestra el veredicto al usuario y llama `pushLead("completo")` |
| `familyTree()` | Renderiza el árbol familiar visual |

### Objeto `state`
```js
state = {
  step: 0,
  sessionId: "uuid",
  sessionPass: "hmac-pass",  // devuelto por /api/lead en el guardado parcial
  partialSaved: false,
  applicant: { name, birthYear, country },
  chain: [{ name, birthYear, country, rel, germanCitizen, ... }],
  facts: { emigYear, persecution, natz25, marriageloss, ... },
  contact: { name, email, phone, consent, turnstileToken },
  lang: "es"
}
```

### Flujo de guardado (doble)
1. Al capturar email (mitad del cuestionario): `pushLead("parcial")` → verifica captcha → guarda → devuelve pase HMAC
2. Al finalizar: `pushLead("completo")` → verifica pase HMAC → guarda con veredicto completo

---

## Derecho alemán de nacionalidad — lógica implementada

### Vías (en orden de evaluación)

| Clave | Nombre | Base legal |
|---|---|---|
| `B` | Restitución por persecución nazi | Art. 116(2) GG / §15 StAG |
| `C` | Declaración por discriminación | §5 StAG (20.8.2021–19.8.2031) |
| `A` | Transmisión por descendencia | §4 StAG / RuStAG 1913 / Ley 1870 |

### Causas de pérdida de la nacionalidad alemana (afectan vía A)

| Causa | Condición | Norma |
|---|---|---|
| Emigración sin Matrikel | Emigró entre 1.1.1871 y 1.1.1914 sin inscripción consular | §21 Ley 1.6.1870 / RuStAG 1913 |
| Naturalización voluntaria | Se naturalizó en otro país (hasta 26.6.2024) | §25 StAG |
| Excepción EU/CH | Naturalización en país EU o Suiza desde 28.8.2007 | §25 StAG (reforma) |
| Beibehaltungsgenehmigung | Tenía permiso de retención previo a naturalizarse | §25 StAG |
| Pérdida por matrimonio | Mujer alemana casada con extranjero antes de 1.4.1953 | §17 nº6 RuStAG |
| Exclusión de hijos ilegítimos | Hijo no matrimonial de padre alemán antes de 1.7.1993 | RuStAG / StAG |
| Exclusión de hijos de madre | Hijo de madre alemana nacido antes de 1.1.1975 | RuStAG |
| Servicio militar extranjero | Desde 2000 | §28 StAG |
| Pérdida por adopción | Menor adoptado por extranjero desde 1977 | §6 StAG |

### Fechas críticas
- `1.1.1871` — entra en vigor la Ley de 1870 (Matrikel obligatoria)
- `1.1.1914` — entra en vigor RuStAG 1913 (el §21 Matrikel ya no aplica)
- `1.1.1975` — primer año en que la madre podía transmitir nacionalidad
- `1.7.1993` — primer año en que padre no matrimonial podía transmitir
- `1.4.1953` — desde esta fecha el matrimonio ya no hacía perder la nacionalidad
- `20.8.2021` — inicio de la ventana §5 (discriminación/legitimidad)
- `19.8.2031` — fin de la ventana §5
- `28.8.2007` — excepción EU/CH en §25
- `26.6.2024` — §25 derogado (doble ciudadanía permitida en Alemania)

### Opciones de `emigYear` (valor de `facts.emigYear`)
- `"pre1904"` → emigró antes de 1904 (dentro del período Matrikel pero tan temprano que es poco probable que haya registro)
- `"1904_1913"` → emigró entre 1904 y 1913 (período Matrikel activo, registros más probables en invenio)
- `"ns"` → no se sabe cuándo emigró
- `"post1913"` → emigró después del 1.1.1914 (RuStAG 1913, el §21 Matrikel ya no aplica)
- `"noemigro"` → no emigró, nació fuera de Alemania o ya era descendiente lejano

**Importante**: los valores del DOM/facts son `"pre1904"`, `"1904_1913"`, `"ns"` — NO `"pre1914"`.

---

## Panel de administración (`panel.html`)

- Acceso con contraseña (header `x-admin-password`) vía `/api/leads`
- Lee la vista `leads_seguimiento` (completados + abandonos reales sin duplicar)
- Muestra por lead: árbol familiar, vías evaluadas (color VIABLE/DUDOSO/POCO/INFO), qué averiguar, nota del solicitante, análisis técnico legal, borrador al consulado (3 idiomas con tabs), documentación sugerida
- Para leads **antiguos** (sin `consular_draft` guardado): `buildDraftFromData(a,v)` genera el borrador al vuelo
- `fmtCL(ts)` → formatea fecha en hora de Chile (`America/Santiago`)
- `copyEl(btn)` → copia el texto del elemento anterior al portapapeles

---

## Email de notificación (`api/notify.js`)

Se dispara por webhook de Supabase al insertar una fila en `leads`.  
**No envía** si `status === "parcial"`.

Secciones del email (en orden):
1. Nombre, email, teléfono, hora de recepción (hora Chile)
2. Árbol familiar visual
3. Vías evaluadas (cards con color)
4. Qué conviene averiguar
5. Nota del solicitante
6. Análisis técnico legal (uso interno)
7. **📎 Documentación a adjuntar** (según el caso)
8. **✉️ Borrador para el Consulado** (ES / EN / PT)

---

## Borrador al Consulado (`buildConsularDrafts`)

Genera un texto formal en 3 idiomas. La ruta elegida (`B`/`C`/`A`/`X`) determina el párrafo central (restitución nazi / §5 discriminación / §4 descendencia / sin ruta clara).

### Cierre estándar (todas las vías, todos los idiomas)
```
[párrafo de la ruta]

Agradecería que me indicaran si mi caso podría calificar y, en tal caso,
cómo iniciar el procedimiento de determinación de la nacionalidad alemana
y qué documentos debo presentar.

Quedo atento/a a su respuesta.

Muchas gracias.

Atentamente,
[Nombre del solicitante]
```
EN: "Sincerely," / PT: "Atenciosamente,"

El borrador existe en `index.html` (`buildConsularDrafts`) y en `panel.html` (`buildDraftFromData`) — ambos deben mantenerse sincronizados.

---

## Documentación sugerida (`buildDocSuggestions`)

Función en `index.html`. Genera lista de documentos específicos según los `facts` del caso.

**Siempre incluye:**
- Partidas de nacimiento de toda la línea
- Actas de matrimonio de los eslabones
- Prueba de nacionalidad alemana del antepasado (Standesamt del lugar de nacimiento)

**Condicionales:**
- `persecution === "si"` → Arolsen Archives, Yad Vashem, Wiedergutmachung, registros comunidad judía
- `emigYear ∈ {pre1904, 1904_1913, ns}` → Matrikel en invenio (politisches-archiv.diplo.de/invenio), listas de pasajeros Hamburgo/Bremen
- Naturalización (§25) → certificado de naturalización con fecha
- Pérdida por matrimonio → acta de matrimonio de la mujer alemana
- Adopción → sentencia de adopción con fecha y edad
- Familiar con ciudadanía ya obtenida → copia de su expediente

Los documentos se guardan en `answers.doc_suggestions` (array de strings) en Supabase.

---

## Base de datos (Supabase)

### Tabla `leads`
```sql
id          uuid PK
created_at  timestamptz
session_id  text          -- agrupa parcial + completo del mismo visitante
status      text          -- 'parcial' | 'completo'
lang        text
name        text
email       text
phone       text
answers     jsonb         -- { applicant, chain, facts, investigate, consular_draft, doc_suggestions, ... }
verdict     jsonb         -- [ { via, name, state, msg, mark, legal } ]
```

### Vistas
- `leads_resumen` — todos los leads, estados resumidos
- `leads_seguimiento` — completados + abandonos reales (sin duplicar parcial+completo del mismo visitante), con `fecha_chile`

### RLS
La política `anon_insert_only` fue **eliminada en producción**. Toda inserción pasa por `/api/lead` (serverless con service_role key). El fallback de inserción directa en `pushLead` es solo para transición/demo.

---

## Suite de regresión

```bash
node casos_regresion.js
```

34 casos que cubren todas las vías, combinaciones de pérdida, fechas límite y casos borde. Correr siempre antes de hacer push. Resultado esperado: `34/34 OK`.

El harness extrae el `<script>` de `index.html` con `eval()` y stub de `document`/`localStorage`/`fetch`/`window`.

**Importante para el harness**: cualquier código que use `window.X = ...` en el scope global debe estar protegido con `if(typeof window !== "undefined")`.

---

## Convenciones de commits

- Sin línea `Co-Authored-By:` — commits limpios, solo el mensaje
- Mensajes en español, descriptivos
- Hacer push siempre a `main` en https://github.com/daniciska/nacionalidadalemana (Vercel auto-deploya)

---

## Decisiones de diseño importantes

1. **Veredicto simple para el cliente**: el cliente ve UN veredicto (el mejor) con texto amable. La asesora ve el análisis completo por vía en el panel y email.
2. **Negativo firme**: si el resultado es negativo, no se deja abierto. Se dice "Por ahora las leyes actuales no consideran tu caso" (no "no califica nunca").
3. **Árbol primero, preguntas después**: el cuestionario construye el árbol familiar con nombres reales antes de hacer preguntas legales. Así las preguntas están ancladas a personas reales ("¿Tu abuelo Heinz tenía...?").
4. **Sin marcador de corte para el cliente**: el árbol del cliente NO muestra el marcador rojo de dónde se corta la línea. Ese marcador es solo para la asesora.
5. **Hora chilena**: fechas de leads en `America/Santiago` (panel y email).
6. **Teléfonos**: se limpian de espacios y caracteres no numéricos.
7. **Sin términos alemanes en el borrador**: el borrador al consulado es formal pero sin tecnicismos en alemán (excepto los artículos legales que son necesarios).

---

## Recursos externos relevantes

- Consulado alemán Santiago: https://santiago.diplo.de/cl-es/service/2635750-2635750 (requisitos)
- Pérdidas de nacionalidad: https://santiago.diplo.de/cl-es/service/2635754-2635754
- Matrículas consulares (invenio): https://politisches-archiv.diplo.de/invenio (grupo AB 2, por país/consulado)
- Arolsen Archives: https://arolsen-archives.org
- Yad Vashem: https://yadvashem.org
