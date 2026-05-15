// Utilidades para distinguir móviles vs fijos en España.
// Móviles: empiezan por 6 o 7. Fijos: 8 o 9 (o cualquier prefijo provincial 9xx).

export function esMovilEspanol(tel: string | null | undefined): boolean {
  if (!tel) return false;
  const digits = tel.replace(/\D/g, "");
  // Quitar prefijo 34 si existe
  const sinPrefijo = digits.length === 11 && digits.startsWith("34") ? digits.slice(2) : digits;
  return sinPrefijo.length === 9 && (sinPrefijo[0] === "6" || sinPrefijo[0] === "7");
}

export type TipoTelefono = "movil" | "fijo" | "desconocido";

export function tipoTelefono(tel: string | null | undefined): TipoTelefono {
  if (!tel) return "desconocido";
  const digits = tel.replace(/\D/g, "");
  const sinPrefijo = digits.length === 11 && digits.startsWith("34") ? digits.slice(2) : digits;
  if (sinPrefijo.length !== 9) return "desconocido";
  const primero = sinPrefijo[0];
  if (primero === "6" || primero === "7") return "movil";
  if (primero === "8" || primero === "9") return "fijo";
  return "desconocido";
}

export function badgeTipoTelefono(tel: string | null | undefined): { emoji: string; label: string; color: string } | null {
  const tipo = tipoTelefono(tel);
  if (tipo === "movil") return { emoji: "📱", label: "Móvil", color: "text-green-700 bg-green-50 border-green-200" };
  if (tipo === "fijo") return { emoji: "📞", label: "Fijo", color: "text-slate-600 bg-slate-50 border-slate-200" };
  return null;
}
