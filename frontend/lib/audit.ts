import { supabase } from "./supabase";

/**
 * Acciones permitidas en el audit log. Mantener esta lista controlada para que
 * los logs sean filtrables/agregables en la UI.
 */
export type AuditAccion =
  | "lead_reasignar"
  | "lead_estado_cambiar"
  | "lead_eliminar"
  | "comercial_crear"
  | "comercial_editar"
  | "comercial_activar"
  | "comercial_desactivar"
  | "mensaje_aprobar"
  | "mensaje_descartar"
  | "mensaje_enviar"
  | "cliente_crear"
  | "cliente_editar"
  | "cliente_eliminar"
  | "scraping_lanzar"
  | "team_crear"
  | "team_editar";

export type AuditEntidad = "lead" | "comercial" | "mensaje" | "cliente" | "team" | "scraping";

interface AuditPayload {
  accion: AuditAccion;
  entidad_tipo?: AuditEntidad;
  entidad_id?: string | null;
  detalles?: Record<string, unknown>;
}

let _comercialCache: { id: string; email: string } | null = null;

async function _getComercial(): Promise<{ id: string; email: string } | null> {
  if (_comercialCache) return _comercialCache;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("comerciales")
    .select("id, email")
    .eq("email", user.email)
    .maybeSingle();
  if (data) _comercialCache = data as { id: string; email: string };
  return _comercialCache;
}

/**
 * Registra una acción en el audit log. No bloquea el flujo: si falla, solo
 * deja un warning en consola. La RLS garantiza que solo se puede registrar
 * en nombre del comercial actual.
 */
export async function audit(payload: AuditPayload): Promise<void> {
  try {
    const c = await _getComercial();
    await supabase.from("audit_log").insert({
      comercial_id: c?.id ?? null,
      email: c?.email ?? null,
      accion: payload.accion,
      entidad_tipo: payload.entidad_tipo ?? null,
      entidad_id: payload.entidad_id ?? null,
      detalles: payload.detalles ?? {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (e) {
    console.warn("[audit] error registrando evento:", e);
  }
}
