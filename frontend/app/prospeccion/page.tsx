"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/lib/supabase";
import Link from "next/link";
import * as XLSX from "xlsx";

type LeadNuevo = Lead & { seleccionado?: boolean };

const CIUDADES_SUGERIDAS = ["Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao", "Zaragoza", "Alicante", "Murcia", "Valladolid"];
const CATEGORIAS = [
  { id: "inmobiliarias", label: "Inmobiliarias", icon: "🏠", productos: ["contigo_pyme", "hipotecas"] },
  { id: "asesorias", label: "Asesorías / Gestorías", icon: "📋", productos: ["contigo_pyme", "sialp"] },
  { id: "hosteleria", label: "Hostelería (bares, restaurantes)", icon: "🍽️", productos: ["contigo_autonomo", "sialp"] },
  { id: "clinicas", label: "Clínicas y salud", icon: "🏥", productos: ["contigo_pyme", "contigo_familia"] },
  { id: "talleres", label: "Talleres mecánicos", icon: "🔧", productos: ["contigo_autonomo", "liderplus"] },
  { id: "peluquerias", label: "Peluquerías / Estética", icon: "✂️", productos: ["contigo_autonomo", "sialp"] },
];

type EstadoCampana = "idle" | "corriendo" | "completada" | "error";

type LeadImport = {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  empresa: string;
  sector: string;
  ciudad: string;
  cargo: string;
  notas: string;
};

