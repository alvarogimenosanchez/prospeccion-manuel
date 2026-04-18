-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: mensajes_internos + recursos_rapidos
-- Fecha: 2026-04-18
-- Descripción: Mensajería interna entre comerciales y panel de acceso rápido
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. mensajes_internos ─────────────────────────────────────────────────────
-- Canal de mensajes entre comerciales del equipo.
-- para_comercial_id = NULL → mensaje para todos (broadcast al canal "Todos")
-- adjunto_lead_id → opcional, para adjuntar contexto de un lead

CREATE TABLE IF NOT EXISTS mensajes_internos (
  id              uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  de_comercial_id uuid        NOT NULL REFERENCES comerciales(id) ON DELETE CASCADE,
  para_comercial_id uuid      REFERENCES comerciales(id) ON DELETE SET NULL,  -- NULL = broadcast
  mensaje         text        NOT NULL,
  tipo            text        NOT NULL DEFAULT 'texto'
                              CHECK (tipo IN ('texto', 'alerta', 'nota_lead')),
  leido_por       uuid[]      NOT NULL DEFAULT '{}',   -- array de comercial IDs que lo han leído
  adjunto_lead_id uuid        REFERENCES leads(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Índices para las queries más frecuentes
CREATE INDEX IF NOT EXISTS idx_mensajes_internos_para
  ON mensajes_internos (para_comercial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensajes_internos_de
  ON mensajes_internos (de_comercial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensajes_internos_broadcast
  ON mensajes_internos (created_at DESC)
  WHERE para_comercial_id IS NULL;

-- RLS: cada comercial solo ve sus mensajes + los broadcasts
ALTER TABLE mensajes_internos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comercial_puede_ver_sus_mensajes"
  ON mensajes_internos FOR SELECT
  USING (
    de_comercial_id IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
    OR para_comercial_id IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
    OR para_comercial_id IS NULL  -- broadcasts visibles para todos
  );

CREATE POLICY "comercial_puede_enviar_mensajes"
  ON mensajes_internos FOR INSERT
  WITH CHECK (
    de_comercial_id IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
  );

CREATE POLICY "comercial_puede_marcar_leido"
  ON mensajes_internos FOR UPDATE
  USING (
    para_comercial_id IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
    OR para_comercial_id IS NULL
  )
  WITH CHECK (true);


-- ── 2. recursos_rapidos ──────────────────────────────────────────────────────
-- Panel de acceso rápido: scripts, argumentarios, links, plantillas WA, etc.
-- es_global = true → visible para todo el equipo
-- es_global = false → solo para el comercial que lo creó

CREATE TABLE IF NOT EXISTS recursos_rapidos (
  id           uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  titulo       text        NOT NULL,
  tipo         text        NOT NULL
                           CHECK (tipo IN ('script', 'argumentario', 'link', 'plantilla_wa', 'documento', 'otro')),
  contenido    text        NOT NULL,   -- texto, URL, o markdown
  descripcion  text,
  categoria    text,                   -- libre: "Producto Vida", "Objeciones", "Cierre", etc.
  creado_por   uuid        NOT NULL REFERENCES comerciales(id) ON DELETE CASCADE,
  es_global    boolean     NOT NULL DEFAULT true,
  orden        integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recursos_rapidos_tipo
  ON recursos_rapidos (tipo, orden);
CREATE INDEX IF NOT EXISTS idx_recursos_rapidos_categoria
  ON recursos_rapidos (categoria, orden)
  WHERE categoria IS NOT NULL;

ALTER TABLE recursos_rapidos ENABLE ROW LEVEL SECURITY;

-- Lectura: recursos globales + propios
CREATE POLICY "comercial_puede_ver_recursos"
  ON recursos_rapidos FOR SELECT
  USING (
    es_global = true
    OR creado_por IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
  );

-- Escritura: solo propios
CREATE POLICY "comercial_puede_crear_recursos"
  ON recursos_rapidos FOR INSERT
  WITH CHECK (
    creado_por IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
  );

CREATE POLICY "comercial_puede_editar_sus_recursos"
  ON recursos_rapidos FOR UPDATE
  USING (
    creado_por IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
  );

CREATE POLICY "comercial_puede_borrar_sus_recursos"
  ON recursos_rapidos FOR DELETE
  USING (
    creado_por IN (SELECT id FROM comerciales WHERE user_id = auth.uid())
  );


-- ── 3. Trigger updated_at en recursos_rapidos ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recursos_rapidos_updated_at ON recursos_rapidos;
CREATE TRIGGER recursos_rapidos_updated_at
  BEFORE UPDATE ON recursos_rapidos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
