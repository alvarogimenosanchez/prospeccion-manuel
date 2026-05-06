"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlantillaWA {
  id: string;
  titulo: string;
  contenido: string;
  descripcion: string | null;
  categoria: string | null;
  es_global: boolean;
  orden: number; // 0 = por defecto
  creado_por: string;
  created_at: string;
}

// ── Variables disponibles ──────────────────────────────────────────────────────
const VARIABLES = [
  { key: "{{nombre}}", label: "Nombre", ejemplo: "María García" },
  { key: "{{empresa}}", label: "Empresa", ejemplo: "Cafetería El Sol" },
  { key: "{{ciudad}}", label: "Ciudad", ejemplo: "Málaga" },
  { key: "{{sector}}", label: "Sector", ejemplo: "Hostelería" },
  { key: "{{producto}}", label: "Producto", ejemplo: "Contigo Autónomo" },
  { key: "{{cargo}}", label: "Cargo", ejemplo: "Propietaria" },
];

const EJEMPLO_LEAD = {
  "{{nombre}}": "María García",
  "{{empresa}}": "Cafetería El Sol",
  "{{ciudad}}": "Málaga",
  "{{sector}}": "Hostelería",
  "{{producto}}": "Contigo Autónomo",
  "{{cargo}}": "Propietaria",
};

function aplicarVariables(texto: string): string {
  let resultado = texto;
  for (const [key, val] of Object.entries(EJEMPLO_LEAD)) {
    resultado = resultado.replaceAll(key, val);
  }
  return resultado;
}

// ── Plantillas profesionales predefinidas ─────────────────────────────────────
const PLANTILLAS_PREDEFINIDAS = [
  {
    titulo: "Hostelería — Primer contacto",
    descripcion: "Autónomos de bar, restaurante o cafetería. Producto: Contigo Autónomo.",
    categoria: "Primer contacto",
    contenido: `Hola {{nombre}}! Vi que tienes {{empresa}} en {{ciudad}} y quería comentarte algo.

¿Sabes que si un día te encuentras mal y no puedes abrir, dejarías de ingresar ese día? Tengo un seguro desde 5€/mes que te cubre desde el primer día de baja, incluidos accidentes.

¿Tienes 5 minutos para que te lo cuente?`,
  },
  {
    titulo: "Taller / Peluquería — Primer contacto",
    descripcion: "Autónomos con trabajo manual. Riesgo de accidente alto. Precio muy competitivo.",
    categoria: "Primer contacto",
    contenido: `Hola {{nombre}}, soy Manuel de Nationale-Nederlanden.

Vi que tienes {{empresa}} en {{ciudad}}. Como autónomo con trabajo físico, si un día te lesionas y no puedes trabajar, no hay ingresos. Tenemos un seguro que cubre eso desde 4€/mes, desde el primer día.

¿Tienes un momento para que te lo explique?`,
  },
  {
    titulo: "Clínica / Salud — Primer contacto",
    descripcion: "Propietarios de clínica o consulta médica. Si el titular no trabaja, la consulta para.",
    categoria: "Primer contacto",
    contenido: `Hola {{nombre}}, vi que tenéis {{empresa}} en {{ciudad}} y quería compartiros algo.

Como propietario de una clínica, si el médico titular cae de baja un día, la consulta para. Tenemos seguros específicos para proteger esos ingresos desde el primer día.

¿Tienes 5 minutos para que te lo explique?`,
  },
  {
    titulo: "Asesoría / Gestoría — Colaboración",
    descripcion: "Prescriptores. Ofrecerles Contigo Autónomo para su cartera de clientes autónomos.",
    categoria: "Colaboración",
    contenido: `Hola {{nombre}}, soy Manuel de Nationale-Nederlanden.

Muchos de vuestros clientes autónomos no saben que si se ponen enfermos y no pueden trabajar, no cobran nada. Tenemos un seguro desde 5€/mes que cubre eso.

¿Os interesaría ofrecerlo como valor añadido a vuestra cartera? Hablaríamos de una comisión por cada cliente. Sin compromiso.`,
  },
  {
    titulo: "Inmobiliaria — Hipotecas y colaboración",
    descripcion: "Canal de derivación. Comisión por cada cliente que necesite hipoteca.",
    categoria: "Colaboración",
    contenido: `Hola {{nombre}}, te escribo de Nationale-Nederlanden España.

Trabajo con varias inmobiliarias en {{ciudad}} y les ofrecemos un acuerdo de colaboración: cuando uno de vuestros clientes necesita hipoteca, lo gestionamos nosotros y vosotros recibís una comisión por cada operación.

¿Te interesaría conocer cómo funciona?`,
  },
  {
    titulo: "PYME — Seguro colectivo empleados",
    descripcion: "Empresa con plantilla. Contigo Pyme: vida+accidente para todo el equipo, gasto deducible.",
    categoria: "Primer contacto",
    contenido: `Hola {{nombre}}, te escribo de Nationale-Nederlanden.

Tenéis equipo en {{empresa}} y quería presentaros algo que muchas empresas ya usan: seguro colectivo de vida y accidente para toda la plantilla, sin reconocimiento médico. Es gasto deducible y un beneficio muy valorado por los empleados.

¿Tienes 10 minutos esta semana para que os lo presente?`,
  },
  {
    titulo: "Seguimiento — Sin respuesta",
    descripcion: "Lead que no respondió al primer mensaje. Tono suave, sin presión.",
    categoria: "Seguimiento",
    contenido: `Hola {{nombre}}, soy Manuel de Nationale-Nederlanden. Te escribí hace unos días, entiendo que igual no era buen momento.

Si en algún momento quieres que te cuente cómo proteger tus ingresos en caso de baja o accidente, aquí estoy.

¿Hay algún momento mejor para hablar?`,
  },
  {
    titulo: "Seguimiento — Después de llamada",
    descripcion: "Recordatorio post-llamada. Mantener el interés y facilitar el siguiente paso.",
    categoria: "Seguimiento",
    contenido: `Hola {{nombre}}, encantado de hablar contigo hace un momento.

Te confirmo lo que comentamos: {{producto}} cubre exactamente lo que necesitas y el coste es muy asequible. Te preparo una propuesta personalizada sin compromiso.

¿Te va bien esta semana para que te la presente?`,
  },
];

