"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FilaCSV = Record<string, string>;

type LeadImportado = {
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  email: string | null;
  empresa: string | null;
  ciudad: string | null;
  provincia: string | null;
  cargo: string | null;
  sector: string | null;
  notas: string | null;
  fuente: string;
};

// ─── Column name aliases ───────────────────────────────────────────────────────

const ALIASES: Record<keyof LeadImportado, string[]> = {
  nombre:            ["nombre", "name", "first_name", "firstname", "primer nombre"],
  apellidos:         ["apellidos", "apellido", "last_name", "lastname", "segundo nombre"],
  telefono:          ["telefono", "teléfono", "phone", "tel", "movil", "móvil", "fijo"],
  telefono_whatsapp: ["whatsapp", "wa", "telefono_whatsapp", "teléfono_whatsapp"],
  email:             ["email", "correo", "e-mail", "mail"],
  empresa:           ["empresa", "company", "compañia", "compañía", "negocio", "business"],
  ciudad:            ["ciudad", "city", "localidad", "municipio", "poblacion", "población"],
  provincia:         ["provincia", "province", "region", "región"],
  cargo:             ["cargo", "puesto", "rol", "title", "job_title", "posicion", "posición"],
  sector:            ["sector", "industria", "industry", "actividad"],
  notas:             ["notas", "notes", "observaciones", "comentarios", "comments"],
  fuente:            ["fuente", "source", "origen"],
};

function detectar(headers: string[]): Record<string, keyof LeadImportado | null> {
  const mapa: Record<string, keyof LeadImportado | null> = {};
  for (const h of headers) {
    const hn = h.toLowerCase().trim().replace(/\s+/g, "_");
    mapa[h] = null;
    for (const [campo, aliases] of Object.entries(ALIASES)) {
      if (aliases.some(a => hn.includes(a) || a.includes(hn))) {
        mapa[h] = campo as keyof LeadImportado;
        break;
      }
    }
  }
  return mapa;
}

