type Temperatura = "caliente" | "templado" | "frio";

const config: Record<Temperatura, { label: string; class: string; dot: string }> = {
  caliente: {
    label: "Caliente",
    class: "bg-red-100 text-red-700 border border-red-200",
    dot: "bg-red-500",
  },
  templado: {
    label: "Templado",
    class: "bg-amber-100 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
  },
  frio: {
    label: "Frío",
    class: "bg-blue-100 text-blue-600 border border-blue-200",
    dot: "bg-blue-400",
  },
};

export function TemperaturaBadge({ temperatura }: { temperatura: Temperatura }) {
  const c = config[temperatura];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.class}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
