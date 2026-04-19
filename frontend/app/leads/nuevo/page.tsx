"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const SECTORES_SUGERIDOS = [
  "Hostelería", "Restauración", "Inmobiliaria", "Asesoría", "Gestoría",
  "Clínica / Salud", "Taller mecánico", "Peluquería / Estética",
  "Comercio / Retail", "Construcción", "Transporte", "Otro",
];

const PRODUCTOS = [
  { value: "contigo_autonomo", label: "Contigo Autónomo" },
  { value: "contigo_pyme", label: "Contigo Pyme" },
  { value: "contigo_familia", label: "Contigo Familia" },
  { value: "contigo_futuro", label: "Contigo Futuro" },
  { value: "contigo_senior", label: "Contigo Senior" },
  { value: "sialp", label: "SIALP" },
  { value: "liderplus", label: "LiderPlus" },
  { value: "sanitas_salud", label: "Sanitas Salud" },
  { value: "mihogar", label: "MiHogar" },
  { value: "hipotecas", label: "Hipotecas" },
];

export default function NuevoLeadPage() {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [duplicado, setDuplicado] = useState<{ id: string; nombre: string } | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    apellidos: "",
    telefono_whatsapp: "",
    telefono: "",
    email: "",
    empresa: "",
    cargo: "",
    sector: "",
    ciudad: "",
    tipo_lead: "autonomo" as "particular" | "autonomo" | "pyme" | "empresa",
    fuente_detalle: "",
    producto_interes_principal: "",
    notas: "",
  });

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === "telefono_whatsapp" || field === "telefono") setDuplicado(null);
  }

  async function checkDuplicado(telefono: string) {
    if (!telefono.trim()) return;
    const { data } = await supabase
      .from("leads")
      .select("id, nombre, apellidos")
      .or(`telefono_whatsapp.eq.${telefono.trim()},telefono.eq.${telefono.trim()}`)
      .limit(1)
      .maybeSingle();
    if (data) setDuplicado({ id: data.id, nombre: `${data.nombre} ${data.apellidos ?? ""}`.trim() });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (!form.telefono_whatsapp.trim() && !form.telefono.trim()) {
      setError("Introduce al menos un número de teléfono."); return;
    }

    setGuardando(true);
    setError("");

    // Obtener comercial del usuario logueado para auto-asignar
    const { data: { user } } = await supabase.auth.getUser();
    let comercialId: string | null = null;
    if (user?.email) {
      const { data } = await supabase
        .from("comerciales")
        .select("id")
        .eq("email", user.email)
        .single();
      comercialId = data?.id ?? null;
    }

    const { data, error: insertError } = await supabase
      .from("leads")
      .insert({
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim() || null,
        telefono_whatsapp: form.telefono_whatsapp.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        empresa: form.empresa.trim() || null,
        cargo: form.cargo.trim() || null,
        sector: form.sector.trim() || null,
        ciudad: form.ciudad.trim() || null,
        tipo_lead: form.tipo_lead,
        fuente: "manual",
        fuente_detalle: form.fuente_detalle.trim() || null,
        producto_interes_principal: form.producto_interes_principal || null,
        productos_recomendados: form.producto_interes_principal ? [form.producto_interes_principal] : null,
        notas: form.notas.trim() || null,
        estado: "nuevo",
        temperatura: "frio",
        nivel_interes: 5,
        prioridad: "media",
        comercial_asignado: comercialId,
        fecha_captacion: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !data) {
      setError("Error al guardar el lead. Inténtalo de nuevo.");
      setGuardando(false);
      return;
    }

    router.push(`/leads/${data.id}`);
  }

  return (
    <div style={{ maxWidth: 672, margin: "0 auto" }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/leads" className="text-sm text-slate-400 hover:text-slate-700">← Leads</Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Nuevo lead</h1>
      </div>

      <form onSubmit={guardar} className="space-y-5">
        {/* Datos personales */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Persona</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nombre <span className="text-red-400">*</span></label>
              <input
                value={form.nombre} onChange={e => set("nombre", e.target.value)}
                placeholder="Manuel"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Apellidos</label>
              <input
                value={form.apellidos} onChange={e => set("apellidos", e.target.value)}
                placeholder="García López"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">WhatsApp</label>
              <input
                value={form.telefono_whatsapp} onChange={e => set("telefono_whatsapp", e.target.value)}
                onBlur={e => checkDuplicado(e.target.value)}
                placeholder="+34 600 000 000"
                type="tel"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Teléfono</label>
              <input
                value={form.telefono} onChange={e => set("telefono", e.target.value)}
                onBlur={e => checkDuplicado(e.target.value)}
                placeholder="+34 910 000 000"
                type="tel"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input
                value={form.email} onChange={e => set("email", e.target.value)}
                placeholder="manuel@empresa.com"
                type="email"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
          </div>
        </div>

        {/* Negocio */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Negocio</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Empresa / Negocio</label>
              <input
                value={form.empresa} onChange={e => set("empresa", e.target.value)}
                placeholder="Bar El Rincón"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Cargo</label>
              <input
                value={form.cargo} onChange={e => set("cargo", e.target.value)}
                placeholder="Propietario"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sector</label>
              <input
                value={form.sector} onChange={e => set("sector", e.target.value)}
                list="sectores-list"
                placeholder="Hostelería"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
              <datalist id="sectores-list">
                {SECTORES_SUGERIDOS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ciudad</label>
              <input
                value={form.ciudad} onChange={e => set("ciudad", e.target.value)}
                placeholder="Madrid"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Tipo de lead</label>
              <div className="flex gap-2">
                {(["particular", "autonomo", "pyme", "empresa"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => set("tipo_lead", t)}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg border capitalize transition-colors ${form.tipo_lead === t ? "border-orange-400 text-orange-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                    style={form.tipo_lead === t ? { background: "#fff5f0" } : undefined}>
                    {t === "autonomo" ? "Autónomo" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Producto y contexto */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Contexto comercial</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Producto de interés</label>
              <select
                value={form.producto_interes_principal} onChange={e => set("producto_interes_principal", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-300">
                <option value="">Sin especificar</option>
                {PRODUCTOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">¿Cómo lo encontraste?</label>
              <input
                value={form.fuente_detalle} onChange={e => set("fuente_detalle", e.target.value)}
                placeholder="Google Maps, referido por Juan, feria de negocios..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notas iniciales</label>
              <textarea
                value={form.notas} onChange={e => set("notas", e.target.value)}
                rows={3}
                placeholder="Contexto, observaciones, por qué puede ser un buen lead..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-orange-300"
              />
            </div>
          </div>
        </div>

        {duplicado && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center justify-between">
            <span>⚠️ Este teléfono ya existe: <strong>{duplicado.nombre}</strong></span>
            <Link href={`/leads/${duplicado.id}`} className="underline font-medium ml-2 flex-shrink-0">
              Ver lead →
            </Link>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
            style={{ background: "#ea650d" }}
          >
            {guardando ? "Creando lead..." : "Crear lead"}
          </button>
          <Link
            href="/leads"
            className="px-6 py-3 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors text-center"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