function parseCSV(text: string): { headers: string[]; rows: FilaCSV[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const sep = lines[0].includes(";") ? ";" : ",";

  function parseLine(line: string): string[] {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === sep && !inQ) {
        cols.push(cur.trim()); cur = "";
      } else {
        cur += c;
      }
    }
    cols.push(cur.trim());
    return cols;
  }

  const headers = parseLine(lines[0]);
  const rows: FilaCSV[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row: FilaCSV = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function mapearFila(row: FilaCSV, mapa: Record<string, keyof LeadImportado | null>): LeadImportado | null {
  const lead: Partial<LeadImportado> = { fuente: "importacion_csv" };
  for (const [col, campo] of Object.entries(mapa)) {
    if (campo && row[col]) {
      (lead as Record<string, string | null>)[campo] = row[col] || null;
    }
  }
  if (!lead.nombre?.trim()) return null;
  return {
    nombre: lead.nombre!.trim(),
    apellidos: lead.apellidos?.trim() || null,
    telefono: lead.telefono?.trim() || null,
    telefono_whatsapp: lead.telefono_whatsapp?.trim() || lead.telefono?.trim() || null,
    email: lead.email?.trim() || null,
    empresa: lead.empresa?.trim() || null,
    ciudad: lead.ciudad?.trim() || null,
    provincia: lead.provincia?.trim() || null,
    cargo: lead.cargo?.trim() || null,
    sector: lead.sector?.trim() || null,
    notas: lead.notas?.trim() || null,
    fuente: lead.fuente ?? "importacion_csv",
  };
}

// ─── Component ─────────────────────────────────────────────────────────────────

type Props = {
  onClose: () => void;
  onImportado: () => void;
  comercialId: string | null;
};

export function ImportarLeadsModal({ onClose, onImportado, comercialId }: Props) {
  const [paso, setPaso] = useState<"subir" | "preview" | "importando" | "done">("subir");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<FilaCSV[]>([]);
  const [mapa, setMapa] = useState<Record<string, keyof LeadImportado | null>>({});
  const [resultado, setResultado] = useState({ ok: 0, err: 0 });
  const [asignarA, setAsignarA] = useState<string>(comercialId ?? "");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) return;
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapa(detectar(parsed.headers));
      setPaso("preview");
    };
    reader.readAsText(file, "utf-8");
  }

  async function cargarComerciales() {
    if (comerciales.length > 0) return;
    const { data } = await supabase.from("comerciales").select("id, nombre").eq("activo", true).order("nombre");
    setComerciales(data ?? []);
  }

  async function importar() {
    setPaso("importando");
    const leads = rows.map(r => mapearFila(r, mapa)).filter(Boolean) as LeadImportado[];
    let ok = 0, err = 0;
    const BATCH = 50;
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH).map(l => ({
        ...l,
        estado: "nuevo",
        comercial_asignado: asignarA || null,
      }));
      const { error } = await supabase.from("leads").insert(batch);
      if (error) err += batch.length;
      else ok += batch.length;
    }
    setResultado({ ok, err });
    setPaso("done");
  }

  const camposDisponibles = (Object.keys(ALIASES) as (keyof LeadImportado)[]);
  const leadsValidos = rows.map(r => mapearFila(r, mapa)).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">Importar leads desde CSV</h2>
            {paso === "preview" && (
              <p className="text-xs text-slate-400 mt-0.5">{rows.length} filas · {leadsValidos} con nombre válido</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {paso === "subir" && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/50 transition-all"
              >
                <p className="text-3xl mb-2">📂</p>
                <p className="text-sm font-medium text-slate-700">Haz clic para seleccionar un archivo CSV</p>
                <p className="text-xs text-slate-400 mt-1">Se aceptan archivos .csv con separador de coma o punto y coma</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
              </div>
              <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-600">Columnas reconocidas automáticamente:</p>
                <p>nombre, apellidos, telefono, email, empresa, ciudad, provincia, cargo, sector, notas, fuente, whatsapp</p>
              </div>
            </div>
          )}

          {paso === "preview" && (
            <div className="space-y-4">
              {/* Column mapping */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mapeo de columnas</p>
                <div className="grid grid-cols-2 gap-2">
                  {headers.map(h => (
                    <div key={h} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-slate-700 truncate flex-1">{h}</span>
                      <select
                        value={mapa[h] ?? ""}
                        onChange={e => setMapa(prev => ({ ...prev, [h]: (e.target.value as keyof LeadImportado) || null }))}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-orange-300 max-w-[120px]"
                      >
                        <option value="">— ignorar —</option>
                        {camposDisponibles.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Asignar a */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Asignar leads a</p>
                <select
                  value={asignarA}
                  onChange={e => setAsignarA(e.target.value)}
                  onFocus={cargarComerciales}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white"
                >
                  <option value="">Sin asignar</option>
                  {comerciales.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Preview rows */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Vista previa (primeras 5 filas)</p>
                <div className="bg-slate-50 rounded-lg overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {headers.filter(h => mapa[h]).map(h => (
                          <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap">{mapa[h]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          {headers.filter(h => mapa[h]).map(h => (
                            <td key={h} className="px-3 py-2 text-slate-600 truncate max-w-[120px]">{r[h] || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {paso === "importando" && (
            <div className="py-16 text-center">
              <p className="text-3xl mb-3 animate-pulse">⏳</p>
              <p className="text-sm text-slate-600">Importando {leadsValidos} leads...</p>
            </div>
          )}

          {paso === "done" && (
            <div className="py-12 text-center space-y-3">
              <p className="text-4xl">{resultado.err === 0 ? "✅" : resultado.ok > 0 ? "⚠️" : "❌"}</p>
              <p className="text-lg font-semibold text-slate-800">
                {resultado.ok} lead{resultado.ok !== 1 ? "s" : ""} importado{resultado.ok !== 1 ? "s" : ""}
              </p>
              {resultado.err > 0 && (
                <p className="text-sm text-red-600">{resultado.err} errores al importar</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          {paso === "done" ? (
            <button
              onClick={() => { onImportado(); onClose(); }}
              className="px-5 py-2.5 text-white text-sm font-medium rounded-xl transition-colors" style={{ background: "#ea650d" }}
            >
              Ver leads importados
            </button>
          ) : paso === "preview" ? (
            <>
              <button onClick={() => setPaso("subir")} className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl">
                ← Cambiar archivo
              </button>
              <button
                onClick={importar}
                disabled={leadsValidos === 0}
                className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
              >
                Importar {leadsValidos} lead{leadsValidos !== 1 ? "s" : ""}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl">
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
