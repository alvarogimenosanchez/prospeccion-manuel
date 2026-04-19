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

type ZonaProspectada = {
  ciudad: string;
  categoria: string;
  ultima_vez: string;
  leads_encontrados: number;
};

type CampanaHistorial = {
  id: string;
  ciudades: string[];
  categorias: string[];
  fecha_inicio: string;
  estado: string;
  leads_nuevos: number;
  leads_duplicados: number;
  coste_estimado_eur: number;
};

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


type HeaderStats = {
  total: number;
  sinContactar: number;
  estaSemana: number;
  respondieron: number;
};

export default function ProspeccionPage() {
  const [leads, setLeads] = useState<LeadNuevo[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [headerStats, setHeaderStats] = useState<HeaderStats | null>(null);

  // Filtros del listado
  const [filtroFuente, setFiltroFuente] = useState("scraping");
  const [filtroEstado, setFiltroEstado] = useState("nuevo");
  const [filtroCiudad, setFiltroCiudad] = useState("");
  const [filtroSector, setFiltroSector] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // Comercial del usuario logueado
  const [comercialId, setComercialId] = useState<string | null>(null);

  useEffect(() => {
    async function obtenerComercial() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data } = await supabase
        .from("comerciales")
        .select("id")
        .eq("email", user.email)
        .single();
      setComercialId(data?.id ?? null);
    }
    obtenerComercial();
  }, []);

  // Configuración de campaña
  const [ciudadesElegidas, setCiudadesElegidas] = useState<string[]>(["Madrid"]);
  const [zonaPersonalizada, setZonaPersonalizada] = useState("");
  const [categoriasElegidas, setCategoriasElegidas] = useState<string[]>(["inmobiliarias"]);
  const [paginasPorCiudad, setPaginasPorCiudad] = useState(2);
  const [soloConTelefono, setSoloConTelefono] = useState(false);
  const [soloConWeb, setSoloConWeb] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxAnosAbierto, setMaxAnosAbierto] = useState(0);
  const [estadoCampana, setEstadoCampana] = useState<EstadoCampana>("idle");
  const [mensajeCampana, setMensajeCampana] = useState("");
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [historialCampanas, setHistorialCampanas] = useState<{zona: string, categoria: string, fecha: string, leadsEstimados?: number}[]>([]);
  const [zonasProspectadas, setZonasProspectadas] = useState<ZonaProspectada[]>([]);
  const [historialReal, setHistorialReal] = useState<CampanaHistorial[]>([]);
  const [usoMes, setUsoMes] = useState(0);
  const [limiteMes, setLimiteMes] = useState(200);

  useEffect(() => {
    const stored = localStorage.getItem("historial_campanas");
    if (stored) setHistorialCampanas(JSON.parse(stored));
  }, []);

  const cargarZonasYUso = useCallback(async () => {
    const [{ data: zonas }, { data: campanas }] = await Promise.all([
      supabase.from("scraping_zonas").select("ciudad, categoria, ultima_vez, leads_encontrados"),
      supabase.from("scraping_campaigns").select("id, ciudades, categorias, fecha_inicio, estado, leads_nuevos, leads_duplicados, coste_estimado_eur").order("fecha_inicio", { ascending: false }).limit(10),
    ]);
    if (zonas) setZonasProspectadas(zonas as ZonaProspectada[]);
    if (campanas) setHistorialReal(campanas as CampanaHistorial[]);
  }, []);

  useEffect(() => {
    const cargarUso = async () => {
      if (!comercialId) return;
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const [{ count }, { data: comercial }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("fuente", "scraping").eq("comercial_asignado", comercialId).gte("fecha_captacion", inicioMes.toISOString()),
        supabase.from("comerciales").select("limite_leads_mes").eq("id", comercialId).single(),
      ]);
      setUsoMes(count ?? 0);
      setLimiteMes(comercial?.limite_leads_mes ?? 200);
    };
    cargarUso();
    cargarZonasYUso();
  }, [comercialId, cargarZonasYUso]);

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

  const cargarHeaderStats = useCallback(async () => {
    const semanaAtras = new Date();
    semanaAtras.setDate(semanaAtras.getDate() - 7);

    const [
      { count: totalCount },
      { count: sinContactarCount },
      { count: estaSemanaCount },
      { count: respondieronCount },
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("estado", "nuevo"),
      supabase.from("leads").select("*", { count: "exact", head: true }).gte("fecha_captacion", semanaAtras.toISOString()),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("estado", "respondio"),
    ]);

    setHeaderStats({
      total: totalCount ?? 0,
      sinContactar: sinContactarCount ?? 0,
      estaSemana: estaSemanaCount ?? 0,
      respondieron: respondieronCount ?? 0,
    });
  }, []);

  useEffect(() => { cargarLeads(); cargarHeaderStats(); }, [cargarLeads, cargarHeaderStats]);

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

  const [estadoEnriquecimiento, setEstadoEnriquecimiento] = useState<"idle"|"corriendo"|"completado">("idle");

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
    // Advertir sobre zonas re-scrapeadas recientes
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    const advertencias: string[] = [];
    for (const zona of todasLasZonas) {
      for (const cat of categoriasElegidas) {
        const existente = zonasProspectadas.find(z => z.ciudad.toLowerCase() === zona.toLowerCase() && z.categoria === cat);
        if (existente && new Date(existente.ultima_vez) > hace30Dias) {
          const dias = Math.floor((Date.now() - new Date(existente.ultima_vez).getTime()) / 86400000);
          advertencias.push(`${zona}/${cat} (hace ${dias} días, ${existente.leads_encontrados} leads)`);
        }
      }
    }
    if (advertencias.length > 0) {
      const ok = confirm(`⚠️ Las siguientes zonas ya fueron scrapeadas recientemente:\n\n${advertencias.join("\n")}\n\n¿Continuar igualmente?`);
      if (!ok) return;
    }

    setEstadoCampana("corriendo");
    setMensajeCampana("Iniciando scraping...");

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (comercialId) headers["X-Comercial-Id"] = comercialId;
      const resp = await fetch("/api/scraping/lanzar", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ciudades: todasLasZonas,
          categorias: categoriasElegidas,
          paginas: paginasPorCiudad,
          solo_con_telefono: soloConTelefono,
          solo_con_web: soloConWeb,
          min_rating: minRating > 0 ? minRating : undefined,
          max_anos_abierto: maxAnosAbierto > 0 ? maxAnosAbierto : undefined,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setEstadoCampana("completada");
        setMensajeCampana(`✅ Campaña lanzada — leads en proceso`);

        // Guardar en historial local
        const leadsEstimados = data?.nuevos_leads ?? 0;
        const porEntrada = todasLasZonas.length * categoriasElegidas.length;
        const nuevasEntradas = todasLasZonas.flatMap(zona =>
          categoriasElegidas.map(cat => ({
            zona,
            categoria: cat,
            fecha: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" }),
            leadsEstimados: porEntrada > 0 ? Math.round(leadsEstimados / porEntrada) : leadsEstimados,
          }))
        );
        const historialActualizado = [...nuevasEntradas, ...historialCampanas].slice(0, 10);
        setHistorialCampanas(historialActualizado);
        localStorage.setItem("historial_campanas", JSON.stringify(historialActualizado));

        cargarZonasYUso();
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

  function descargarPlantilla() {
    const headers = ["nombre", "apellidos", "email", "telefono", "empresa", "sector", "ciudad", "cargo", "notas"];
    const ejemplos = [
      ["María", "García López", "maria@empresa.com", "+34612345678", "Cafetería El Centro", "Hostelería", "Madrid", "Propietaria", "Tiene local propio"],
      ["Carlos", "Martínez", "carlos@asesorex.es", "+34698765432", "Asesoría Martínez SL", "Asesoría", "Barcelona", "Director", "Interesado en planes de pensión"],
      ["Ana", "Rodríguez", "", "+34677001122", "", "Inmobiliaria", "Valencia", "Agente", "Contacto frío"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplos]);
    // Ancho de columnas
    ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length + 4, 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "plantilla_importacion_leads.xlsx");
  }

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
      nivel_interes: 3,
      prioridad: "media" as const,
      fecha_captacion: new Date().toISOString(),
      ...(comercialId ? { comercial_asignado: comercialId } : {}),
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
    setFiltroFuente("base_existente");
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Prospección automática</h1>
          {headerStats ? (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{headerStats.total}</span> total
              </span>
              <span className="text-slate-300">|</span>
              <Link href="/mensajes" className="text-sm hover:underline" style={{ color: "#ea650d" }}>
                <span className="font-semibold">{headerStats.sinContactar}</span> sin contactar →
              </Link>
              <span className="text-slate-300">|</span>
              <span className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{headerStats.estaSemana}</span> esta semana
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-sm text-green-700">
                <span className="font-semibold">{headerStats.respondieron}</span> respondió
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-0.5">Cargando estadísticas...</p>
          )}
        </div>
        <button
          onClick={() => setMostrarConfig(!mostrarConfig)}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style={{ background: "#ea650d" }}
        >
          <span>🔍</span>
          Nueva campaña
        </button>
      </div>

      {/* Barra de agentes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <span>🔍</span> Buscar nuevos leads
            </p>
            <p className="text-sm text-slate-700 mt-0.5">Scraping por zona y sector</p>
            {estadoCampana === "completada" && (
              <p className="text-xs text-green-600 mt-0.5">✓ Última ejecución: hoy</p>
            )}
          </div>
          <button
            onClick={() => setMostrarConfig(true)}
            className="flex-shrink-0 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors"
            style={{ background: "#ea650d" }}
          >
            Lanzar
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <span>👤</span> Enriquecer con LinkedIn
            </p>
            <p className="text-sm text-slate-700 mt-0.5">Buscar director/propietario</p>
            {estadoEnriquecimiento === "completado" && (
              <p className="text-xs text-green-600 mt-0.5">✓ Última ejecución: hoy</p>
            )}
          </div>
          <button
            onClick={lanzarEnriquecimiento}
            disabled={estadoEnriquecimiento === "corriendo"}
            className="flex-shrink-0 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {estadoEnriquecimiento === "corriendo" ? "Buscando..." : estadoEnriquecimiento === "completado" ? "✓ Hecho" : "Enriquecer"}
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
                className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
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

            {/* Botón descargar plantilla — solo cuando no hay archivo cargado */}
            {filasBruto.length === 0 && (
              <div className="flex items-center justify-center pt-1">
                <button
                  onClick={e => { e.stopPropagation(); descargarPlantilla(); }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-orange-600 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Descargar plantilla de ejemplo (.xlsx)
                </button>
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
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
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
                    className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ background: "#ea650d" }}
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
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">Puedes combinar barrios, códigos postales y municipios con las ciudades de abajo</p>
            </div>
            {/* Ciudades predefinidas */}
            <div className="flex flex-wrap gap-2">
              {CIUDADES_SUGERIDAS.map(c => {
                const zonasCiudad = zonasProspectadas.filter(z => z.ciudad.toLowerCase() === c.toLowerCase());
                const totalLeadsCiudad = zonasCiudad.reduce((s, z) => s + z.leads_encontrados, 0);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCiudad(c)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      ciudadesElegidas.includes(c)
                        ? "text-white border-transparent"
                        : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"
                    }`}
                    style={ciudadesElegidas.includes(c) ? { background: "#ea650d" } : undefined}
                  >
                    {c}
                    {totalLeadsCiudad > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${ciudadesElegidas.includes(c) ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>
                        ✓{totalLeadsCiudad}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categorías */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Tipo de negocio a buscar
              </label>
              <button
                onClick={() => {
                  const todasSeleccionadas = CATEGORIAS.every(c => categoriasElegidas.includes(c.id));
                  setCategoriasElegidas(todasSeleccionadas ? [] : CATEGORIAS.map(c => c.id));
                }}
                className="text-xs hover:underline"
                style={{ color: "#ea650d" }}
              >
                {CATEGORIAS.every(c => categoriasElegidas.includes(c.id)) ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIAS.map(cat => {
                const totalLeadsCat = zonasProspectadas.filter(z => z.categoria === cat.id).reduce((s, z) => s + z.leads_encontrados, 0);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategoria(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                      categoriasElegidas.includes(cat.id)
                        ? "border-orange-400 text-orange-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                    style={categoriasElegidas.includes(cat.id) ? { background: "#fff5f0" } : undefined}
                  >
                    <span>{cat.icon}</span>
                    <span className="font-medium flex-1">{cat.label}</span>
                    {totalLeadsCat > 0 && (
                      <span className="text-xs text-green-600 font-semibold ml-auto">✓{totalLeadsCat}</span>
                    )}
                  </button>
                );
              })}
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
                      ? "text-white border-transparent"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                  style={paginasPorCiudad === n ? { background: "#ea650d" } : undefined}
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
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filtros de calidad</p>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setSoloConTelefono(!soloConTelefono)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${soloConTelefono ? "bg-orange-500" : "bg-slate-200"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${soloConTelefono ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <span className="text-sm text-slate-700">Solo con teléfono</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setSoloConWeb(!soloConWeb)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${soloConWeb ? "bg-orange-500" : "bg-slate-200"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${soloConWeb ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <span className="text-sm text-slate-700">Solo con web</span>
                <span className="text-xs text-slate-400">(tienen más presencia digital)</span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-700">Valoración mínima</span>
                <div className="flex gap-1">
                  {[0, 3.5, 4, 4.5].map(r => (
                    <button
                      key={r}
                      onClick={() => setMinRating(r)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        minRating === r
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {r === 0 ? "Sin filtro" : `≥${r}★`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-700">Antigüedad máx.</span>
                <div className="flex gap-1">
                  {[0, 2, 5, 10].map(y => (
                    <button
                      key={y}
                      onClick={() => setMaxAnosAbierto(y)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        maxAnosAbierto === y
                          ? "text-white border-transparent"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                      style={maxAnosAbierto === y ? { background: "#ea650d" } : undefined}
                    >
                      {y === 0 ? "Sin filtro" : `≤${y}a`}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400">(negocios más nuevos, más receptivos)</span>
              </div>
            </div>
          </div>

          {/* Uso mensual */}
          {comercialId && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-500">Uso este mes</span>
                <span className={`text-xs font-semibold ${usoMes >= limiteMes ? "text-red-600" : usoMes >= limiteMes * 0.8 ? "text-amber-600" : "text-slate-600"}`}>
                  {usoMes} / {limiteMes} leads
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((usoMes / limiteMes) * 100))}%`,
                    background: usoMes >= limiteMes ? "#dc2626" : usoMes >= limiteMes * 0.8 ? "#f59e0b" : "#ea650d",
                  }}
                />
              </div>
              {usoMes >= limiteMes && (
                <p className="text-xs text-red-600 mt-1">Límite mensual alcanzado. Contacta con tu director para ampliarlo.</p>
              )}
            </div>
          )}

          {/* Resumen y botón */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">
                <span className="font-medium text-slate-700">{ciudadesElegidas.length}</span> ciudades ×{" "}
                <span className="font-medium text-slate-700">{categoriasElegidas.length}</span> categorías
                {ciudadesElegidas.length > 0 && categoriasElegidas.length > 0 && (
                  <span className="ml-2 text-slate-400">
                    · ~{Math.max(1, Math.ceil(ciudadesElegidas.length * categoriasElegidas.length * paginasPorCiudad / 3))} min estimados
                  </span>
                )}
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

            {/* Historial reciente */}
            {historialCampanas.length > 0 && (
              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <p className="text-xs font-medium text-slate-400 px-3 py-1.5 bg-slate-50 uppercase tracking-wide">Últimas campañas</p>
                <div className="divide-y divide-slate-50">
                  {historialCampanas.slice(0, 3).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                      <span className="font-medium text-slate-700 w-24 truncate">{h.zona}</span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{h.categoria.replace(/_/g, " ")}</span>
                      {h.leadsEstimados ? <span className="text-xs font-medium" style={{ color: "#ea650d" }}>~{h.leadsEstimados} leads</span> : null}
                      <span className="text-slate-400 ml-auto">{h.fecha}</span>
                      <button
                        onClick={() => {
                          setZonaPersonalizada(h.zona);
                          setCategoriasElegidas([h.categoria]);
                        }}
                        className="hover:underline" style={{ color: "#ea650d" }}
                      >
                        Repetir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historial real de campañas desde Supabase */}
      {historialReal.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Campañas recientes</p>
          </div>
          <div className="divide-y divide-slate-50">
            {historialReal.map((c) => {
              const fecha = new Date(c.fecha_inicio).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
              const estadoBadge = c.estado === "completada"
                ? <span className="text-xs text-green-600 font-medium">✓ Completa</span>
                : c.estado === "en_curso"
                ? <span className="text-xs text-blue-600 font-medium">⏳ En curso</span>
                : <span className="text-xs text-red-500 font-medium">✗ Error</span>;
              return (
                <div key={c.id} className="px-4 py-2.5 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.ciudades.map(z => (
                        <span key={z} className="text-xs font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{z}</span>
                      ))}
                      <span className="text-slate-300">·</span>
                      {c.categorias.map(cat => (
                        <span key={cat} className="text-xs text-slate-500">{cat}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                    {c.leads_nuevos > 0 && <span className="font-semibold" style={{ color: "#ea650d" }}>{c.leads_nuevos} nuevos</span>}
                    {c.leads_duplicados > 0 && <span className="text-slate-400">{c.leads_duplicados} dup.</span>}
                    {c.coste_estimado_eur > 0 && <span className="text-slate-400">~{c.coste_estimado_eur.toFixed(2)}€</span>}
                    {estadoBadge}
                    <span className="text-slate-400">{fecha}</span>
                    <button
                      onClick={() => {
                        if (c.ciudades.length > 0) setZonaPersonalizada(c.ciudades.join(", "));
                        setCategoriasElegidas(c.categorias);
                        setMostrarConfig(true);
                      }}
                      className="text-xs hover:underline" style={{ color: "#ea650d" }}
                    >
                      Repetir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zonas ya prospectadas (fallback localStorage) */}
      {historialReal.length === 0 && historialCampanas.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Zonas ya prospectadas</p>
            <button
              onClick={() => { setHistorialCampanas([]); localStorage.removeItem("historial_campanas"); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Limpiar
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {historialCampanas.slice(0, 10).map((h) => (
              <div key={`${h.zona}-${h.categoria}-${h.fecha}`} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-2.5 items-center">
                <span className="text-sm font-medium text-slate-700">{h.zona}</span>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded w-fit">{h.categoria.replace(/_/g, " ")}</span>
                {h.leadsEstimados ? <span className="text-xs font-semibold" style={{ color: "#ea650d" }}>~{h.leadsEstimados}</span> : <span />}
                <span className="text-xs text-slate-400">{h.fecha}</span>
                <button
                  onClick={() => {
                    setZonaPersonalizada(h.zona);
                    setCategoriasElegidas([h.categoria]);
                    setMostrarConfig(true);
                  }}
                  className="text-xs hover:underline" style={{ color: "#ea650d" }}
                >Repetir</button>
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
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
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
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          <option value="">Todos los estados</option>
          <option value="nuevo">Nuevos (sin contactar)</option>
          <option value="mensaje_enviado">Contactados</option>
          <option value="respondio">Respondieron</option>
          <option value="cita_agendada">Cita agendada</option>
          <option value="en_negociacion">En negociación</option>
          <option value="descartado">Descartados</option>
        </select>

        <input
          type="text"
          placeholder="Ciudad..."
          value={filtroCiudad}
          onChange={e => setFiltroCiudad(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 w-32"
        />

        <input
          type="text"
          placeholder="Sector..."
          value={filtroSector}
          onChange={e => setFiltroSector(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 w-36"
        />
      </div>

      {/* Acciones sobre seleccionados */}
      {seleccionados.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "#fff5f0", border: "1px solid #f5a677" }}>
          <span className="text-sm font-medium" style={{ color: "#c2530b" }}>
            {seleccionados.size} seleccionados
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Link
              href="/mensajes"
              onClick={async () => {
                await fetch("/api/backend/mensajes/generar", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ limite: seleccionados.size }),
                });
              }}
              className="px-4 py-1.5 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
              style={{ background: "#7c3aed" }}
            >
              ✦ Generar mensajes IA
            </Link>
            <button
              onClick={marcarContactado}
              className="px-4 py-1.5 text-white text-sm font-medium rounded-lg transition-colors"
              style={{ background: "#ea650d" }}
            >
              Marcar contactados
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
              className="text-sm hover:underline" style={{ color: "#ea650d" }}
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
                  seleccionados.has(lead.id) ? "bg-orange-50" : ""
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
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 text-sm transition-colors hover:opacity-70">
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
