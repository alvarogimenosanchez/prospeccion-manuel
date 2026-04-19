"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type FiltrosCampana = {
  estado: string;
  temperatura: string;
  sector: string;
  producto: string;
  fuente: string;
};

type LeadPreview = {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono_whatsapp: string | null;
  empresa: string | null;
};

const ESTADOS_OPTIONS = [
  { value: "", label: "Cualquier estado" },
  { value: "nuevo", label: "Nuevo" },
  { value: "enriquecido", label: "Enriquecido" },
  { value: "segmentado", label: "Segmentado" },
  { value: "mensaje_generado", label: "Mensaje generado" },
  { value: "mensaje_enviado", label: "Mensaje enviado" },
  { value: "respondio", label: "Respondió" },
  { value: "cita_agendada", label: "Cita agendada" },
  { value: "en_negociacion", label: "En negociación" },
];

const TEMPERATURA_OPTIONS = [
  { value: "", label: "Cualquier temperatura" },
  { value: "caliente", label: "Caliente" },
  { value: "templado", label: "Templado" },
  { value: "frio", label: "Frío" },
];

const PRODUCTO_OPTIONS = [
  { value: "", label: "Cualquier producto" },
  { value: "contigo_autonomo", label: "Contigo Autónomo" },
  { value: "contigo_pyme", label: "Contigo Pyme" },
  { value: "contigo_familia", label: "Contigo Familia" },
  { value: "contigo_futuro", label: "Contigo Futuro" },
  { value: "contigo_senior", label: "Contigo Senior" },
  { value: "sialp", label: "SIALP" },
  { value: "liderplus", label: "LiderPlus" },
  { value: "sanitas_salud", label: "Sanitas Salud" },
  { value: "mihogar", label: "MiHogar" },
  { value: "hipotecas", label: "Hipoteca" },
];

const FUENTE_OPTIONS = [
  { value: "", label: "Cualquier fuente" },
  { value: "scraping", label: "Prospección automática" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "inbound", label: "Inbound / web" },
  { value: "manual", label: "Manual" },
  { value: "referido", label: "Referido" },
  { value: "base_existente", label: "Base existente" },
  { value: "formulario_web", label: "Formulario web" },
];

const PLANTILLAS_RAPIDAS = [
  {
    label: "Primer contacto — presentación",
    texto: "Hola {nombre}, soy asesor de NN España. Me dirijo a ti porque creo que podríamos ayudarte con tu protección financiera. ¿Tienes 5 minutos esta semana para comentarlo?",
  },
  {
    label: "Seguimiento — lead frío reactivado",
    texto: "Hola {nombre}, hace un tiempo hablamos sobre una posible solución de seguros para ti. Las condiciones han mejorado bastante y quería ver si ahora es mejor momento. ¿Hablamos?",
  },
  {
    label: "Oferta — producto específico",
    texto: "Hola {nombre}, tengo una propuesta personalizada para {empresa} que creo que te va a interesar. ¿Cuándo podríamos hablar 10 minutos?",
  },
  {
    label: "Recordatorio — cita pendiente",
    texto: "Hola {nombre}, te escribo para confirmar nuestra cita. Si necesitas cambiar la hora dímelo sin problema. ¡Hasta pronto!",
  },
];

