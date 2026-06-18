-- ============================================================
-- Esquema Supabase para el cuestionario de nacionalidad alemana
-- Ejecuta esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  session_id  text,                       -- agrupa el "parcial" y el "completo" del mismo visitante
  status      text not null default 'completo',  -- 'parcial' (dejó el correo) | 'completo' (terminó)
  lang        text,
  scope       text,
  name        text,
  email       text,
  phone       text,
  answers     jsonb,        -- todas las respuestas del cuestionario
  verdict     jsonb         -- vías evaluadas y su estado (viable/dudoso/...)
);

-- Si la tabla YA existía, agrega las columnas nuevas (no rompe nada):
alter table public.leads add column if not exists session_id text;
alter table public.leads add column if not exists status text not null default 'completo';

-- Índices útiles para tu panel de leads
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_email_idx   on public.leads (email);
create index if not exists leads_session_idx on public.leads (session_id);

-- Seguridad a nivel de fila (RLS)
alter table public.leads enable row level security;

-- Permite que la web (clave anon) SOLO inserte; nadie puede leer con la clave anon.
-- Tú lees los leads desde el panel de Supabase (Table editor), que usa la clave de servicio.
drop policy if exists "anon_insert_only" on public.leads;
create policy "anon_insert_only"
  on public.leads
  for insert
  to anon
  with check (true);

-- (Opcional) Vista rápida para tu panel: casos viables o dudosos primero.
create or replace view public.leads_resumen as
select
  id, created_at, status, name, email, phone, lang,
  verdict,
  (select string_agg(v->>'state', ', ') from jsonb_array_elements(verdict) v) as estados
from public.leads
order by created_at desc;

-- Vista de SEGUIMIENTO: muestra los completados + los abandonos reales
-- (parciales cuyo visitante nunca terminó), sin duplicados.
create or replace view public.leads_seguimiento as
select l.*
from public.leads l
where l.status = 'completo'
   or (l.status = 'parcial'
       and not exists (
         select 1 from public.leads c
         where c.session_id = l.session_id and c.status = 'completo'))
order by l.created_at desc;
