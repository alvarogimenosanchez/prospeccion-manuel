"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode = "menu" | "lead" | "cita";

export function QuickCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [guardando, setGuardando] = useState(false);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Lead form
  const [nombre, setNombre] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  // Cita form
  const [citaFecha, setCitaFecha] = useState("");
  const [citaHora, setCitaHora] = useState("10:00");
  const [citaNota, setCitaNota] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return;
      supabase.from("comerciales").select("id").eq("email", user.email).single()
        .then(({ data }) => setComercialId(data?.id ?? null));
    });
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function close() {
    setOpen(false);
    setMode("menu");
    setNombre(""); setEmpresa(""); setTelefono(""); setEmail("");
    setCitaFecha(""); setCitaHora("10:00"); setCitaNota("");
  }

  function toggle() {
    if (open) close();
    else { setOpen(true); setMode("menu"); }
  }

  async function crearLead() {
    if (!nombre.trim()) return;
    setGuardando(true);
    const { data } = await supabase.from("leads").insert({
      nombre: nombre.trim(),
      empresa: empresa.trim() || null,
      telefono: telefono.trim() || null,
      telefono_whatsapp: telefono.trim() || null,
      email: email.trim() || null,
      estado: "nuevo",
      temperatura: "frio",
      fuente: "manual",
      comercial_asignado: comercialId,
    }).select("id").single();
    setGuardando(false);
    close();
    if (data?.id) router.push(`/leads/${data.id}`);
  }

  async function crearCita() {
    if (!citaFecha || !citaHora) return;
    setGuardando(true);
    await supabase.from("appointments").insert({
      comercial_id: comercialId,
      tipo: "primera_reunion",
      estado: "pendiente",
      fecha_hora: `${citaFecha}T${citaHora}:00`,
      notas_previas: citaNota.trim() || null,
    });
    setGuardando(false);
    close();
    router.push("/agenda");
  }

  const hoy = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed bottom-6 right-6 z-40" ref={ref}>
      {/* Modal panel */}
      {open && (
        <div className="absolute bottom-14 right-0 mb-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {mode === "menu" && (
            <div className="p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 pb-1">Crear rápido</p>
              {[
                { label: "Nuevo lead", emoji: "👤", action: () => setMode("lead") },
                { label: "Nueva cita", emoji: "📅", action: () => setMode("cita") },
                { label: "Prospección IA", emoji: "🔍", action: () => { close(); router.push("/prospeccion"); } },
                { label: "Asistente IA", emoji: "✨", action: () => { close(); router.push("/ia"); } },
              ].map(({ label, emoji, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="text-base">{emoji}</span>
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </button>
              ))}
            </div>
          )}

          {mode === "lead" && (
            <div>
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                <button onClick={() => setMode("menu")} className="text-slate-400 hover:text-slate-600 text-sm">←</button>
                <p className="text-sm font-semibold text-slate-800">Nuevo lead</p>
              </div>
              <div className="p-4 space-y-3">
                <input
                  autoFocus
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && crearLead()}
                  placeholder="Nombre *"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <input
                  type="text"
                  value={empresa}
                  onChange={e => setEmpresa(e.target.value)}
                  placeholder="Empresa"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <input
                  type="tel"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  placeholder="Teléfono / WhatsApp"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <button
                  onClick={crearLead}
                  disabled={!nombre.trim() || guardando}
                  className="w-full py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
                >
                  {guardando ? "Creando..." : "Crear y abrir →"}
                </button>
              </div>
            </div>
          )}

          {mode === "cita" && (
            <div>
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                <button onClick={() => setMode("menu")} className="text-slate-400 hover:text-slate-600 text-sm">←</button>
                <p className="text-sm font-semibold text-slate-800">Nueva cita</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Fecha</label>
                    <input
                      type="date"
                      value={citaFecha}
                      min={hoy}
                      onChange={e => setCitaFecha(e.target.value)}
                      className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Hora</label>
                    <input
                      type="time"
                      value={citaHora}
                      onChange={e => setCitaHora(e.target.value)}
                      className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                </div>
                <textarea
                  value={citaNota}
                  onChange={e => setCitaNota(e.target.value)}
                  rows={2}
                  placeholder="Nota (opcional)"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                />
                <button
                  onClick={crearCita}
                  disabled={!citaFecha || guardando}
                  className="w-full py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
                >
                  {guardando ? "Guardando..." : "Añadir a agenda →"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={toggle}
        className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95"
        style={{ background: open ? "#414141" : "#ea650d" }}
        title="Crear rápido"
      >
        <span className="text-xl font-light leading-none transition-transform" style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}>
          +
        </span>
      </button>
    </div>
  );
}