export default function CampanasPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();

  const [filtros, setFiltros] = useState<FiltrosCampana>({
    estado: "",
    temperatura: "",
    sector: "",
    producto: "",
    fuente: "",
  });
  const [mensaje, setMensaje] = useState("");
  const [nombreCampana, setNombreCampana] = useState("");
  const [conteo, setConteo] = useState<number | null>(null);
  const [preview, setPreview] = useState<LeadPreview[]>([]);
  const [cargandoConteo, setCargandoConteo] = useState(false);
  const [lanzando, setLanzando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; sinWA: number } | null>(null);

  const actualizarConteo = useCallback(async () => {
    setCargandoConteo(true);
    let q = supabase.from("leads").select("id, nombre, apellidos, telefono_whatsapp, empresa", { count: "exact" })
      .not("estado", "in", '("cerrado_ganado","cerrado_perdido","descartado")');
    if (filtros.estado) q = q.eq("estado", filtros.estado);
    if (filtros.temperatura) q = q.eq("temperatura", filtros.temperatura);
    if (filtros.sector) q = q.ilike("sector", `%${filtros.sector}%`);
    if (filtros.producto) q = q.eq("producto_interes_principal", filtros.producto);
    if (filtros.fuente) q = q.eq("fuente", filtros.fuente);

    const { data, count } = await q.order("nivel_interes", { ascending: false }).limit(5);
    setConteo(count ?? 0);
    setPreview((data as LeadPreview[]) ?? []);
    setCargandoConteo(false);
  }, [filtros]);

  useEffect(() => {
    if (!cargandoPermisos) actualizarConteo();
  }, [actualizarConteo, cargandoPermisos]);

  async function lanzarCampana() {
    if (!mensaje.trim() || !nombreCampana.trim() || conteo === 0) return;
    setLanzando(true);
    setResultado(null);

    let q = supabase.from("leads").select("id, nombre, apellidos, telefono_whatsapp, empresa, producto_interes_principal, comercial_asignado")
      .not("estado", "in", '("cerrado_ganado","cerrado_perdido","descartado")');
    if (filtros.estado) q = q.eq("estado", filtros.estado);
    if (filtros.temperatura) q = q.eq("temperatura", filtros.temperatura);
    if (filtros.sector) q = q.ilike("sector", `%${filtros.sector}%`);
    if (filtros.producto) q = q.eq("producto_interes_principal", filtros.producto);
    if (filtros.fuente) q = q.eq("fuente", filtros.fuente);
    q = q.limit(500);

    const { data: leads } = await q;
    if (!leads?.length) { setLanzando(false); return; }

    let ok = 0;
    let sinWA = 0;

    const registros = leads.map(lead => {
      const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
      const textoPersonalizado = mensaje
        .replace("{nombre}", nombre || "")
        .replace("{empresa}", lead.empresa || "tu empresa");

      if (!lead.telefono_whatsapp) { sinWA++; return null; }
      ok++;
      return {
        lead_id: lead.id,
        comercial_id: lead.comercial_asignado,
        mensaje: textoPersonalizado,
        canal: "whatsapp",
        estado: "pendiente",
        campana_nombre: nombreCampana,
      };
    }).filter(Boolean);

    if (registros.length > 0) {
      await supabase.from("mensajes_pendientes").insert(registros);
    }

    setResultado({ ok, sinWA });
    setLanzando(false);
  }

  if (!cargandoPermisos && !puede("asignar_leads") && !puede("ver_todos_leads")) {
    return <SinAcceso />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Campañas masivas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Filtra leads por criterios y lanza mensajes personalizados en masa para revisión antes de enviar
        </p>
      </div>

      {resultado && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">✅</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Campaña «{nombreCampana}» en cola</p>
            <p className="text-xs text-green-700 mt-0.5">
              {resultado.ok} mensajes generados y pendientes de revisión en{" "}
              <a href="/mensajes" className="underline font-medium">Mensajes WA</a>.
              {resultado.sinWA > 0 && ` ${resultado.sinWA} leads omitidos por no tener WhatsApp.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filtros */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Audiencia objetivo</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Estado del lead</label>
                <select
                  value={filtros.estado}
                  onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
                >
                  {ESTADOS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Temperatura</label>
                <select
                  value={filtros.temperatura}
                  onChange={e => setFiltros(f => ({ ...f, temperatura: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
                >
                  {TEMPERATURA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Producto de interés</label>
                <select
                  value={filtros.producto}
                  onChange={e => setFiltros(f => ({ ...f, producto: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
                >
                  {PRODUCTO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Fuente de captación</label>
                <select
                  value={filtros.fuente}
                  onChange={e => setFiltros(f => ({ ...f, fuente: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
                >
                  {FUENTE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Sector (búsqueda libre)</label>
              <input
                type="text"
                value={filtros.sector}
                onChange={e => setFiltros(f => ({ ...f, sector: e.target.value }))}
                placeholder="ej: tecnología, hostelería, salud..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">Leads en la audiencia</span>
                {cargandoConteo ? (
                  <span className="text-xs text-slate-400">calculando...</span>
                ) : (
                  <span className="text-sm font-bold" style={{ color: conteo && conteo > 0 ? "#ea650d" : "#94a3b8" }}>
                    {conteo ?? 0} leads
                  </span>
                )}
              </div>
              {preview.length > 0 && (
                <div className="space-y-1">
                  {preview.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.telefono_whatsapp ? "bg-green-400" : "bg-red-300"}`} />
                      <span className="font-medium text-slate-700">{[l.nombre, l.apellidos].filter(Boolean).join(" ") || "Sin nombre"}</span>
                      {l.empresa && <span className="text-slate-400">{l.empresa}</span>}
                      {!l.telefono_whatsapp && <span className="text-red-400 ml-auto">sin WA</span>}
                    </div>
                  ))}
                  {(conteo ?? 0) > 5 && (
                    <p className="text-xs text-slate-400 pt-1">… y {(conteo ?? 0) - 5} más</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mensaje */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Mensaje de la campaña</h2>
              <span className="text-xs text-slate-400">Variables: {"{nombre}"}, {"{empresa}"}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PLANTILLAS_RAPIDAS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setMensaje(p.texto)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-600 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <textarea
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              rows={5}
              placeholder="Escribe el mensaje de la campaña o selecciona una plantilla rápida arriba..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-slate-400 resize-none"
            />

            {mensaje && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-xs font-medium text-green-700 mb-1">Vista previa (primer lead)</p>
                <p className="text-xs text-green-800 whitespace-pre-wrap">
                  {mensaje
                    .replace("{nombre}", preview[0] ? [preview[0].nombre, preview[0].apellidos].filter(Boolean).join(" ") || "Juan García" : "Juan García")
                    .replace("{empresa}", preview[0]?.empresa || "tu empresa")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Panel lanzar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 sticky top-6">
            <h2 className="text-sm font-semibold text-slate-700">Lanzar campaña</h2>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Nombre de la campaña</label>
              <input
                type="text"
                value={nombreCampana}
                onChange={e => setNombreCampana(e.target.value)}
                placeholder="ej: Reactivación mayo 2026"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Leads en audiencia</span>
                <span className="font-semibold text-slate-800">{cargandoConteo ? "..." : (conteo ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Mensajes a generar</span>
                <span className="font-semibold text-slate-800">{cargandoConteo ? "..." : (conteo ?? 0)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 text-slate-400">
                Los mensajes quedan en estado «pendiente» para revisión en Mensajes WA antes de enviarse.
              </div>
            </div>

            <button
              onClick={lanzarCampana}
              disabled={lanzando || !mensaje.trim() || !nombreCampana.trim() || !conteo || conteo === 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ background: "#ea650d" }}
            >
              {lanzando ? "Generando mensajes..." : `Lanzar campaña →`}
            </button>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">¿Cómo funciona?</p>
              <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
                <li>Define la audiencia con los filtros</li>
                <li>Escribe el mensaje con variables personalizadas</li>
                <li>Lanza — los mensajes van a revisión en Mensajes WA</li>
                <li>Aprueba y envía desde allí</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
