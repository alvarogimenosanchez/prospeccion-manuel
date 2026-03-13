"use client";

type FiltrosBarProps = {
  temperatura: string;
  prioridad: string;
  busqueda: string;
  onTemperatura: (v: string) => void;
  onPrioridad: (v: string) => void;
  onBusqueda: (v: string) => void;
};

export function FiltrosBar({
  temperatura,
  prioridad,
  busqueda,
  onTemperatura,
  onPrioridad,
  onBusqueda,
}: FiltrosBarProps) {
  const btnBase = "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border";
  const active = "bg-slate-800 text-white border-slate-800";
  const inactive = "bg-white text-slate-600 border-slate-200 hover:border-slate-400";

  const tempBtns = [
    { value: "", label: "Todos" },
    { value: "caliente", label: "🔴 Calientes" },
    { value: "templado", label: "🟡 Templados" },
    { value: "frio", label: "🔵 Fríos" },
  ];

  const priorBtns = [
    { value: "", label: "Todas" },
    { value: "alta", label: "Alta" },
    { value: "media", label: "Media" },
    { value: "baja", label: "Baja" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar por nombre, empresa..."
        value={busqueda}
        onChange={(e) => onBusqueda(e.target.value)}
        className="flex-1 min-w-48 max-w-72 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
      />

      {/* Separador */}
      <div className="hidden sm:block w-px h-6 bg-slate-200" />

      {/* Temperatura */}
      <div className="flex gap-1">
        {tempBtns.map((b) => (
          <button
            key={b.value}
            onClick={() => onTemperatura(b.value)}
            className={`${btnBase} ${temperatura === b.value ? active : inactive}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Separador */}
      <div className="hidden sm:block w-px h-6 bg-slate-200" />

      {/* Prioridad */}
      <div className="flex gap-1">
        <span className="text-xs text-slate-400 self-center mr-1">Prioridad:</span>
        {priorBtns.map((b) => (
          <button
            key={b.value}
            onClick={() => onPrioridad(b.value)}
            className={`${btnBase} ${prioridad === b.value ? active : inactive}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
