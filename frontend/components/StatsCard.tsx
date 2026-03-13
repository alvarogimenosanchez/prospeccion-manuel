type StatsCardProps = {
  titulo: string;
  valor: number | string;
  descripcion?: string;
  urgente?: boolean;
};

export function StatsCard({ titulo, valor, descripcion, urgente }: StatsCardProps) {
  return (
    <div className={`rounded-xl p-5 border ${urgente ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <p className={`text-sm font-medium ${urgente ? "text-red-600" : "text-slate-500"}`}>
        {titulo}
      </p>
      <p className={`text-3xl font-bold mt-1 ${urgente ? "text-red-700" : "text-slate-900"}`}>
        {valor}
      </p>
      {descripcion && (
        <p className="text-xs text-slate-400 mt-1">{descripcion}</p>
      )}
    </div>
  );
}
