export function NivelInteresBar({ nivel }: { nivel: number }) {
  const pct = (nivel / 10) * 100;
  const color =
    nivel >= 7 ? "bg-red-500" : nivel >= 4 ? "bg-amber-400" : "bg-blue-300";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-6 text-right">{nivel}/10</span>
    </div>
  );
}
