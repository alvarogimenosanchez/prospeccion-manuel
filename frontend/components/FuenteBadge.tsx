type Fuente = "linkedin" | "scraping" | "inbound" | "base_existente" | "referido" | "manual" | null;

const config: Record<string, { label: string; class: string }> = {
  linkedin: { label: "LinkedIn", class: "bg-blue-100 text-blue-700" },
  scraping: { label: "Web", class: "bg-orange-100 text-orange-700" },
  inbound: { label: "Inbound", class: "bg-green-100 text-green-700" },
  base_existente: { label: "BD", class: "bg-slate-100 text-slate-600" },
  referido: { label: "Referido", class: "bg-amber-100 text-amber-700" },
  manual: { label: "Manual", class: "bg-slate-100 text-slate-500" },
};

export function FuenteBadge({ fuente }: { fuente: Fuente }) {
  if (!fuente) return null;
  const c = config[fuente] ?? { label: fuente, class: "bg-slate-100 text-slate-500" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${c.class}`}>{c.label}</span>
  );
}
