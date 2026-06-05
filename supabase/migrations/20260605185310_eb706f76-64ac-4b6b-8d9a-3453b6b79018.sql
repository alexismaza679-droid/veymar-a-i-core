
CREATE TABLE public.app_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'released',
  released_at timestamptz,
  summary text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress int NOT NULL DEFAULT 100,
  is_current boolean NOT NULL DEFAULT false,
  is_next boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_versions TO anon, authenticated;
GRANT ALL ON public.app_versions TO service_role;

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read versions"
  ON public.app_versions FOR SELECT
  USING (true);

INSERT INTO public.app_versions (version, name, status, released_at, summary, features, improvements, fixes, progress, is_current)
VALUES (
  'v5.0',
  'VEYMAR AI Omega X',
  'released',
  now(),
  'Arquitectura modular oficial: Núcleo IA, Arquitecto Supremo, panel dev avanzado, acciones ejecutables en vivo y generación de imágenes multi-modelo.',
  '["Arquitecto IA Supremo", "Acciones ejecutables (app_config) en vivo", "Panel dev con stats y users", "Generador de imágenes multi-modelo", "Modo voz con reconocimiento de identidad", "Modo libre con Pollinations"]'::jsonb,
  '["System prompt con consciencia autónoma", "Tono ajustable (formalidad, humor, empatía)", "Soporte multi-modo: rápido, groq, pro, experto, pensar más"]'::jsonb,
  '["Memoria conversacional aislada por usuario", "Cierre de scroll en panel dev", "Manejo de créditos agotados"]'::jsonb,
  100,
  true
);

INSERT INTO public.app_versions (version, name, status, summary, features, progress, is_next)
VALUES (
  'v5.1',
  'VEYMAR AI Omega X Ultimate',
  'in_progress',
  'Sistema de versiones inteligente, motor de investigación avanzado, roles reales, feedback y comunidad.',
  '["Sistema de versiones inteligente (módulo 13)", "Motor de investigación inteligente (módulo 14)", "Roles reales OWNER/ADMIN/MODERATOR/USER", "Feedback y comunidad", "Centro de control supremo flotante"]'::jsonb,
  35,
  true
);