// Campos del lead que se pueden mapear desde el Excel
const CAMPOS_LEAD: { key: keyof LeadImport; label: string }[] = [
  { key: "nombre", label: "Nombre" },
  { key: "apellidos", label: "Apellidos" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Teléfono" },
  { key: "empresa", label: "Empresa" },
  { key: "sector", label: "Sector" },
  { key: "ciudad", label: "Ciudad" },
  { key: "cargo", label: "Cargo" },
  { key: "notas", label: "Notas" },
];


export default function ProspeccionPage() {
  const [leads, setLeads] = useState<LeadNuevo[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filtros del listado
  const [filtroFuente, setFiltroFuente] = useState("scraping");
  const [filtroEstado, setFiltroEstado] = useState("nuevo");
  const [filtroCiudad, setFiltroCiudad] = useState("");
  const [filtroSector, setFiltroSector] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // Configuración de campaña
  const [ciudadesElegidas, setCiudadesElegidas] = useState<string[]>(["Madrid"]);
  const [zonaPersonalizada, setZonaPersonalizada] = useState("");
  const [categoriasElegidas, setCategoriasElegidas] = useState<string[]>(["inmobiliarias"]);
  const [paginasPorCiudad, setPaginasPorCiudad] = useState(2);
  const [soloConTelefono, setSoloConTelefono] = useState(false);
  const [estadoCampana, setEstadoCampana] = useState<EstadoCampana>("idle");
  const [mensajeCampana, setMensajeCampana] = useState("");
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [historialCampanas, setHistorialCampanas] = useState<{zona: string, categoria: string, fecha: string}[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("historial_campanas");
    if (stored) setHistorialCampanas(JSON.parse(stored));
  }, []);

  const cargarLeads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .order("fecha_captacion", { ascending: false })
      .limit(100);

    if (filtroFuente) query = query.eq("fuente", filtroFuente);
    if (filtroEstado) query = query.eq("estado", filtroEstado);
    if (filtroCiudad) query = query.ilike("ciudad", `%${filtroCiudad}%`);
    if (filtroSector) query = query.ilike("sector", `%${filtroSector}%`);

    const { data, count, error } = await query;
    if (!error) {
      setLeads(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [filtroFuente, filtroEstado, filtroCiudad, filtroSector]);

  useEffect(() => { cargarLeads(); }, [cargarLeads]);

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const seleccionarTodos = () => {
    if (seleccionados.size === leads.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(leads.map(l => l.id)));
    }
  };

  const marcarContactado = async () => {
    if (seleccionados.size === 0) return;
    const ids = Array.from(seleccionados);
    await supabase
      .from("leads")
      .update({ estado: "mensaje_enviado", updated_at: new Date().toISOString() })
      .in("id", ids);
    setSeleccionados(new Set());
    cargarLeads();
  };

  const descartarSeleccionados = async () => {
    if (seleccionados.size === 0) return;
    if (!confirm(`¿Descartar ${seleccionados.size} leads?`)) return;
    const ids = Array.from(seleccionados);
    await supabase
      .from("leads")
      .update({ estado: "descartado" })
      .in("id", ids);
    setSeleccionados(new Set());
    cargarLeads();
  };

  // ── Importación Excel ──
  const [mostrarImport, setMostrarImport] = useState(false);
  const [filasBruto, setFilasBruto] = useState<Record<string, string>[]>([]);
  const [columnasDetectadas, setColumnasDetectadas] = useState<string[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<LeadImport[]>([]);
  const [duplicados, setDuplicados] = useState<Set<number>>(new Set());
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<{importados: number; omitidos: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [estadoSeguimiento, setEstadoSeguimiento] = useState<"idle"|"corriendo"|"completado">("idle");
  const [estadoEnriquecimiento, setEstadoEnriquecimiento] = useState<"idle"|"corriendo"|"completado">("idle");

  const lanzarSeguimiento = async () => {
    setEstadoSeguimiento("corriendo");
    try {
      const resp = await fetch("/api/seguimiento/ejecutar", { method: "POST" });
      if (resp.ok) {
        setEstadoSeguimiento("completado");
        setTimeout(() => setEstadoSeguimiento("idle"), 4000);
      }
    } catch {
      setEstadoSeguimiento("idle");
    }
  };

  const lanzarEnriquecimiento = async () => {
    setEstadoEnriquecimiento("corriendo");
    try {
      const resp = await fetch("/api/linkedin/enriquecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 50 }),
      });
      if (resp.ok) {
        setEstadoEnriquecimiento("completado");
        setTimeout(() => { setEstadoEnriquecimiento("idle"); cargarLeads(); }, 4000);
      }
    } catch {
      setEstadoEnriquecimiento("idle");
    }
  };

  const lanzarCampana = async () => {
    // Combinar ciudades seleccionadas + zonas personalizadas escritas a mano
    const zonasCustom = zonaPersonalizada
      .split(",")
      .map(z => z.trim())
      .filter(Boolean);
    const todasLasZonas = [...new Set([...ciudadesElegidas, ...zonasCustom])];

    if (todasLasZonas.length === 0 || categoriasElegidas.length === 0) {
      alert("Selecciona al menos una zona y una categoría.");
      return;
    }
    setEstadoCampana("corriendo");
    setMensajeCampana("Iniciando scraping...");

    try {
      const resp = await fetch("/api/scraping/lanzar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciudades: todasLasZonas,
          categorias: categoriasElegidas,
          paginas: paginasPorCiudad,
          solo_con_telefono: soloConTelefono,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setEstadoCampana("completada");
        setMensajeCampana(`✅ Campaña lanzada — leads en proceso`);

        // Guardar en historial local
        const nuevasEntradas = todasLasZonas.flatMap(zona =>
          categoriasElegidas.map(cat => ({
            zona,
            categoria: cat,
            fecha: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" }),
          }))
        );
        const historialActualizado = [...nuevasEntradas, ...historialCampanas].slice(0, 10);
        setHistorialCampanas(historialActualizado);
        localStorage.setItem("historial_campanas", JSON.stringify(historialActualizado));

        setTimeout(() => {
          setEstadoCampana("idle");
          setMostrarConfig(false);
          cargarLeads();
        }, 3000);
      } else {
        let detail = `HTTP ${resp.status}`;
        try {
          const errData = await resp.json();
          detail = errData.detail || errData.message || JSON.stringify(errData);
        } catch {}
        throw new Error(detail);
      }
    } catch (err) {
      setEstadoCampana("error");
      setMensajeCampana(`❌ Error: ${err instanceof Error ? err.message : "No se pudo conectar con el backend"}`);
      setTimeout(() => setEstadoCampana("idle"), 6000);
    }
  };

  const toggleCiudad = (ciudad: string) => {
    setCiudadesElegidas(prev =>
      prev.includes(ciudad) ? prev.filter(c => c !== ciudad) : [...prev, ciudad]
    );
  };

  const toggleCategoria = (cat: string) => {
    setCategoriasElegidas(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // ── Lógica de importación ──

  function leerExcel(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      if (filas.length === 0) return;
      const cols = Object.keys(filas[0]);
      setFilasBruto(filas);
      setColumnasDetectadas(cols);
      setResultadoImport(null);
      setPreview([]);
      setDuplicados(new Set());

      // Auto-mapeo heurístico
      const autoMapeo: Record<string, string> = {};
      for (const campo of CAMPOS_LEAD) {
        const coincidencia = cols.find(c =>
          c.toLowerCase().includes(campo.key) ||
          (campo.key === "nombre" && /^nombre$/i.test(c)) ||
          (campo.key === "apellidos" && /apellido/i.test(c)) ||
          (campo.key === "email" && /e.?mail|correo/i.test(c)) ||
          (campo.key === "telefono" && /tel[eé]f|phone|m[oó]vil|whatsapp/i.test(c)) ||
          (campo.key === "empresa" && /empresa|compan[iy]|negocio/i.test(c)) ||
          (campo.key === "ciudad" && /ciudad|localidad|poblaci[oó]n/i.test(c)) ||
          (campo.key === "sector" && /sector|industria/i.test(c)) ||
          (campo.key === "cargo" && /cargo|puesto|posici[oó]n/i.test(c))
        );
        if (coincidencia) autoMapeo[campo.key] = coincidencia;
      }
      setMapeo(autoMapeo);
    };
    reader.readAsArrayBuffer(file);
  }

  function aplicarMapeo() {
    const leads: LeadImport[] = filasBruto.map(fila => {
      const l: LeadImport = { nombre: "", apellidos: "", email: "", telefono: "", empresa: "", sector: "", ciudad: "", cargo: "", notas: "" };
      for (const campo of CAMPOS_LEAD) {
        const colOrigen = mapeo[campo.key];
        if (colOrigen && fila[colOrigen] !== undefined) {
          l[campo.key] = String(fila[colOrigen]).trim();
        }
      }
      return l;
    }).filter(l => l.nombre || l.empresa || l.telefono);
    setPreview(leads);
    verificarDuplicados(leads);
  }

  async function verificarDuplicados(leads: LeadImport[]) {
    const telefonos = leads.map(l => l.telefono).filter(Boolean);
    const emails = leads.map(l => l.email).filter(Boolean);

    const [{ data: porTelef }, { data: porEmail }] = await Promise.all([
      telefonos.length > 0
        ? supabase.from("leads").select("telefono").in("telefono", telefonos)
        : Promise.resolve({ data: [] }),
      emails.length > 0
        ? supabase.from("leads").select("email").in("email", emails)
        : Promise.resolve({ data: [] }),
    ]);

    const telefsExistentes = new Set((porTelef ?? []).map((r: { telefono: string | null }) => r.telefono));
    const emailsExistentes = new Set((porEmail ?? []).map((r: { email: string | null }) => r.email));

    const dupIdx = new Set<number>();
    leads.forEach((l, i) => {
      if ((l.telefono && telefsExistentes.has(l.telefono)) ||
          (l.email && emailsExistentes.has(l.email))) {
        dupIdx.add(i);
      }
    });
    setDuplicados(dupIdx);
  }

  async function importarLeads() {
    const aImportar = preview.filter((_, i) => !duplicados.has(i));
    if (aImportar.length === 0) return;
    setImportando(true);

    const inserts = aImportar.map(l => ({
      nombre: l.nombre || "Desconocido",
      apellidos: l.apellidos || null,
      email: l.email || null,
      telefono: l.telefono || null,
      telefono_whatsapp: l.telefono || null,
      empresa: l.empresa || null,
      sector: l.sector || null,
      ciudad: l.ciudad || null,
      cargo: l.cargo || null,
      notas: l.notas || null,
      fuente: "base_existente" as const,
      estado: "nuevo",
      temperatura: "frio" as const,
      nivel_interes: 3,
      prioridad: "media" as const,
      fecha_captacion: new Date().toISOString(),
    }));

    // Insertar en lotes de 100
    let importados = 0;
    for (let i = 0; i < inserts.length; i += 100) {
      const lote = inserts.slice(i, i + 100);
      const { error } = await supabase.from("leads").insert(lote);
      if (!error) importados += lote.length;
    }

    setResultadoImport({ importados, omitidos: duplicados.size });
    setImportando(false);
    setPreview([]);
    setFilasBruto([]);
    cargarLeads();
  }

  const formatFecha = (str: string) => {
    const d = new Date(str);
    const hoy = new Date();
    const diff = Math.floor((hoy.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "hoy";
    if (diff === 1) return "ayer";
    if (diff < 7) return `hace ${diff} días`;
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Prospección automática</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} leads encontrados por scraping
          </p>
        </div>
        <button
          onClick={() => setMostrarConfig(!mostrarConfig)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <span>🔍</span>
          Nueva campaña
        </button>
      </div>

      {/* Barra de agentes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Agente 1 — Prospector</p>
            <p className="text-sm text-slate-700 mt-0.5">Buscar leads nuevos por zona y sector</p>
          </div>
          <button
            onClick={() => setMostrarConfig(true)}
            className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Lanzar
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Agente 4 — Enriquecedor</p>
            <p className="text-sm text-slate-700 mt-0.5">Buscar director/propietario en LinkedIn</p>
          </div>
          <button
            onClick={lanzarEnriquecimiento}
            disabled={estadoEnriquecimiento === "corriendo"}
            className="flex-shrink-0 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {estadoEnriquecimiento === "corriendo" ? "Buscando..." : estadoEnriquecimiento === "completado" ? "✓ Hecho" : "Enriquecer"}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Agente 2 — Seguimiento</p>
            <p className="text-sm text-slate-700 mt-0.5">Recordatorios automáticos y leads fríos</p>
          </div>
          <button
            onClick={lanzarSeguimiento}
            disabled={estadoSeguimiento === "corriendo"}
            className="flex-shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {estadoSeguimiento === "corriendo" ? "Ejecutando..." : estadoSeguimiento === "completado" ? "✓ Hecho" : "Ejecutar"}
          </button>
        </div>
      </div>

      {/* ── Importar Excel ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setMostrarImport(!mostrarImport)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📂</span>
            <div className="text-left">
              <p className="text-sm font-medium text-slate-800">Importar Excel / CSV</p>
              <p className="text-xs text-slate-500">Sube tu base de contactos — deduplica y clasifica automáticamente</p>
            </div>
          </div>
          <span className="text-slate-400 text-sm">{mostrarImport ? "▲" : "▼"}</span>
        </button>

        {mostrarImport && (
          <div className="border-t border-slate-100 p-5 space-y-5">

            {/* Resultado de importación */}
            {resultadoImport && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <span className="text-green-600 font-semibold text-sm">
                  ✓ {resultadoImport.importados} leads importados
                </span>
                {resultadoImport.omitidos > 0 && (
                  <span className="text-slate-500 text-xs">{resultadoImport.omitidos} duplicados omitidos</span>
                )}
                <button onClick={() => setResultadoImport(null)} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
                  Cerrar
                </button>
              </div>
            )}

            {/* Drop / selección de archivo */}
            {filasBruto.length === 0 && (
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) leerExcel(f);
                }}
              >
                <p className="text-sm text-slate-600 font-medium">Arrastra tu Excel o CSV aquí</p>
                <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar</p>
                <p className="text-xs text-slate-300 mt-3">Formatos: .xlsx, .xls, .csv</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) leerExcel(f); }}
                />
              </div>
            )}

            {/* Mapeo de columnas */}
            {filasBruto.length > 0 && preview.length === 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    {filasBruto.length} filas detectadas — mapea las columnas
                  </p>
                  <button
                    onClick={() => { setFilasBruto([]); setColumnasDetectadas([]); setMapeo({}); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {CAMPOS_LEAD.map(campo => (
                    <div key={campo.key}>
                      <label className="text-xs font-medium text-slate-600 block mb-1">{campo.label}</label>
                      <select
                        value={mapeo[campo.key] ?? ""}
                        onChange={e => setMapeo(m => ({ ...m, [campo.key]: e.target.value }))}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <option value="">— no mapear —</option>
                        {columnasDetectadas.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <p className="text-xs text-slate-400 flex-1">
                    El sistema buscará duplicados por teléfono y email antes de importar.
                  </p>
                  <button
                    onClick={aplicarMapeo}
                    disabled={!mapeo["nombre"] && !mapeo["empresa"] && !mapeo["telefono"]}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previsualizar →
                  </button>
                </div>
              </div>
            )}

            {/* Preview y confirmación */}
            {preview.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    {preview.length} contactos listos —{" "}
                    <span className="text-green-600">{preview.length - duplicados.size} nuevos</span>
                    {duplicados.size > 0 && (
                      <span className="text-amber-600 ml-1">· {duplicados.size} duplicados</span>
                    )}
                  </p>
                  <button
                    onClick={() => { setPreview([]); setFilasBruto([]); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Volver
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-slate-500 font-medium">
                        <th className="px-3 py-2 text-left">Nombre</th>
                        <th className="px-3 py-2 text-left">Empresa</th>
                        <th className="px-3 py-2 text-left">Teléfono</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {preview.slice(0, 50).map((l, i) => (
                        <tr key={i} className={duplicados.has(i) ? "bg-amber-50" : ""}>
                          <td className="px-3 py-2 text-slate-800">{l.nombre} {l.apellidos}</td>
                          <td className="px-3 py-2 text-slate-600">{l.empresa || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{l.telefono || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{l.email || "—"}</td>
                          <td className="px-3 py-2 text-center">
                            {duplicados.has(i) ? (
                              <span className="text-amber-600 font-medium">Duplicado</span>
                            ) : (
                              <span className="text-green-600 font-medium">Nuevo</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 50 && (
                    <p className="text-xs text-center text-slate-400 py-2">
                      Mostrando 50 de {preview.length} — todos se importarán
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-400">
                    Los duplicados se omitirán. Los nuevos entrarán como leads en estado "Nuevo".
                  </p>
                  <button
                    onClick={importarLeads}
                    disabled={importando || preview.length - duplicados.size === 0}
                    className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {importando ? "Importando..." : `Importar ${preview.length - duplicados.size} leads`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel configuración campaña */}
      {mostrarConfig && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="font-semibold text-slate-800">Configurar campaña de scraping</h2>

          {/* Zonas */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block">
              Zonas a prospectar
            </label>
            {/* Campo libre — barrio, CP, municipio */}
            <div>
              <input
                type="text"
                value={zonaPersonalizada}
                onChange={e => setZonaPersonalizada(e.target.value)}
                placeholder="Escribe barrios, CP o municipios separados por coma — ej: Salamanca, Retiro, 28001, Pozuelo"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">Puedes combinar barrios, códigos postales y municipios con las ciudades de abajo</p>
            </div>
            {/* Ciudades predefinidas */}
            <div className="flex flex-wrap gap-2">
              {CIUDADES_SUGERIDAS.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCiudad(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    ciudadesElegidas.includes(c)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Categorías */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
              Tipo de negocio a buscar
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIAS.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategoria(cat.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                    categoriasElegidas.includes(cat.id)
                      ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Profundidad */}
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Páginas por ciudad
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setPaginasPorCiudad(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    paginasPorCiudad === n
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">
              (~{ciudadesElegidas.length * categoriasElegidas.length * paginasPorCiudad * 10} leads estimados)
            </span>
          </div>

          {/* Filtros avanzados */}
          <div className="flex items-center gap-6 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setSoloConTelefono(!soloConTelefono)}
                className={`w-9 h-5 rounded-full transition-colors relative ${soloConTelefono ? "bg-indigo-600" : "bg-slate-200"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${soloConTelefono ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm text-slate-700">Solo leads con teléfono</span>
              <span className="text-xs text-slate-400">(descarta los que no tienen número)</span>
            </label>
          </div>

          {/* Resumen y botón */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">{ciudadesElegidas.length}</span> ciudades ×{" "}
              <span className="font-medium text-slate-700">{categoriasElegidas.length}</span> categorías
            </div>
            <div className="flex items-center gap-3">
              {mensajeCampana && (
                <span className="text-sm text-slate-600">{mensajeCampana}</span>
              )}
              <button
                onClick={lanzarCampana}
                disabled={estadoCampana === "corriendo"}
                className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {estadoCampana === "corriendo" ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Buscando...
                  </span>
                ) : "Lanzar campaña"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial de campañas */}
      {historialCampanas.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Zonas ya prospectadas</p>
            <button
              onClick={() => { setHistorialCampanas([]); localStorage.removeItem("historial_campanas"); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Limpiar historial
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {historialCampanas.slice(0, 10).map((h) => (
              <div key={`${h.zona}-${h.categoria}-${h.fecha}`} className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-4 py-2.5 items-center">
                <span className="text-sm font-medium text-slate-700">{h.zona}</span>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded w-fit">{h.categoria.replace(/_/g, " ")}</span>
                <span className="text-xs text-slate-400">{h.fecha}</span>
                <button
                  onClick={() => {
                    setZonaPersonalizada(h.zona);
                    setCategoriasElegidas([h.categoria]);
                    setMostrarConfig(true);
                  }}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Repetir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filtroFuente}
          onChange={e => setFiltroFuente(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">Todas las fuentes</option>
          <option value="scraping">Scraping</option>
          <option value="linkedin">LinkedIn</option>
          <option value="inbound">Inbound</option>
          <option value="referido">Referidos</option>
          <option value="base_existente">Base existente</option>
          <option value="manual">Manual</option>
        </select>

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">Todos los estados</option>
          <option value="nuevo">Nuevos (sin contactar)</option>
          <option value="mensaje_enviado">Contactados</option>
          <option value="respondio">Respondieron</option>
          <option value="descartado">Descartados</option>
        </select>

        <input
          type="text"
          placeholder="Ciudad..."
          value={filtroCiudad}
          onChange={e => setFiltroCiudad(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32"
        />

        <input
          type="text"
          placeholder="Sector..."
          value={filtroSector}
          onChange={e => setFiltroSector(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-36"
        />
      </div>

      {/* Acciones sobre seleccionados */}
      {seleccionados.size > 0 && (
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-indigo-700">
            {seleccionados.size} seleccionados
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={marcarContactado}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Marcar como contactados
            </button>
            <button
              onClick={descartarSeleccionados}
              className="px-4 py-1.5 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Tabla de leads */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Cabecera tabla */}
        <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <div>
            <input
              type="checkbox"
              checked={seleccionados.size === leads.length && leads.length > 0}
              onChange={seleccionarTodos}
              className="rounded border-slate-300"
            />
          </div>
          <div>Empresa / Contacto</div>
          <div>Ciudad</div>
          <div>Sector</div>
          <div>Productos</div>
          <div>Captado</div>
          <div>Acción</div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Cargando leads...</div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-slate-400 text-sm">No hay leads con estos filtros</p>
            <button
              onClick={() => setMostrarConfig(true)}
              className="text-sm text-indigo-600 hover:underline"
            >
              Lanzar una campaña de scraping
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {leads.map(lead => (
              <div
                key={lead.id}
                className={`grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-slate-50 transition-colors ${
                  seleccionados.has(lead.id) ? "bg-indigo-50" : ""
                }`}
              >
                {/* Checkbox */}
                <div>
                  <input
                    type="checkbox"
                    checked={seleccionados.has(lead.id)}
                    onChange={() => toggleSeleccion(lead.id)}
                    className="rounded border-slate-300"
                  />
                </div>

                {/* Empresa / Nombre */}
                <div>
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:text-indigo-600 text-sm transition-colors">
                    {lead.empresa || `${lead.nombre} ${lead.apellidos ?? ""}`.trim()}
                  </Link>
                  {lead.telefono_whatsapp && (
                    <p className="text-xs text-green-600 font-mono mt-0.5">{lead.telefono_whatsapp}</p>
                  )}
                  {!lead.telefono_whatsapp && lead.telefono && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{lead.telefono}</p>
                  )}
                  {!lead.telefono_whatsapp && !lead.telefono && (
                    <p className="text-xs text-amber-500 mt-0.5">Sin teléfono</p>
                  )}
                </div>

                {/* Ciudad */}
                <div className="text-sm text-slate-600">{lead.ciudad ?? "—"}</div>

                {/* Sector */}
                <div className="text-sm text-slate-600">{lead.sector ?? "—"}</div>

                {/* Productos recomendados */}
                <div className="flex flex-wrap gap-1">
                  {(lead.productos_recomendados ?? []).slice(0, 2).map(p => (
                    <span
                      key={p}
                      className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-medium"
                    >
                      {p.replace(/_/g, " ").replace("contigo ", "")}
                    </span>
                  ))}
                </div>

                {/* Fecha captación */}
                <div className="text-xs text-slate-400">{formatFecha(lead.fecha_captacion)}</div>

                {/* Acción rápida */}
                <div className="flex items-center gap-1">
                  {lead.telefono_whatsapp ? (
                    <a
                      href={`https://wa.me/${lead.telefono_whatsapp.replace("+", "")}?text=Hola%20${encodeURIComponent(lead.nombre)}%2C%20soy%20Manuel`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Abrir WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </a>
                  ) : null}
                  <Link
                    href={`/leads/${lead.id}`}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Ver ficha"
                  >
                    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {leads.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Mostrando {leads.length} de {total} leads
            </p>
            <p className="text-xs text-slate-400">
              {leads.filter(l => l.telefono_whatsapp).length} con WhatsApp ·{" "}
              {leads.filter(l => l.estado === "nuevo").length} sin contactar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
