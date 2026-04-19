"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Formulario = {
  id: string;
  slug: string;
  nombre: string;
  titulo: string;
  subtitulo: string | null;
  emoji: string;
  color_hex: string;
  producto_principal: string | null;
  tipo_lead_default: string | null;
  pedir_email: boolean;
  pedir_ciudad: boolean;
  texto_cta: string;
  mensaje_gracias: string;
  activo: boolean;
};

export default function FormularioPublico() {
  const params = useParams();
  const slug = params?.slug as string;

  const [form, setForm]         = useState<Formulario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noExiste, setNoExiste] = useState(false);

  const [nombre,   setNombre  ] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email,    setEmail   ] = useState("");
  const [ciudad,   setCiudad  ] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado,  setEnviado ] = useState(false);
  const [errores,  setErrores ] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("formularios_captacion")
      .select("*")
      .eq("slug", slug)
      .eq("activo", true)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNoExiste(true); }
        else { setForm(data as Formulario); }
        setCargando(false);
      });
  }, [slug]);

  function validar() {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = "El nombre es obligatorio";
    if (!telefono.trim()) e.telefono = "El teléfono es obligatorio";
    else if (!/^\+?[\d\s\-().]{7,}$/.test(telefono.trim())) e.telefono = "Introduce un teléfono válido";
    if (form?.pedir_email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Email no válido";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validar() || !form) return;
    setEnviando(true);

    const leadData: Record<string, unknown> = {
      nombre: nombre.trim(),
      telefono: telefono.trim().replace(/\s/g, ""),
      telefono_whatsapp: telefono.trim().replace(/\s/g, ""),
      estado: "nuevo",
      fuente: "formulario_web",
      formulario_id: form.id,
      ...(form.tipo_lead_default && { tipo_lead: form.tipo_lead_default }),
      ...(form.producto_principal && { producto_interes_principal: form.producto_principal, productos_recomendados: [form.producto_principal] }),
      ...(email.trim() && { email: email.trim() }),
      ...(ciudad.trim() && { ciudad: ciudad.trim() }),
    };

    const { error } = await supabase.from("leads").insert(leadData);

    if (error) {
      setErrores({ general: "Hubo un problema. Por favor, inténtalo de nuevo." });
      setEnviando(false);
    } else {
      setEnviado(true);
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (noExiste) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-slate-800">Formulario no encontrado</h1>
        <p className="text-slate-500 mt-2 text-sm">El enlace puede haber expirado o ser incorrecto.</p>
      </div>
    );
  }

  if (!form) return null;

  const color = form.color_hex;

  // ── Pantalla de gracias ──
  if (enviado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: `${color}10` }}>
        <div className="max-w-sm w-full text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: `${color}20` }}>
            ✅
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">{form.mensaje_gracias}</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Guarda nuestro número para cuando te llamemos:<br />
            <span className="font-semibold text-slate-700">Nationale-Nederlanden</span>
          </p>
          <div className="mt-8 p-4 rounded-2xl bg-white border border-slate-200 text-left">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Tu solicitud</p>
            <p className="text-sm font-semibold text-slate-800">{nombre}</p>
            <p className="text-sm text-slate-500">{telefono}</p>
            {email && <p className="text-sm text-slate-500">{email}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Formulario ──
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8f7f5" }}>
      {/* Header */}
      <div className="px-6 py-8 text-center text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
        <div className="mx-auto max-w-sm">
          <p className="text-4xl mb-3">{form.emoji}</p>
          <h1 className="text-2xl font-bold leading-tight mb-2">{form.titulo}</h1>
          {form.subtitulo && (
            <p className="text-sm leading-relaxed opacity-90">{form.subtitulo}</p>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-6">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <p className="text-sm font-semibold text-slate-700 mb-4 text-center">
              Déjanos tus datos y te llamamos gratis
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Nombre */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Nombre <span style={{ color }}>*</span>
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setErrores(prev => ({ ...prev, nombre: "" })); }}
                  placeholder="Tu nombre"
                  autoComplete="given-name"
                  className={`w-full rounded-xl border px-4 py-3 text-base focus:outline-none transition-colors ${errores.nombre ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-orange-300"}`}
                  style={!errores.nombre ? { "--tw-ring-color": color } as React.CSSProperties : undefined}
                />
                {errores.nombre && <p className="text-xs text-red-500 mt-1">{errores.nombre}</p>}
              </div>

              {/* Teléfono */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Teléfono <span style={{ color }}>*</span>
                </label>
                <input
                  type="tel"
                  value={telefono}
                  onChange={e => { setTelefono(e.target.value); setErrores(prev => ({ ...prev, telefono: "" })); }}
                  placeholder="600 000 000"
                  autoComplete="tel"
                  inputMode="tel"
                  className={`w-full rounded-xl border px-4 py-3 text-base focus:outline-none transition-colors ${errores.telefono ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-orange-300"}`}
                />
                {errores.telefono && <p className="text-xs text-red-500 mt-1">{errores.telefono}</p>}
              </div>

              {/* Email (opcional) */}
              {form.pedir_email && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Email <span className="text-slate-300 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrores(prev => ({ ...prev, email: "" })); }}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    inputMode="email"
                    className={`w-full rounded-xl border px-4 py-3 text-base focus:outline-none transition-colors ${errores.email ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-orange-300"}`}
                  />
                  {errores.email && <p className="text-xs text-red-500 mt-1">{errores.email}</p>}
                </div>
              )}

              {/* Ciudad (opcional) */}
              {form.pedir_ciudad && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Ciudad <span className="text-slate-300 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={ciudad}
                    onChange={e => setCiudad(e.target.value)}
                    placeholder="Madrid, Barcelona..."
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:border-orange-300 transition-colors"
                  />
                </div>
              )}

              {errores.general && (
                <p className="text-sm text-red-500 text-center">{errores.general}</p>
              )}

              {/* CTA */}
              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-xl py-4 text-base font-bold text-white transition-opacity disabled:opacity-60 mt-2"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              >
                {enviando ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enviando...
                  </span>
                ) : form.texto_cta}
              </button>
            </form>

            {/* Trust */}
            <div className="mt-5 flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">🔒 Datos seguros</span>
              <span className="flex items-center gap-1">✅ Sin compromiso</span>
            </div>
          </div>

          {/* Legal */}
          <p className="mt-4 text-center text-xs text-slate-400 leading-relaxed px-2">
            Al enviar este formulario aceptas que un asesor de Nationale-Nederlanden se ponga en contacto contigo para informarte sobre sus productos. Tus datos no serán cedidos a terceros.
          </p>

          {/* Branding */}
          <div className="mt-6 flex items-center justify-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded text-white text-xs font-bold" style={{ background: color }}>NN</div>
            <span className="text-xs text-slate-400 font-medium">Nationale-Nederlanden España</span>
          </div>
        </div>
      </div>
    </div>
  );
}
