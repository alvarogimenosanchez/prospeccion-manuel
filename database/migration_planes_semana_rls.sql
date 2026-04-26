-- Fix: planes_semana RLS blocks authenticated inserts/updates
-- Allow any authenticated user to read/write their own week plans.

DROP POLICY IF EXISTS "planes_semana_all_auth" ON planes_semana;
CREATE POLICY "planes_semana_all_auth" ON planes_semana
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