const CONFIG_DEFAULT = `{
  "titulo": "Descubre qué producto financiero se adapta a ti",
  "subtitulo": "Responde 5 preguntas y te recomiendo exactamente lo que necesitas. Sin compromiso, gratis.",
  "nombre_asesor": "Manuel García",
  "cargo_asesor": "Asesor Financiero · Nationale-Nederlanden",
  "pasos": [
    {
      "id": "situacion",
      "titulo": "¿Cuál es tu situación?",
      "subtitulo": "Elige la opción que mejor te describe",
      "opciones": [
        { "valor": "autonomo", "etiqueta": "Soy autónomo o freelance", "descripcion": "Trabajas por cuenta propia", "emoji": "🧑‍💼" },
        { "valor": "pyme", "etiqueta": "Tengo una empresa con empleados", "descripcion": "Eres empresario o diriges un equipo", "emoji": "🏢" },
        { "valor": "particular", "etiqueta": "Soy empleado / particular", "descripcion": "Trabajas por cuenta ajena", "emoji": "👨‍👩‍👧" },
        { "valor": "hipoteca", "etiqueta": "Busco financiación o hipoteca", "descripcion": "Quieres comprar vivienda", "emoji": "🏠" }
      ]
    },
    {
      "id": "preocupaciones",
      "titulo": "¿Qué te preocupa más?",
      "subtitulo": "Puedes elegir varias opciones",
      "opciones": [
        { "id": "no_trabajar", "emoji": "🤒", "texto": "Qué pasa si me pongo enfermo y no puedo trabajar" },
        { "id": "familia", "emoji": "👨‍👩‍👧", "texto": "Dejar protegida económicamente a mi familia" },
        { "id": "accidente", "emoji": "🦺", "texto": "Protegerme ante un accidente grave" },
        { "id": "ahorro", "emoji": "💰", "texto": "Ahorrar o invertir de forma segura" },
        { "id": "medico", "emoji": "🏥", "texto": "Tener médico privado sin esperas" },
        { "id": "hipoteca", "emoji": "🏠", "texto": "Comprar una vivienda o conseguir hipoteca" },
        { "id": "irpf", "emoji": "📉", "texto": "Pagar menos impuestos (IRPF)" }
      ]
    },
    {
      "id": "datos",
      "titulo": "Un poco más sobre ti",
      "subtitulo": "Para que Manuel pueda contactarte",
      "campos": ["nombre", "telefono", "ciudad", "tiene_hijos", "tiene_hipoteca", "mayor_55"]
    },
    {
      "id": "urgencia",
      "titulo": "¿Cuándo prefieres que te contactemos?",
      "subtitulo": "Manuel se ajusta a tu ritmo",
      "opciones": [
        { "valor": "hoy_manana", "emoji": "⚡", "titulo": "Lo antes posible", "desc": "Hoy o mañana" },
        { "valor": "esta_semana", "emoji": "📅", "titulo": "Esta semana, sin prisa", "desc": "En los próximos días" },
        { "valor": "dos_tres_semanas", "emoji": "🗓️", "titulo": "En 2-3 semanas", "desc": "Cuando sea conveniente" }
      ]
    }
  ]
}`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function AjustesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando…</div>}>
      <AjustesContent />
    </Suspense>
  );
}

function AjustesContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [miComercialId, setMiComercialId] = useState<string | null>(null);
  const [miNombre, setMiNombre] = useState("");
  const [plantillas, setPlantillas] = useState<PlantillaWA[]>([]);
  const [cargando, setCargando] = useState(true);
  const tabFromUrl = searchParams.get("tab") as "plantillas" | "cuestionario" | "formularios" | "scraping" | "roles" | "productos" | null;
  const validTabs = ["plantillas", "cuestionario", "formularios", "scraping", "roles", "productos"];
  const [tabActiva, setTabActiva] = useState<"plantillas" | "cuestionario" | "formularios" | "scraping" | "roles" | "productos">(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "plantillas"
  );
  const [productos, setProductos] = useState<{ id: string; nombre: string; comision_pct: number | null; activo: boolean }[]>([]);
  const [guardandoProducto, setGuardandoProducto] = useState<string | null>(null);
  const [comisionEdits, setComisionEdits] = useState<Record<string, string>>({});
  const [formularios, setFormularios] = useState<{id:string;slug:string;nombre:string;titulo:string;subtitulo:string|null;emoji:string;color_hex:string;pedir_email:boolean;pedir_ciudad:boolean;texto_cta:string;activo:boolean}[]>([]);
  const [editandoFormId, setEditandoFormId] = useState<string|null>(null);
  const [fTitulo, setFTitulo] = useState(""); const [fSubtitulo, setFSubtitulo] = useState(""); const [fTextoCta, setFTextoCta] = useState(""); const [fPedirEmail, setFPedirEmail] = useState(false); const [fActivo, setFActivo] = useState(true);
  const [guardandoForm, setGuardandoForm] = useState(false);
  const [esDirector, setEsDirector] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [comercialesLimites, setComerciales] = useState<{id: string; nombre: string; email: string; limite_leads_mes: number; usoMes?: number}[]>([]);
  const [rolePermisos, setRolePermisos] = useState<{ rol: string; permiso: string; activo: boolean }[]>([]);
  const [comercialesRoles, setComercialRoles] = useState<{ id: string; nombre: string; apellidos: string | null; email: string | null; rol: string }[]>([]);
  const [guardandoPermiso, setGuardandoPermiso] = useState<string | null>(null);
  const [guardandoRolId, setGuardandoRolId] = useState<string | null>(null);
  const [guardandoLimite, setGuardandoLimite] = useState<string | null>(null);
  const [configCuestionario, setConfigCuestionario] = useState(CONFIG_DEFAULT);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [configOk, setConfigOk] = useState(false);
  const [errorConfig, setErrorConfig] = useState("");

  // Form state
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formTitulo, setFormTitulo] = useState("");
  const [formTexto, setFormTexto] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formGlobal, setFormGlobal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [importando, setImportando] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load comercial ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        supabase
          .from("comerciales")
          .select("id, nombre, rol")
          .eq("email", data.user.email)
          .single()
          .then(({ data: c }) => {
            if (c) {
              setMiComercialId(c.id);
              setMiNombre(c.nombre);
              if (c.rol === "director" || c.rol === "admin" || c.rol === "manager") {
                setEsDirector(true);
                cargarComerciales();
                cargarProductos();
              }
              if (c.rol === "admin") {
                setEsAdmin(true);
                cargarRolePermisos();
                cargarComercialRoles();
              }
            }
          });
      }
    });
  }, []);

  // ── Load comerciales (director only) ────────────────────────────────────────
  async function cargarComerciales() {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("comerciales").select("id, nombre, email, limite_leads_mes").eq("activo", true).order("nombre");
    if (!data) return;
    const ids = data.map(c => c.id);
    const usos: Record<string, number> = {};
    for (const id of ids) {
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("fuente", "scraping").eq("comercial_asignado", id).gte("fecha_captacion", inicioMes.toISOString());
      usos[id] = count ?? 0;
    }
    setComerciales(data.map(c => ({ ...c, limite_leads_mes: c.limite_leads_mes ?? 200, usoMes: usos[c.id] ?? 0 })));
  }

  async function actualizarLimite(id: string, nuevoLimite: number) {
    setGuardandoLimite(id);
    await supabase.from("comerciales").update({ limite_leads_mes: nuevoLimite }).eq("id", id);
    setComerciales(prev => prev.map(c => c.id === id ? { ...c, limite_leads_mes: nuevoLimite } : c));
    setGuardandoLimite(null);
  }

  async function cargarProductos() {
    const { data } = await supabase.from("products").select("id, nombre, comision_pct, activo").order("nombre");
    if (data) {
      setProductos(data as { id: string; nombre: string; comision_pct: number | null; activo: boolean }[]);
      const edits: Record<string, string> = {};
      for (const p of data) edits[p.id] = String(p.comision_pct ?? 20);
      setComisionEdits(edits);
    }
  }

  async function guardarComision(id: string) {
    setGuardandoProducto(id);
    const pct = parseFloat(comisionEdits[id] ?? "20");
    await supabase.from("products").update({ comision_pct: isNaN(pct) ? 20 : pct }).eq("id", id);
    setProductos(prev => prev.map(p => p.id === id ? { ...p, comision_pct: pct } : p));
    setGuardandoProducto(null);
  }

  async function cargarRolePermisos() {
    const { data } = await supabase.from("role_permissions").select("rol, permiso, activo").order("rol").order("permiso");
    if (data) setRolePermisos(data);
  }

  async function cargarComercialRoles() {
    const { data } = await supabase.from("comerciales").select("id, nombre, apellidos, email, rol").eq("activo", true).order("nombre");
    if (data) setComercialRoles(data);
  }

  async function togglePermiso(rol: string, permiso: string, nuevoActivo: boolean) {
    if (rol === "admin") return; // admin always has all permissions
    const key = `${rol}:${permiso}`;
    setGuardandoPermiso(key);
    await supabase.from("role_permissions").update({ activo: nuevoActivo, updated_at: new Date().toISOString() }).eq("rol", rol).eq("permiso", permiso);
    setRolePermisos(prev => prev.map(p => p.rol === rol && p.permiso === permiso ? { ...p, activo: nuevoActivo } : p));
    setGuardandoPermiso(null);
  }

  async function cambiarRolComercial(id: string, nuevoRol: string) {
    setGuardandoRolId(id);
    await supabase.from("comerciales").update({ rol: nuevoRol }).eq("id", id);
    setComercialRoles(prev => prev.map(c => c.id === id ? { ...c, rol: nuevoRol } : c));
    setGuardandoRolId(null);
  }

  // ── Load plantillas ─────────────────────────────────────────────────────────
  async function cargarFormularios() {
    const { data } = await supabase.from("formularios_captacion").select("id,slug,nombre,titulo,subtitulo,emoji,color_hex,pedir_email,pedir_ciudad,texto_cta,activo").order("created_at");
    if (data) setFormularios(data as typeof formularios);
  }

  async function cargarPlantillas(cid: string) {
    const { data } = await supabase
      .from("recursos_rapidos")
      .select("*")
      .eq("tipo", "plantilla_wa")
      .or(`es_global.eq.true,creado_por.eq.${cid}`)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setPlantillas(data as PlantillaWA[]);
    setCargando(false);
  }

  useEffect(() => {
    if (miComercialId) {
      cargarPlantillas(miComercialId);
      cargarConfig();
      cargarFormularios();
    }
  }, [miComercialId]);

  async function cargarConfig() {
    const { data } = await supabase
      .from("recursos_rapidos")
      .select("contenido")
      .eq("tipo", "cuestionario_config")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.contenido) setConfigCuestionario(data.contenido);
  }

  async function guardarConfig() {
    if (!miComercialId) return;
    setErrorConfig("");
    try { JSON.parse(configCuestionario); } catch {
      setErrorConfig("JSON no válido — revisa la sintaxis antes de guardar."); return;
    }
    setGuardandoConfig(true);
    const { data: existing } = await supabase
      .from("recursos_rapidos").select("id").eq("tipo", "cuestionario_config").maybeSingle();
    const payload = {
      titulo: "Config cuestionario captación",
      tipo: "cuestionario_config",
      contenido: configCuestionario,
      es_global: true,
      creado_por: miComercialId,
      orden: 0,
    };
    if (existing) {
      await supabase.from("recursos_rapidos").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("recursos_rapidos").insert(payload);
    }
    setGuardandoConfig(false);
    setConfigOk(true);
    setTimeout(() => setConfigOk(false), 3000);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function abrirNueva() {
    setEditandoId(null);
    setFormTitulo("");
    setFormTexto("");
    setFormDescripcion("");
    setFormGlobal(false);
    setModalAbierto(true);
  }

  function abrirEditar(p: PlantillaWA) {
    setEditandoId(p.id);
    setFormTitulo(p.titulo);
    setFormTexto(p.contenido);
    setFormDescripcion(p.descripcion ?? "");
    setFormGlobal(p.es_global);
    setModalAbierto(true);
  }

  function insertarVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const nuevoTexto = formTexto.slice(0, start) + variable + formTexto.slice(end);
    setFormTexto(nuevoTexto);
    // Reposicionar cursor
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  async function guardar() {
    if (!formTitulo.trim() || !formTexto.trim() || !miComercialId) return;
    setGuardando(true);

    const payload = {
      titulo: formTitulo.trim(),
      tipo: "plantilla_wa",
      contenido: formTexto.trim(),
      descripcion: formDescripcion.trim() || null,
      es_global: formGlobal,
      categoria: "WhatsApp",
    };

    if (editandoId) {
      await supabase.from("recursos_rapidos").update(payload).eq("id", editandoId);
    } else {
      await supabase.from("recursos_rapidos").insert({
        ...payload,
        creado_por: miComercialId,
        orden: plantillas.length, // nuevas van al final
      });
    }

    await cargarPlantillas(miComercialId);
    setModalAbierto(false);
    setGuardando(false);
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await supabase.from("recursos_rapidos").delete().eq("id", id);
    setPlantillas((prev) => prev.filter((p) => p.id !== id));
  }

  async function marcarDefault(id: string) {
    if (!miComercialId) return;
    // Todas a orden 1, la elegida a orden 0
    await Promise.all(
      plantillas.map((p) =>
        supabase
          .from("recursos_rapidos")
          .update({ orden: p.id === id ? 0 : 1 })
          .eq("id", p.id)
      )
    );
    setPlantillas((prev) =>
      prev.map((p) => ({ ...p, orden: p.id === id ? 0 : 1 }))
    );
  }

  async function importarPredefinidas() {
    if (!miComercialId) return;
    if (!confirm(`¿Importar ${PLANTILLAS_PREDEFINIDAS.length} plantillas profesionales? Se añadirán a las existentes.`)) return;
    setImportando(true);
    await supabase.from("recursos_rapidos").insert(
      PLANTILLAS_PREDEFINIDAS.map((p, i) => ({
        titulo: p.titulo,
        tipo: "plantilla_wa",
        contenido: p.contenido,
        descripcion: p.descripcion,
        categoria: p.categoria,
        es_global: true,
        creado_por: miComercialId,
        orden: plantillas.length + i + 1,
      }))
    );
    await cargarPlantillas(miComercialId);
    setImportando(false);
  }

  async function copiarTexto(texto: string) {
    await navigator.clipboard.writeText(texto);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", maxWidth: 672 }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-normal" style={{ color: "#414141" }}>
          Ajustes
        </h1>
        {miNombre && (
          <p className="text-sm mt-0.5" style={{ color: "#a09890" }}>
            Configuración personal de {miNombre}
          </p>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(([
          { id: "plantillas",   label: "Plantillas WA" },
          { id: "formularios",  label: "Formularios de captación" },
          { id: "cuestionario", label: "Cuestionario" },
          ...(esDirector ? [{ id: "scraping" as const, label: "Límites scraping" }] : []),
          ...(esDirector ? [{ id: "productos" as const, label: "Productos" }] : []),
          ...(esAdmin ? [{ id: "roles" as const, label: "Roles y permisos" }] : []),
        ]) as { id: "plantillas" | "cuestionario" | "formularios" | "scraping" | "roles"; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTabActiva(t.id)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: tabActiva === t.id ? 600 : 400,
              color: tabActiva === t.id ? "#ea650d" : "#6b6560",
              background: "transparent",
              border: "none",
              borderBottom: tabActiva === t.id ? "2px solid #ea650d" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
              transition: "color 0.1s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Sección plantillas WhatsApp ────────────────────────────────────── */}
      {tabActiva === "plantillas" && <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Section header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5ded9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#16a34a">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#414141" }}>
                Plantillas de WhatsApp
              </p>
              <p className="text-xs" style={{ color: "#a09890" }}>
                Mensajes que se usan al enviar WA a un lead
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={importarPredefinidas}
              disabled={importando}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50"
              style={{ borderColor: "#e5ded9", color: "#6b6560", background: "#faf8f6" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#ea650d"; e.currentTarget.style.color = "#ea650d"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5ded9"; e.currentTarget.style.color = "#6b6560"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              {importando ? "Importando..." : "Importar predefinidas"}
            </button>
            <button
              onClick={abrirNueva}
              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva plantilla
            </button>
          </div>
        </div>

        {/* Variable guide */}
        <div
          style={{
            padding: "10px 20px",
            background: "#faf8f6",
            borderBottom: "1px solid #f0ebe7",
          }}
        >
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#6b6560" }}>
            Variables disponibles — se sustituyen automáticamente con los datos del lead:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <span
                key={v.key}
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "#fff5f0",
                  color: "#ea650d",
                  border: "1px solid #f5c5a8",
                }}
              >
                {v.key}
              </span>
            ))}
          </div>
        </div>

        {/* Plantillas list */}
        {cargando ? (
          <div className="py-12 text-center text-sm" style={{ color: "#a09890" }}>
            Cargando plantillas...
          </div>
        ) : plantillas.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f5f0ec", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              💬
            </div>
            <p className="text-sm font-medium" style={{ color: "#414141" }}>Sin plantillas todavía</p>
            <p className="text-xs text-center max-w-xs" style={{ color: "#a09890" }}>
              Importa las plantillas profesionales ya escritas para los sectores principales, o crea una desde cero.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={importarPredefinidas}
                disabled={importando}
                className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                {importando ? "Importando..." : `Importar ${PLANTILLAS_PREDEFINIDAS.length} plantillas profesionales`}
              </button>
              <button onClick={abrirNueva} className="btn-secondary px-4 py-2 text-sm">
                Crear desde cero
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Agrupar por categoría */}
            {(() => {
              const sorted = [...plantillas].sort((a, b) => a.orden - b.orden);
              const categorias = [...new Set(sorted.map(p => p.categoria ?? "General"))];
              return categorias.map(cat => {
                const grupo = sorted.filter(p => (p.categoria ?? "General") === cat);
                return (
                  <div key={cat}>
                    <div style={{ padding: "8px 20px 4px", background: "#faf8f6", borderBottom: "1px solid #f0ebe7", borderTop: "1px solid #f0ebe7" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#a09890", textTransform: "uppercase", letterSpacing: "0.12em" }}>{cat}</p>
                    </div>
                    {grupo.map((p, i) => (
                      <div key={p.id} style={{
                        padding: "16px 20px",
                        borderBottom: i < grupo.length - 1 ? "1px solid #f0ebe7" : "none",
                  background: p.orden === 0 ? "#fffbf8" : "#ffffff",
                }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.orden === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 9999,
                          background: "#ea650d",
                          color: "#ffffff",
                          flexShrink: 0,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        Por defecto
                      </span>
                    )}
                    <p className="text-sm font-semibold truncate" style={{ color: "#414141" }}>
                      {p.titulo}
                    </p>
                    {p.es_global && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 9999,
                          background: "#f0ebe7",
                          color: "#6b6560",
                          flexShrink: 0,
                        }}
                      >
                        Compartida
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.orden !== 0 && (
                      <button
                        onClick={() => marcarDefault(p.id)}
                        title="Marcar como plantilla por defecto"
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          borderRadius: 4,
                          border: "1px solid #e5ded9",
                          background: "#ffffff",
                          color: "#6b6560",
                          cursor: "pointer",
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#ea650d";
                          e.currentTarget.style.color = "#ea650d";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#e5ded9";
                          e.currentTarget.style.color = "#6b6560";
                        }}
                      >
                        ★ Hacer default
                      </button>
                    )}
                    <button
                      onClick={() => abrirEditar(p)}
                      title="Editar"
                      style={{
                        padding: "5px 7px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#a09890",
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#414141")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => eliminar(p.id)}
                      title="Eliminar"
                      style={{
                        padding: "5px 7px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#a09890",
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {p.descripcion && (
                  <p className="text-xs mb-2" style={{ color: "#6b6560" }}>
                    {p.descripcion}
                  </p>
                )}

                {/* Message preview */}
                <div
                  style={{
                    background: "#f5f0ec",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#414141",
                    lineHeight: "18px",
                    whiteSpace: "pre-wrap",
                    maxHeight: 90,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {aplicarVariables(p.contenido)}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 28,
                      background: "linear-gradient(transparent, #f5f0ec)",
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => copiarTexto(aplicarVariables(p.contenido))}
                    style={{
                      fontSize: 11,
                      color: "#a09890",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 0",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#414141")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copiar (con datos de ejemplo)
                  </button>
                  <span style={{ color: "#e5ded9", fontSize: 10 }}>·</span>
                  <button
                    onClick={() => copiarTexto(p.contenido)}
                    style={{
                      fontSize: 11,
                      color: "#a09890",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 0",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#414141")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                  >
                    Copiar con variables
                  </button>
                </div>
              </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      }

      {/* ── Sección cuestionario ───────────────────────────────────────────── */}
      {tabActiva === "cuestionario" && (
        <div className="space-y-4">
          {/* Info + enlace */}
          <div className="card" style={{ padding: "16px 20px" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: "#414141" }}>Formulario público de captación</p>
                <p className="text-xs mt-0.5" style={{ color: "#a09890" }}>
                  Comparte este enlace en redes sociales, email o WhatsApp para captar leads automáticamente
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="text-xs px-2 py-1 rounded" style={{ background: "#f5f0ec", color: "#ea650d" }}>
                    prospeccion-manuel.vercel.app/captacion
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText("https://prospeccion-manuel.vercel.app/captacion")}
                    className="text-xs font-medium hover:underline" style={{ color: "#ea650d" }}>
                    Copiar
                  </button>
                </div>
              </div>
              <a href="/captacion" target="_blank" rel="noopener noreferrer"
                className="btn-primary px-3 py-1.5 text-xs flex-shrink-0 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                Ver formulario
              </a>
            </div>
          </div>

          {/* Editor JSON */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5ded9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#414141" }}>Configuración del cuestionario</p>
                <p className="text-xs mt-0.5" style={{ color: "#a09890" }}>
                  Edita los textos, opciones y pasos del formulario público en formato JSON
                </p>
              </div>
              <div className="flex items-center gap-2">
                {configOk && (
                  <span className="text-xs font-medium" style={{ color: "#16a34a" }}>✓ Guardado</span>
                )}
                <button
                  onClick={() => setConfigCuestionario(CONFIG_DEFAULT)}
                  className="btn-secondary px-3 py-1.5 text-xs">
                  Restaurar por defecto
                </button>
                <button
                  onClick={guardarConfig}
                  disabled={guardandoConfig}
                  className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                  {guardandoConfig ? "Guardando..." : "Guardar config"}
                </button>
              </div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              {errorConfig && (
                <p className="text-xs mb-2 px-3 py-2 rounded" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                  ⚠ {errorConfig}
                </p>
              )}
              <textarea
                value={configCuestionario}
                onChange={e => { setConfigCuestionario(e.target.value); setErrorConfig(""); }}
                rows={30}
                spellCheck={false}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: 12,
                  lineHeight: "18px",
                  padding: "12px",
                  border: "1px solid #e5ded9",
                  borderRadius: 4,
                  background: "#faf8f6",
                  color: "#414141",
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <p className="text-xs mt-2" style={{ color: "#c7bdb7" }}>
                El formulario en <code>/captacion</code> cargará esta configuración automáticamente (requiere actualización del código).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editor ───────────────────────────────────────────────────── */}
      {modalAbierto && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, background: "rgba(0,0,0,0.45)", zIndex: 9999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalAbierto(false); }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 640,
              padding: 0,
              overflow: "hidden",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e5ded9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "#414141" }}>
                {editandoId ? "Editar plantilla" : "Nueva plantilla de WhatsApp"}
              </h2>
              <button
                onClick={() => setModalAbierto(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a09890", padding: 4 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1" style={{ padding: "20px" }}>
              <div className="space-y-4">
                {/* Título */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6560" }}>
                    Nombre de la plantilla *
                  </label>
                  <input
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    placeholder="Ej: Presentación inicial, Recordatorio, Cierre..."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5ded9",
                      borderRadius: 4,
                      fontSize: 14,
                      color: "#414141",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6560" }}>
                    Descripción (cuándo usarla)
                  </label>
                  <input
                    value={formDescripcion}
                    onChange={(e) => setFormDescripcion(e.target.value)}
                    placeholder="Ej: Primer contacto con autónomos del sector hostelería"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5ded9",
                      borderRadius: 4,
                      fontSize: 14,
                      color: "#414141",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Variable insert buttons */}
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "#6b6560" }}>
                    Insertar variable en el cursor
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertarVariable(v.key)}
                        title={`Ejemplo: ${v.ejemplo}`}
                        style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: "#fff5f0",
                          color: "#ea650d",
                          border: "1px solid #f5c5a8",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fee5cc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff5f0")}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6560" }}>
                    Mensaje *
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={formTexto}
                    onChange={(e) => setFormTexto(e.target.value)}
                    rows={7}
                    placeholder={`Hola {{nombre}},\n\nMe llamo Manuel y soy asesor de Nationale-Nederlanden. Vi que tienes {{empresa}} en {{ciudad}}...\n\n¿Tienes 5 minutos para comentarte algo?`}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #e5ded9",
                      borderRadius: 4,
                      fontSize: 13,
                      color: "#414141",
                      outline: "none",
                      resize: "vertical",
                      lineHeight: "19px",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: "#c7bdb7" }}>
                    {formTexto.length} caracteres
                  </p>
                </div>

                {/* Preview */}
                {formTexto.trim() && (
                  <div>
                    <label className="text-xs font-semibold block mb-1.5" style={{ color: "#6b6560" }}>
                      Vista previa con datos de ejemplo
                    </label>
                    <div
                      style={{
                        background: "#e9fbe5",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        padding: "12px 14px",
                        fontSize: 13,
                        color: "#166534",
                        lineHeight: "20px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {aplicarVariables(formTexto)}
                    </div>
                  </div>
                )}

                {/* Visibilidad */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setFormGlobal((v) => !v)}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 9999,
                      background: formGlobal ? "#ea650d" : "#e5ded9",
                      border: "none",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: formGlobal ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#ffffff",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                  <p className="text-sm" style={{ color: "#414141" }}>
                    {formGlobal ? "Compartida con todo el equipo" : "Solo para mí"}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid #e5ded9",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setModalAbierto(false)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!formTitulo.trim() || !formTexto.trim() || guardando}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Crear plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Sección scraping límites (solo director) ──────────────────────── */}
      {tabActiva === "scraping" && esDirector && (
        <div className="space-y-4">
          <div className="card" style={{ padding: "16px 20px" }}>
            <p className="text-sm font-semibold mb-1" style={{ color: "#414141" }}>Control de uso mensual por comercial</p>
            <p className="text-xs mb-4" style={{ color: "#a09890" }}>
              Cada comercial tiene un límite de leads captados por scraping al mes. Al alcanzarlo, el sistema bloquea nuevas campañas hasta el mes siguiente.
            </p>
            {comercialesLimites.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Cargando...</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {comercialesLimites.map(c => {
                  const pct = Math.min(100, Math.round(((c.usoMes ?? 0) / c.limite_leads_mes) * 100));
                  return (
                    <div key={c.id} className="py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                        <p className="text-xs text-slate-400">{c.email}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: pct >= 100 ? "#dc2626" : pct >= 80 ? "#f59e0b" : "#ea650d",
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{c.usoMes ?? 0} / {c.limite_leads_mes}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          step={50}
                          defaultValue={c.limite_leads_mes}
                          onBlur={e => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val !== c.limite_leads_mes) actualizarLimite(c.id, val);
                          }}
                          className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                        {guardandoLimite === c.id && <span className="text-xs text-slate-400">Guardando...</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sección formularios de captación ──────────────────────────────── */}
      {tabActiva === "formularios" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Formularios de captación</h2>
              <p className="text-sm text-slate-500 mt-0.5">Comparte el enlace en tus anuncios. Cada formulario crea un lead automáticamente.</p>
            </div>
          </div>

          {formularios.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Cargando formularios...</div>
          ) : (
            <div className="space-y-3">
              {formularios.map(f => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/f/${f.slug}`;
                const editando = editandoFormId === f.id;
                return (
                  <div key={f.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                      <span className="text-xl">{f.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{f.nombre}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.activo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                            {f.activo ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{f.titulo}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { navigator.clipboard.writeText(url); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          title="Copiar enlace"
                        >
                          📋 Copiar URL
                        </button>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                          👁 Vista previa
                        </a>
                        <button
                          onClick={() => {
                            if (editando) { setEditandoFormId(null); return; }
                            setEditandoFormId(f.id);
                            setFTitulo(f.titulo); setFSubtitulo(f.subtitulo ?? "");
                            setFTextoCta(f.texto_cta); setFPedirEmail(f.pedir_email); setFActivo(f.activo);
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg transition-colors font-medium"
                          style={editando ? { background: "#fff5f0", color: "#ea650d", border: "1px solid #f5a677" } : { background: "#f8f7f5", color: "#6b6560", border: "1px solid #e5e7eb" }}
                        >
                          {editando ? "Cancelar" : "✏️ Editar"}
                        </button>
                      </div>
                    </div>

                    {/* URL pública */}
                    <div className="px-4 py-2 bg-slate-50 flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono truncate flex-1">{url}</span>
                    </div>

                    {/* Form de edición */}
                    {editando && (
                      <div className="px-4 py-4 border-t border-slate-100 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Título (mostrado al cliente)</label>
                            <input value={fTitulo} onChange={e => setFTitulo(e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Subtítulo</label>
                            <input value={fSubtitulo} onChange={e => setFSubtitulo(e.target.value)}
                              placeholder="Opcional"
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Texto del botón CTA</label>
                          <input value={fTextoCta} onChange={e => setFTextoCta(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300" />
                        </div>
                        <div className="flex items-center gap-6">
                          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={fPedirEmail} onChange={e => setFPedirEmail(e.target.checked)} className="rounded" />
                            Pedir email (opcional)
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={fActivo} onChange={e => setFActivo(e.target.checked)} className="rounded" />
                            Formulario activo
                          </label>
                        </div>
                        <div className="flex justify-end">
                          <button
                            disabled={guardandoForm}
                            onClick={async () => {
                              setGuardandoForm(true);
                              await supabase.from("formularios_captacion").update({
                                titulo: fTitulo, subtitulo: fSubtitulo || null,
                                texto_cta: fTextoCta, pedir_email: fPedirEmail, activo: fActivo,
                                updated_at: new Date().toISOString(),
                              }).eq("id", f.id);
                              await cargarFormularios();
                              setEditandoFormId(null);
                              setGuardandoForm(false);
                            }}
                            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                            style={{ background: "#ea650d" }}
                          >
                            {guardandoForm ? "Guardando..." : "Guardar cambios"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700 mb-1">¿Cómo funciona?</p>
            <ul className="space-y-1 text-xs">
              <li>1. Copia el enlace del formulario que corresponda al anuncio</li>
              <li>2. Pégalo en tu ad de Meta, Google o en tu bio de redes</li>
              <li>3. Cuando alguien rellena el formulario, aparece automáticamente en <strong>/leads</strong> con el origen marcado</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Sección roles y permisos (solo admin) ─────────────────────────── */}
      {tabActiva === "roles" && esAdmin && (() => {
        const PERMISOS_LABELS: Record<string, string> = {
          ver_todos_leads: "Ver todos los leads",
          ver_metricas: "Ver métricas y desempeño",
          gestionar_equipo: "Gestionar equipo",
          gestionar_ajustes: "Acceder a ajustes",
          gestionar_roles: "Gestionar roles y permisos",
          exportar_datos: "Exportar datos (CSV)",
          ver_reportes: "Ver reportes",
          borrar_leads: "Eliminar / descartar leads",
          gestionar_clientes: "Gestionar clientes",
          usar_scraping: "Usar prospección y mapa",
          asignar_leads: "Asignar y reasignar leads",
        };
        const ROLES = ["admin", "director", "manager", "comercial"] as const;
        const ROL_LABELS: Record<string, string> = {
          admin: "Admin", director: "Director", manager: "Manager", comercial: "Comercial",
        };
        const permisosPorRol = (rol: string, permiso: string) =>
          rolePermisos.find(p => p.rol === rol && p.permiso === permiso);

        return (
          <div className="space-y-6">
            {/* Matriz de permisos */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">Permisos por rol</p>
                <p className="text-xs text-slate-500 mt-0.5">Admin tiene todos los permisos activados y no se pueden modificar.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Permiso</th>
                      {ROLES.map(r => (
                        <th key={r} className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">{ROL_LABELS[r]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(PERMISOS_LABELS).map(([permiso, label]) => (
                      <tr key={permiso} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-sm text-slate-700">{label}</td>
                        {ROLES.map(rol => {
                          const entry = permisosPorRol(rol, permiso);
                          const activo = entry?.activo ?? false;
                          const isAdmin = rol === "admin";
                          const key = `${rol}:${permiso}`;
                          const saving = guardandoPermiso === key;
                          return (
                            <td key={rol} className="px-4 py-3 text-center">
                              <button
                                onClick={() => !isAdmin && togglePermiso(rol, permiso, !activo)}
                                disabled={isAdmin || saving}
                                className={`w-10 h-5 rounded-full relative transition-colors ${isAdmin ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                                style={{ background: activo ? "#ea650d" : "#e2e8f0" }}
                                title={isAdmin ? "Admin siempre tiene este permiso" : activo ? "Desactivar" : "Activar"}
                              >
                                <span
                                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all"
                                  style={{ left: activo ? "calc(100% - 18px)" : 2 }}
                                />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Asignación de roles por usuario */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">Asignación de roles</p>
                <p className="text-xs text-slate-500 mt-0.5">Cambia el rol de cada comercial. Los cambios se aplican en su próximo inicio de sesión.</p>
              </div>
              <div className="divide-y divide-slate-50">
                {comercialesRoles.map(c => {
                  const iniciales = [c.nombre, c.apellidos].filter(Boolean).join(" ").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: "#fff5f0", color: "#ea650d" }}>
                        {iniciales}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{c.nombre} {c.apellidos ?? ""}</p>
                        {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                      </div>
                      <select
                        value={c.rol}
                        onChange={e => cambiarRolComercial(c.id, e.target.value)}
                        disabled={guardandoRolId === c.id}
                        className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-orange-300 text-slate-700 disabled:opacity-50"
                      >
                        <option value="admin">Admin</option>
                        <option value="director">Director</option>
                        <option value="manager">Manager</option>
                        <option value="comercial">Comercial</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Info */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">Jerarquía de roles</p>
              <p><strong>Admin:</strong> acceso total, gestión de roles y permisos (solo tú)</p>
              <p><strong>Director:</strong> acceso completo a análisis, equipos, ajustes, scraping y clientes</p>
              <p><strong>Manager:</strong> ve todos los leads y métricas, usa scraping, gestiona clientes</p>
              <p><strong>Comercial:</strong> solo sus leads, agenda, mensajes y asistente IA</p>
            </div>
          </div>
        );
      })()}

      {/* ── Tab: Productos ──────────────────────────────────────────────── */}
      {tabActiva === "productos" && esDirector && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Catálogo de productos y tasas de comisión</p>
              <p className="text-xs text-slate-400 mt-0.5">Configura la tasa de comisión estimada por producto para los cálculos en Ingresos</p>
            </div>
            {productos.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">Cargando productos...</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {productos.map(p => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{p.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{p.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={comisionEdits[p.id] ?? String(p.comision_pct ?? 20)}
                          onChange={e => setComisionEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:border-orange-400"
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                      <button
                        onClick={() => guardarComision(p.id)}
                        disabled={guardandoProducto === p.id || comisionEdits[p.id] === String(p.comision_pct)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-40 transition-opacity"
                        style={{ background: "#ea650d" }}
                      >
                        {guardandoProducto === p.id ? "…" : "Guardar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Nota:</span> Las tasas de comisión son estimaciones para uso interno.
              Las comisiones reales pueden variar según acuerdos con NN España.
              Consulta con dirección para los valores exactos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
