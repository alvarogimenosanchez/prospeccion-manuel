"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type ComercialPerfil = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  whatsapp: string | null;
  rol: string;
  activo: boolean;
  created_at: string;
  objetivo_cierres_mes: number | null;
  objetivo_citas_mes: number | null;
  max_leads_activos: number | null;
};

type MisStats = {
  leadsActivos: number;
  cerradosEsteMes: number;
  citasEsteMes: number;
  leadsCalientes: number;
};

const ROL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  admin:     { label: "Admin",     color: "text-red-700",    bg: "bg-red-100"    },
  director:  { label: "Director",  color: "text-amber-700",  bg: "bg-amber-100"  },
  manager:   { label: "Manager",   color: "text-blue-700",   bg: "bg-blue-100"   },
  comercial: { label: "Comercial", color: "text-slate-700",  bg: "bg-slate-100"  },
};

export default function PerfilPage() {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<ComercialPerfil | null>(null);
  const [stats, setStats] = useState<MisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ telefono: "", whatsapp: "" });
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      if (!u?.email) { setLoading(false); return; }

      const { data: com } = await supabase
        .from("comerciales")
        .select("*")
        .eq("email", u.email)
        .single();
      if (!com) { setLoading(false); return; }
      setPerfil(com);
      setForm({ telefono: com.telefono ?? "", whatsapp: com.whatsapp ?? "" });

      // Mis stats del mes actual
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);

      const [{ count: activos }, { count: cerrados }, { count: citas }, { count: calientes }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("comercial_asignado", com.id)
          .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("comercial_asignado", com.id)
          .eq("estado", "cerrado_ganado")
          .gte("updated_at", inicioMes.toISOString()),
        supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("comercial_id", com.id)
          .gte("fecha_hora", inicioMes.toISOString()),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("comercial_asignado", com.id)
          .eq("temperatura", "caliente")
          .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      ]);

      setStats({
        leadsActivos: activos ?? 0,
        cerradosEsteMes: cerrados ?? 0,
        citasEsteMes: citas ?? 0,
        leadsCalientes: calientes ?? 0,
      });
      setLoading(false);
    }
    cargar();
  }, []);

  async function guardar() {
    if (!perfil) return;
    setGuardando(true);
    await supabase.from("comerciales").update({
      telefono: form.telefono.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
    }).eq("id", perfil.id);
    setPerfil(p => p ? { ...p, telefono: form.telefono || null, whatsapp: form.whatsapp || null } : p);
    setGuardando(false);
    setEditando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  }

  if (loading) return <div className="py-24 text-center text-sm text-slate-400">Cargando...</div>;
  if (!perfil) return <div className="py-24 text-center text-sm text-slate-400">No se encontró tu perfil</div>;

  const rolCfg = ROL_CONFIG[perfil.rol] ?? ROL_CONFIG.comercial;
  const iniciales = [perfil.nombre, perfil.apellidos].filter(Boolean).join(" ")
    .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  const pctCierres = perfil.objetivo_cierres_mes
    ? Math.min(100, Math.round(((stats?.cerradosEsteMes ?? 0) / perfil.objetivo_cierres_mes) * 100))
    : null;
  const pctCitas = perfil.objetivo_citas_mes
    ? Math.min(100, Math.round(((stats?.citasEsteMes ?? 0) / perfil.objetivo_citas_mes) * 100))
    : null;

  const fechaMiembro = new Date(perfil.created_at).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tu cuenta y objetivos del mes</p>
      </div>

      {/* Perfil card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 flex items-center gap-5">
          <div>
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-16 h-16 rounded-full border-2 border-slate-200" />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl" style={{ background: "#fff5f0", color: "#ea650d" }}>
                {iniciales}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-slate-900">{perfil.nombre} {perfil.apellidos ?? ""}</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${rolCfg.bg} ${rolCfg.color}`}>
                {rolCfg.label}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{perfil.email}</p>
            <p className="text-xs text-slate-400 mt-0.5">Miembro desde {fechaMiembro}</p>
          </div>
        </div>

        {/* Contacto */}
        <div className="border-t border-slate-100 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contacto</p>
            {!editando && (
              <button
                onClick={() => setEditando(true)}
                className="text-xs hover:underline" style={{ color: "#ea650d" }}
              >
                Editar
              </button>
            )}
          </div>
          {editando ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="600 000 000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">WhatsApp</label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="34600000000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
                >
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
                <button onClick={() => setEditando(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Teléfono</p>
                <p className="font-medium text-slate-700">{perfil.telefono ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">WhatsApp</p>
                <p className="font-medium text-slate-700">{perfil.whatsapp ?? "—"}</p>
              </div>
            </div>
          )}
          {guardado && <p className="text-xs text-green-600 mt-2">✓ Cambios guardados</p>}
        </div>
      </div>

      {/* Stats del mes */}
      {stats && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Este mes</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Leads activos", valor: stats.leadsActivos, sub: `de ${perfil.max_leads_activos ?? "∞"} máx.`, color: "text-slate-900" },
              { label: "Cierres ganados", valor: stats.cerradosEsteMes, color: "text-green-700" },
              { label: "Citas agendadas", valor: stats.citasEsteMes, color: "text-blue-700" },
              { label: "Leads calientes", valor: stats.leadsCalientes, color: "text-red-600" },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.valor}</p>
                {s.sub && <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* Objetivos */}
          {(pctCierres !== null || pctCitas !== null) && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Objetivos del mes</p>
              {pctCierres !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-600">Cierres ganados</span>
                    <span className="text-xs font-semibold text-slate-700">
                      {stats.cerradosEsteMes} / {perfil.objetivo_cierres_mes}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pctCierres >= 100 ? "bg-green-500" : pctCierres >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                      style={{ width: `${pctCierres}%` }}
                    />
                  </div>
                  <p className="text-xs text-right mt-0.5 text-slate-400">{pctCierres}%</p>
                </div>
              )}
              {pctCitas !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-600">Citas agendadas</span>
                    <span className="text-xs font-semibold text-slate-700">
                      {stats.citasEsteMes} / {perfil.objetivo_citas_mes}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pctCitas >= 100 ? "bg-green-500" : pctCitas >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                      style={{ width: `${pctCitas}%` }}
                    />
                  </div>
                  <p className="text-xs text-right mt-0.5 text-slate-400">{pctCitas}%</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Accesos rápidos</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { href: "/hoy", label: "Mi día de hoy", emoji: "🎯" },
            { href: "/leads", label: "Mis leads", emoji: "👤" },
            { href: "/agenda", label: "Mi agenda", emoji: "📅" },
            { href: "/pipeline", label: "Pipeline", emoji: "🔄" },
          ].map(({ href, label, emoji }) => (
            <a key={href} href={href} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-all">
              <span className="text-base">{emoji}</span>
              <span className="text-xs font-medium text-slate-700">{label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
