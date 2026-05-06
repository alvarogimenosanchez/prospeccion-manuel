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

  if (!res.ok) {
    // Leer el body UNA SOLA VEZ como texto, luego intentar parsearlo como JSON.
    // Si llamas a res.json() y falla, el stream ya se ha consumido y .text() peta.
    const rawBody = await res.text();
    let detail = rawBody;
    try {
      const errBody = JSON.parse(rawBody);
      detail = errBody.detail || JSON.stringify(errBody);
    } catch {
      // No era JSON, usamos el texto plano
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`No autorizado (${res.status}): ${detail}`);
    }
    throw new Error(`Error ${res.status}: ${detail}`);
  }

  // Algunos endpoints devuelven 204 sin body
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
