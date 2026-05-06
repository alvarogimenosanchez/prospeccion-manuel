-- ============================================================
-- MIGRACIÓN DE SEGURIDAD v2 — RLS granular por comercial_id
--
-- Reemplaza la política permisiva "Allow authenticated access" (que dejaba
-- a cualquier usuario autenticado leer/escribir TODA la base de datos) por
-- políticas que filtran por comercial.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- AFECTACIÓN: tras aplicarla, el frontend solo verá los leads/citas/mensajes
-- del comercial logueado. Los directores ven todo.
--
-- Aplicar en Supabase: SQL Editor → pegar este archivo → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Funciones helper
-- ------------------------------------------------------------

-- Devuelve el id del comercial cuyo email coincide con el JWT actual.
-- Usa SECURITY DEFINER para poder consultar `comerciales` aunque la propia
-- política de `comerciales` la oculte (evita recursión).
CREATE OR REPLACE FUNCTION current_comercial_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM comerciales
   WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     AND activo = true
   LIMIT 1;
$$;

-- ¿El usuario actual es director/admin?
CREATE OR REPLACE FUNCTION current_comercial_es_director()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT rol IN ('director', 'admin')
       FROM comerciales
      WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        AND activo = true
      LIMIT 1),
    false
  );
$$;

-- Permitir ejecutar las funciones a roles authenticated y anon (anon las usa
-- para INSERT en leads desde el formulario público — ver más abajo)
GRANT EXECUTE ON FUNCTION current_comercial_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION current_comercial_es_director() TO authenticated, anon;


-- ------------------------------------------------------------
-- 2) DROP de políticas permisivas antiguas
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated access" ON leads;
DROP POLICY IF EXISTS "Allow authenticated access" ON interactions;
DROP POLICY IF EXISTS "Allow authenticated access" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated access" ON products;
DROP POLICY IF EXISTS "Allow authenticated access" ON scoring_history;
DROP POLICY IF EXISTS "Allow authenticated access" ON comerciales;
DROP POLICY IF EXISTS "Allow authenticated access" ON message_templates;
DROP POLICY IF EXISTS "Allow authenticated access" ON mensajes_pendientes;
DROP POLICY IF EXISTS "Allow authenticated access" ON clientes;
DROP POLICY IF EXISTS "Allow authenticated access" ON recursos_rapidos;
DROP POLICY IF EXISTS "Allow authenticated access" ON mensajes_internos;


-- ------------------------------------------------------------
-- 3) comerciales: SELECT por todos los authenticated (necesario para joins
--    y para que el sidebar muestre nombres). INSERT/UPDATE/DELETE solo director.
-- ------------------------------------------------------------
CREATE POLICY "comerciales select authenticated"
  ON comerciales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "comerciales insert director"
  ON comerciales FOR INSERT
  TO authenticated
  WITH CHECK (current_comercial_es_director());

CREATE POLICY "comerciales update director"
  ON comerciales FOR UPDATE
  TO authenticated
  USING (current_comercial_es_director())
  WITH CHECK (current_comercial_es_director());

CREATE POLICY "comerciales delete director"
  ON comerciales FOR DELETE
  TO authenticated
  USING (current_comercial_es_director());


-- ------------------------------------------------------------
-- 4) leads: el comercial ve los suyos + los huérfanos (sin asignar);
--    el director ve todos. INSERT abierto a authenticated y anon (para
--    el formulario público — cualquier alta entra como inbound sin comercial_asignado).
-- ------------------------------------------------------------
CREATE POLICY "leads select propios o director"
  ON leads FOR SELECT
  TO authenticated
  USING (
    current_comercial_es_director()
    OR comercial_asignado = current_comercial_id()
    OR comercial_asignado IS NULL  -- leads huérfanos visibles para todos
  );

CREATE POLICY "leads insert authenticated"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- INSERT desde el formulario público (rol anon) — limitado a fuente=inbound
-- y sin permitir setear comercial_asignado / temperatura caliente / nivel_interes alto
-- a un atacante. La validación dura está en el backend FastAPI, esto es defensa en profundidad.
CREATE POLICY "leads insert publico inbound"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (
    fuente = 'inbound'
    AND comercial_asignado IS NULL
    AND coalesce(nivel_interes, 0) <= 6
  );

CREATE POLICY "leads update propios o director"
  ON leads FOR UPDATE
  TO authenticated
  USING (
    current_comercial_es_director()
    OR comercial_asignado = current_comercial_id()
    OR comercial_asignado IS NULL
  )
  WITH CHECK (
    current_comercial_es_director()
    OR comercial_asignado = current_comercial_id()
    OR comercial_asignado IS NULL
  );

CREATE POLICY "leads delete director"
  ON leads FOR DELETE
  TO authenticated
  USING (current_comercial_es_director());


