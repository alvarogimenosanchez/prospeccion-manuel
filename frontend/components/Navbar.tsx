import Link from "next/link";

export function Navbar() {
  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            M
          </div>
          <span className="font-semibold text-slate-800 text-sm">Manuel · Prospección</span>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/leads" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Leads
          </Link>
          <Link href="/prospeccion" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Prospección
          </Link>
          <Link href="/metricas" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Métricas
          </Link>
        </div>
      </div>
      <div className="text-xs text-slate-400">
        {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
      </div>
    </nav>
  );
}
