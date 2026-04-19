"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type FilaPreview = {
  nombre: string;
  apellidos: string;
  empresa: string;
  sector: string;
  ciudad: string;
  telefono_whatsapp: string;
  email: string;
  fuente: string;
  valida: boolean;
  error?: string;
};

const FUENTES_VALIDAS = ["manual", "scraping", "linkedin", "inbound", "referido", "base_existente", "formulario_web"];

const CABECERA_ESPERADA = ["nombre", "apellidos", "empresa", "sector", "ciudad", "telefono_whatsapp", "email", "fuente"];

const CSV_PLANTILLA = [
  CABECERA_ESPERADA.join(","),
  "Juan,García,Ferretería García,Comercio,Madrid,612345678,juan@ferreria.es,base_existente",
  "Ana,López,Clínica López,Salud,Barcelona,623456789,,referido",
  "Pedro,,Asesoría Pérez,Asesoría,,634567890,pedro@asesoria.es,manual",
].join("\n");

function parsearCSV(texto: string): FilaPreview[] {
  const lineas = texto.trim().split(/\r?\n/).filter(l => l.trim());
  if (lineas.length === 0) return [];

  const primera = lineas[0].toLowerCase().split(",").map(h => h.trim());
  let start = 0;

  if (primera.includes("nombre")) {
    start = 1;
  }

  return lineas.slice(start).map(linea => {
    const cols = linea.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const get = (i: number) => cols[i]?.trim() ?? "";

    const nombre = get(0);
    const apellidos = get(1);
    const empresa = get(2);
    const sector = get(3);
    const ciudad = get(4);
    const telefono_whatsapp = get(5);
    const email = get(6);
    const fuente = get(7) || "manual";

    if (!nombre && !empresa) {
      return { nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, email, fuente, valida: false, error: "Sin nombre ni empresa" };
    }
    if (fuente && !FUENTES_VALIDAS.includes(fuente)) {
      return { nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, email, fuente, valida: false, error: `Fuente inválida: "${fuente}"` };
    }

    return { nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, email, fuente, valida: true };
  });
}

function descargarPlantilla() {
  const blob = new Blob(["\uFEFF" + CSV_PLANTILLA], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_importacion_leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportarPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const inputRef = useRef<HTMLInputElement>(null);

  const [filas, setFilas] = useState<FilaPreview[]>([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; errores: number } | null>(null);
  const [miComercialId, setMiComercialId] = useState<string | null>(null);

  if (!cargandoPermisos && !puede("asignar_leads") && !puede("ver_todos_leads")) {
    return <SinAcceso />;
  }

  async function obtenerMiId() {
    if (miComercialId) return miComercialId;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;
    const { data } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
    const id = data?.id ?? null;
    setMiComercialId(id);
    return id;
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const texto = e.target?.result as string;
      const parsed = parsearCSV(texto);
      setFilas(parsed);
      setResultado(null);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function importar() {
    const validas = filas.filter(f => f.valida);
    if (validas.length === 0) return;
    setImportando(true);

    const comercialId = await obtenerMiId();

    const registros = validas.map(f => ({
      nombre: f.nombre || (f.empresa ?? "Contacto"),
      apellidos: f.apellidos || null,
      empresa: f.empresa || null,
      sector: f.sector || null,
      ciudad: f.ciudad || null,
      telefono_whatsapp: f.telefono_whatsapp || null,
      email: f.email || null,
      fuente: (f.fuente as "manual" | "base_existente" | "referido" | "inbound" | "linkedin" | "scraping" | "formulario_web") || "manual",
      estado: "nuevo",
      temperatura: "frio" as const,
      nivel_interes: 3,
      prioridad: "media" as const,
      comercial_asignado: comercialId,
      fecha_captacion: new Date().toISOString(),
    }));

    const LOTE = 50;
    let ok = 0;
    let errores = 0;

    for (let i = 0; i < registros.length; i += LOTE) {
      const lote = registros.slice(i, i + LOTE);
      const { error } = await supabase.from("leads").insert(lote);
      if (error) errores += lote.length;
      else ok += lote.length;
    }

    setResultado({ ok, errores });
    setImportando(false);
    setFilas([]);
  }

  const validas = filas.filter(f => f.valida).length;
  const invalidas = filas.filter(f => !f.valida).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importar leads</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Sube un CSV con tus contactos existentes para añadirlos al CRM de forma masiva
        </p>
      </div>

      {resultado && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${resultado.errores === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <span className="text-lg shrink-0">{resultado.errores === 0 ? "✅" : "⚠️"}</span>
          <div>
            <p className={`text-sm font-semibold ${resultado.errores === 0 ? "text-green-800" : "text-amber-800"}`}>
              Importación completada
            </p>
            <p className={`text-xs mt-0.5 ${resultado.errores === 0 ? "text-green-700" : "text-amber-700"}`}>
              {resultado.ok} leads importados correctamente.
              {resultado.errores > 0 && ` ${resultado.errores} filas fallaron.`}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Formato CSV */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Formato del CSV</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              El archivo debe tener estas columnas en este orden (cabecera incluida):
            </p>
            <code className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded mt-2 inline-block font-mono">
              {CABECERA_ESPERADA.join(", ")}
            </code>
          </div>
          <button
            onClick={descargarPlantilla}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-orange-300 hover:bg-orange-50 transition-colors shrink-0"
          >
            📥 Descargar plantilla
          </button>
        </div>

        <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 space-y-1">
          <p><span className="font-medium text-slate-600">nombre</span> — Requerido (o empresa)</p>
          <p><span className="font-medium text-slate-600">fuente</span> — Valores: manual, base_existente, referido, inbound, linkedin, scraping, formulario_web</p>
          <p><span className="font-medium text-slate-600">telefono_whatsapp</span> — Solo dígitos, con prefijo país si es necesario</p>
        </div>

        {/* Upload area */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          <p className="text-2xl mb-2">📂</p>
          <p className="text-sm font-medium text-slate-700">Haz clic o arrastra tu CSV aquí</p>
          <p className="text-xs text-slate-400 mt-1">Formato CSV · máx. 1.000 filas</p>
        </div>
      </div>

      {/* Preview */}
      {filas.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Vista previa — {filas.length} filas</p>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="text-green-600 font-medium">{validas} válidas</span>
                {invalidas > 0 && <span className="text-red-500 font-medium ml-2">{invalidas} con errores</span>}
              </p>
            </div>
            <button
              onClick={importar}
              disabled={importando || validas === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ background: "#ea650d" }}
            >
              {importando ? "Importando..." : `Importar ${validas} leads →`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Estado</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Nombre</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Empresa</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Teléfono WA</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Sector</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filas.slice(0, 20).map((f, i) => (
                  <tr key={i} className={f.valida ? "hover:bg-slate-50" : "bg-red-50"}>
                    <td className="px-3 py-2">
                      {f.valida
                        ? <span className="text-green-600">✓</span>
                        : <span className="text-red-500" title={f.error}>✕</span>}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{[f.nombre, f.apellidos].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{f.empresa || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{f.telefono_whatsapp || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{f.sector || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f.fuente}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > 20 && (
              <div className="px-5 py-3 text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
                Mostrando 20 de {filas.length} filas. Todas las filas válidas se importarán.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