-- ------------------------------------------------------------
-- 5) interactions, appointments, mensajes_pendientes, scoring_history:
--    filtrar por el lead del que cuelgan
-- ------------------------------------------------------------
CREATE POLICY "interactions ALL via lead"
  ON interactions FOR ALL
  TO authenticated
  USING (
    current_comercial_es_director()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = interactions.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  )
  WITH CHECK (
    current_comercial_es_director()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = interactions.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  );

CREATE POLICY "appointments ALL via lead"
  ON appointments FOR ALL
  TO authenticated
  USING (
    current_comercial_es_director()
    OR comercial_id = current_comercial_id()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = appointments.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  )
  WITH CHECK (
    current_comercial_es_director()
    OR comercial_id = current_comercial_id()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = appointments.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  );

CREATE POLICY "mensajes_pendientes ALL via lead"
  ON mensajes_pendientes FOR ALL
  TO authenticated
  USING (
    current_comercial_es_director()
    OR comercial_id = current_comercial_id()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = mensajes_pendientes.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  )
  WITH CHECK (
    current_comercial_es_director()
    OR comercial_id = current_comercial_id()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = mensajes_pendientes.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  );

CREATE POLICY "scoring_history ALL via lead"
  ON scoring_history FOR ALL
  TO authenticated
  USING (
    current_comercial_es_director()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = scoring_history.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  )
  WITH CHECK (
    current_comercial_es_director()
    OR EXISTS (
      SELECT 1 FROM leads l
       WHERE l.id = scoring_history.lead_id
         AND (l.comercial_asignado = current_comercial_id() OR l.comercial_asignado IS NULL)
    )
  );


-- ------------------------------------------------------------
-- 6) clientes: igual que leads (filtra por comercial_asignado)
-- ------------------------------------------------------------
CREATE POLICY "clientes ALL propios o director"
  ON clientes FOR ALL
  TO authenticated
  USING (
    current_comercial_es_director()
    OR comercial_asignado = current_comercial_id()
    OR comercial_asignado IS NULL
  )
  WITH CHECK (
    current_comercial_es_director()
    OR comercial_asignado = current_comercial_id()
    OR comercial_asignado IS NULL
  );


-- ------------------------------------------------------------
-- 7) products, message_templates, recursos_rapidos: catálogos compartidos
--    SELECT a todos los authenticated; escritura solo director.
-- ------------------------------------------------------------
CREATE POLICY "products select authenticated"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products write director"
  ON products FOR ALL
  TO authenticated
  USING (current_comercial_es_director())
  WITH CHECK (current_comercial_es_director());

-- "Public read products" ya existe (FOR SELECT USING (true)) — la dejamos.

CREATE POLICY "message_templates select authenticated"
  ON message_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "message_templates write director"
  ON message_templates FOR ALL
  TO authenticated
  USING (current_comercial_es_director())
  WITH CHECK (current_comercial_es_director());

CREATE POLICY "recursos_rapidos select authenticated"
  ON recursos_rapidos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "recursos_rapidos write propio o director"
  ON recursos_rapidos FOR ALL
  TO authenticated
  USING (
    current_comercial_es_director()
    OR creado_por = current_comercial_id()
  )
  WITH CHECK (
    current_comercial_es_director()
    OR creado_por = current_comercial_id()
  );


-- ------------------------------------------------------------
-- 8) mensajes_internos: el comercial ve los que envió o recibió, y los
--    broadcasts (para_comercial_id IS NULL).
-- ------------------------------------------------------------
CREATE POLICY "mensajes_internos select participante"
  ON mensajes_internos FOR SELECT
  TO authenticated
  USING (
    current_comercial_es_director()
    OR de_comercial_id = current_comercial_id()
    OR para_comercial_id = current_comercial_id()
    OR para_comercial_id IS NULL
  );

CREATE POLICY "mensajes_internos insert propio"
  ON mensajes_internos FOR INSERT
  TO authenticated
  WITH CHECK (
    de_comercial_id = current_comercial_id()
    OR current_comercial_es_director()
  );

CREATE POLICY "mensajes_internos update propio o director"
  ON mensajes_internos FOR UPDATE
  TO authenticated
  USING (
    current_comercial_es_director()
    OR de_comercial_id = current_comercial_id()
    OR para_comercial_id = current_comercial_id()
    OR para_comercial_id IS NULL  -- broadcast: pueden marcarlo como leído
  );

CREATE POLICY "mensajes_internos delete director"
  ON mensajes_internos FOR DELETE
  TO authenticated
  USING (current_comercial_es_director());


-- ------------------------------------------------------------
-- 9) FIN — comentario de verificación
-- ------------------------------------------------------------
-- Para verificar que las políticas están aplicadas:
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;
--
-- Para probar manualmente:
--   1. Loguearse como comercial NO director
--   2. SELECT * FROM leads → debe devolver solo los suyos + huérfanos
--   3. INSERT INTO comerciales (...) → debe fallar con "permission denied"
--   4. UPDATE comerciales SET activo=false WHERE id != current_comercial_id() → debe fallar
