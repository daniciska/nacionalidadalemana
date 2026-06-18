# Guía de despliegue — Cuestionario de nacionalidad alemana

App de una sola página (`index.html`) + base de datos de leads en **Supabase**. Sin servidor, sin programar. Tiempo estimado: **20–30 min**.

---

## Qué hace
- Cuestionario dinámico bilingüe (ES/EN) que evalúa las vías de nacionalidad alemana.
- Pide **nombre + email/WhatsApp ANTES** de mostrar el resultado → captura el lead.
- Guarda **cada cuestionario** (respuestas + veredicto + contacto) en tu base de datos.
- Funciona en **modo demo** (guarda en el navegador) hasta que conectes Supabase.

---

## Paso 1 · Crear la base de datos (Supabase)
1. Entra en **https://supabase.com** → *Start your project* → crea una cuenta (gratis).
2. *New project* → ponle nombre (ej. `nacionalidad-alemana`) y una contraseña de BD. Espera ~2 min.
3. Menú izquierdo → **SQL Editor** → *New query*.
4. Copia y pega TODO el contenido de `supabase_schema.sql` y pulsa **Run**.
   - Debe decir *Success*. Ya tienes la tabla `leads`.

## Paso 2 · Obtener tus credenciales
1. Menú izquierdo → **Project Settings** (engranaje) → **API**.
2. Copia dos valores:
   - **Project URL** → algo como `https://abcdxyz.supabase.co`
   - **anon public** (en *Project API keys*) → una cadena larga que empieza por `eyJ...`

> La clave `anon public` es segura para poner en la web: con el RLS del Paso 1, **solo puede insertar**, no leer.

## Paso 3 · Conectar la app
1. Abre `index.html` con un editor de texto (Bloc de notas, VS Code…).
2. Arriba del `<script>` busca el bloque `CONFIG` y pega tus valores:
   ```js
   const CONFIG = {
     SUPABASE_URL: "https://abcdxyz.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi....(tu clave anon)"
   };
   ```
3. Guarda el archivo.

## Paso 4 · Publicar la web (elige una)
**Opción fácil (recomendada) — Netlify Drop:**
1. Ve a **https://app.netlify.com/drop**.
2. Arrastra la carpeta `webapp` (o el archivo `index.html`) a la página.
3. En segundos te da una URL pública (ej. `https://tu-sitio.netlify.app`). ¡Listo!

**Alternativas:** Vercel, Cloudflare Pages, GitHub Pages — todas gratis y por arrastrar/subir.
Para usar tu propio dominio (ej. `evaluacion.tudespacho.com`), conéctalo desde el panel de Netlify/Vercel.

## Paso 5 · Ver tus leads
- En Supabase → **Table Editor** → tabla `leads`: cada fila es un cuestionario completado.
- O usa la vista `leads_resumen` (Table Editor → *leads_resumen*) para ver estado y contacto de un vistazo.
- Para recontactar: filtra por `verdict` con estados *Viable* o *Dudoso* (tus mejores prospectos).

---

## Personalización rápida
| Quieres cambiar… | Dónde |
|---|---|
| Textos de preguntas/opciones | array `STEPS` en `index.html` (cada entrada tiene `["valor","Español","English"]`) |
| Nombre/branding | `<div class="logo">` y la variable `brandName` |
| Colores | bloque `:root{ }` al inicio del `<style>` |
| Campos de contacto | paso `contact` en `STEPS` y función `render()` |
| Lógica de veredicto | función `computeResults()` |

## Notas importantes
- **No es asesoría legal:** el aviso ya aparece al pie en cada pantalla. Mantenlo.
- **Privacidad:** la app ya incluye una **casilla de consentimiento obligatoria** (Ley 19.628 Chile / RGPD UE) antes de mostrar el resultado, y guarda el consentimiento con su fecha en `answers.consent` / `answers.consent_at`. Si tienes una política de privacidad formal, enlázala en el texto de la casilla (en `index.html`, pantalla `contact`).
- **Exportar leads:** Supabase → Table Editor → `leads` → *Export to CSV*.
- El motor de esta app es una **versión MVP** fiel a la lógica del `tree.json`, pero simplificada (no recorre cadenas genealógicas de longitud arbitraria). Para casos complejos, deriva a revisión profesional — que es justo el momento de captar al cliente.
