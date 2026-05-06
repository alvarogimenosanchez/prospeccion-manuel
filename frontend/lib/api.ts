import { supabase } from "./supabase";

/**
 * Wrapper de fetch para llamadas al backend FastAPI (Railway).
 * Añade automáticamente Authorization: Bearer <jwt> con el token de Supabase.
 *
 * Uso:
 *   const data = await apiFetch<{leads: Lead[]}>("/api/leads?prioridad=alta");
 *   await apiFetch("/scraping/lanzar", { method: "POST", body: JSON.stringify({...}) });
 *
 * Si no hay sesión, lanza un Error. Las páginas internas ya están protegidas
 * por el middleware, así que en la práctica siempre habrá sesión.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("No hay sesión activa. Recarga la página o inicia sesión de nuevo.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    // Sesión expirada o no autorizado — forzar re-login
    throw new Error(`No autorizado (${res.status}): ${await res.text()}`);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody.detail || JSON.stringify(errBody);
    } catch {
      detail = await res.text();
    }
    throw new Error(`Error ${res.status}: ${detail}`);
  }

  // Algunos endpoints devuelven 204 sin body
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
