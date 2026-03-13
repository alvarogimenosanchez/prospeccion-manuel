type Prioridad = "alta" | "media" | "baja";

const config: Record<Prioridad, { label: string; class: string }> = {
  alta: { label: "Alta", class: "bg-red-50 text-red-600 font-semibold" },
  media: { label: "Media", class: "bg-yellow-50 text-yellow-600" },
  baja: { label: "Baja", class: "bg-slate-100 text-slate-500" },
};

export function PrioridadBadge({ prioridad }: { prioridad: Prioridad }) {
  const c = config[prioridad];
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${c.class}`}>
      {c.label}
    </span>
  );
}
