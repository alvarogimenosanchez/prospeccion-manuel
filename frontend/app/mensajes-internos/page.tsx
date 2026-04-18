"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Comercial {
  id: string;
  nombre: string;
  email: string;
  avatar_url?: string;
}

interface MensajeInterno {
  id: string;
  de_comercial_id: string;
  para_comercial_id: string | null;
  mensaje: string;
  tipo: "texto" | "alerta" | "nota_lead";
  leido_por: string[];
  adjunto_lead_id: string | null;
  created_at: string;
  de_comercial?: Comercial;
  lead_nombre?: string;
}

interface Conversacion {
  id: string | null;  // null = "Todos" (broadcast)
  nombre: string;
  email?: string;
  avatar?: string;
  es_broadcast: boolean;
  no_leidos: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatHora(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const isHoy =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();
  if (isHoy) {
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function Initials({ nombre, size = 32 }: { nombre: string; size?: number }) {
  const parts = nombre.trim().split(" ");
  const initials = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  const colors = [
    "#ea650d", "#0270e0", "#16a34a", "#9333ea", "#dc2626", "#ca8a04",
  ];
  const color = colors[nombre.charCodeAt(0) % colors.length];
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.35, fontWeight: 600, flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MensajesInternosPage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [miComercialId, setMiComercialId] = useState<string | null>(null);
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null); // id comercial o "broadcast"
  const [mensajes, setMensajes] = useState<MensajeInterno[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load user + comercial profile ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) {
        supabase
          .from("comerciales")
          .select("id, nombre, email")
          .eq("user_id", data.user.id)
          .single()
          .then(({ data: c }) => {
            if (c) setMiComercialId(c.id);
          });
      }
    });
  }, []);

  // ── Load comerciales ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("comerciales")
      .select("id, nombre, email")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        if (data) setComerciales(data);
      });
  }, []);

  // ── Build conversacion list ───────────────────────────────────────────────
  const buildConversaciones = useCallback(
    async (mid: string, coms: Comercial[]) => {
      // Fetch all messages involving this user (sent or received)
      const { data: msgs } = await supabase
        .from("mensajes_internos")
        .select("de_comercial_id, para_comercial_id, leido_por, created_at")
        .or(
          `de_comercial_id.eq.${mid},para_comercial_id.eq.${mid},para_comercial_id.is.null`
        )
        .order("created_at", { ascending: false });

      if (!msgs) return;

      // No-leidos por conversación
      const noLeidosMap: Record<string, number> = { broadcast: 0 };
      for (const c of coms.filter((c) => c.id !== mid)) {
        noLeidosMap[c.id] = 0;
      }

      for (const m of msgs) {
        const leidoPorMi = m.leido_por?.includes(mid);
        const esMio = m.de_comercial_id === mid;
        if (esMio || leidoPorMi) continue; // ya leído

        if (!m.para_comercial_id) {
          // broadcast no leído
          noLeidosMap["broadcast"] = (noLeidosMap["broadcast"] ?? 0) + 1;
        } else if (m.de_comercial_id !== mid) {
          noLeidosMap[m.de_comercial_id] = (noLeidosMap[m.de_comercial_id] ?? 0) + 1;
        }
      }

      const lista: Conversacion[] = [
        {
          id: null,
          nombre: "Todos",
          es_broadcast: true,
          no_leidos: noLeidosMap["broadcast"] ?? 0,
        },
        ...coms
          .filter((c) => c.id !== mid)
          .map((c) => ({
            id: c.id,
            nombre: c.nombre,
            email: c.email,
            es_broadcast: false,
            no_leidos: noLeidosMap[c.id] ?? 0,
          })),
      ];

      setConversaciones(lista);
      setCargando(false);

      // Auto-select "Todos" if nothing selected
      setSeleccion((prev) => prev ?? "broadcast");
    },
    [supabase]
  );

  useEffect(() => {
    if (miComercialId && comerciales.length > 0) {
      buildConversaciones(miComercialId, comerciales);
    }
  }, [miComercialId, comerciales, buildConversaciones]);

  // ── Load messages for selected conversation ───────────────────────────────
  const cargarMensajes = useCallback(
    async (conv: string | null, mid: string) => {
      let q = supabase
        .from("mensajes_internos")
        .select("*, de_comercial:comerciales!de_comercial_id(id,nombre,email)")
        .order("created_at", { ascending: true })
        .limit(200);

      if (conv === "broadcast" || conv === null) {
        q = q.is("para_comercial_id", null);
      } else {
        q = q.or(
          `and(de_comercial_id.eq.${mid},para_comercial_id.eq.${conv}),and(de_comercial_id.eq.${conv},para_comercial_id.eq.${mid})`
        );
      }

      const { data } = await q;
      if (data) setMensajes(data as MensajeInterno[]);

      // Mark as read
      if (mid && conv) {
        await marcarLeido(conv, mid);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (seleccion !== null && miComercialId) {
      cargarMensajes(seleccion, miComercialId);
    }
  }, [seleccion, miComercialId, cargarMensajes]);

  // ── Scroll to bottom when messages change ────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  // ── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!miComercialId) return;

    const channel = supabase
      .channel("mensajes_internos_rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes_internos" },
        (payload) => {
          const m = payload.new as MensajeInterno;
          // Relevant if: broadcast, or involves me
          const relevant =
            !m.para_comercial_id ||
            m.de_comercial_id === miComercialId ||
            m.para_comercial_id === miComercialId;

          if (!relevant) return;

          // If currently viewing this conversation → append
          const isCurrentConv =
            (seleccion === "broadcast" && !m.para_comercial_id) ||
            (seleccion === m.de_comercial_id && m.para_comercial_id === miComercialId) ||
            (seleccion === m.para_comercial_id && m.de_comercial_id === miComercialId);

          if (isCurrentConv) {
            setMensajes((prev) => [...prev, m]);
          }

          // Update unread badge in sidebar list
          setConversaciones((prev) =>
            prev.map((c) => {
              if (m.de_comercial_id === miComercialId) return c; // my own message
              if (!m.para_comercial_id && c.es_broadcast) {
                return { ...c, no_leidos: c.no_leidos + (isCurrentConv ? 0 : 1) };
              }
              if (m.de_comercial_id === c.id) {
                return { ...c, no_leidos: c.no_leidos + (isCurrentConv ? 0 : 1) };
              }
              return c;
            })
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [miComercialId, seleccion, supabase]);

  // ── Mark as read ─────────────────────────────────────────────────────────
  async function marcarLeido(conv: string, mid: string) {
    // Get unread messages in this conversation not already read by me
    let q = supabase
      .from("mensajes_internos")
      .select("id, leido_por")
      .not("de_comercial_id", "eq", mid); // ignore my own

    if (conv === "broadcast") {
      q = q.is("para_comercial_id", null);
    } else {
      q = q.eq("de_comercial_id", conv).eq("para_comercial_id", mid);
    }

    const { data } = await q;
    if (!data) return;

    const sinLeer = data.filter((m) => !m.leido_por?.includes(mid));
    for (const m of sinLeer) {
      await supabase
        .from("mensajes_internos")
        .update({ leido_por: [...(m.leido_por ?? []), mid] })
        .eq("id", m.id);
    }

    // Reset unread count in UI
    setConversaciones((prev) =>
      prev.map((c) => {
        if (conv === "broadcast" && c.es_broadcast) return { ...c, no_leidos: 0 };
        if (c.id === conv) return { ...c, no_leidos: 0 };
        return c;
      })
    );
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function enviarMensaje() {
    if (!texto.trim() || !miComercialId || enviando) return;
    setEnviando(true);

    const payload: {
      de_comercial_id: string;
      para_comercial_id: string | null;
      mensaje: string;
      tipo: string;
      leido_por: string[];
    } = {
      de_comercial_id: miComercialId,
      para_comercial_id:
        seleccion === "broadcast" ? null : (seleccion ?? null),
      mensaje: texto.trim(),
      tipo: "texto",
      leido_por: [miComercialId],
    };

    const { error } = await supabase.from("mensajes_internos").insert(payload);
    if (!error) {
      setTexto("");
      textareaRef.current?.focus();
    }
    setEnviando(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  }

  // ── Selected conversation info ────────────────────────────────────────────
  const convActiva = conversaciones.find(
    (c) => (c.es_broadcast && seleccion === "broadcast") || c.id === seleccion
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm" style={{ color: "#a09890" }}>Cargando mensajes...</div>
      </div>
    );
  }

  return (
    <div
      className="flex rounded"
      style={{
        height: "calc(100vh - 96px)",
        border: "1px solid #e5ded9",
        background: "#ffffff",
        boxShadow: "0 2px 8px rgba(102,102,102,0.08)",
        overflow: "hidden",
      }}
    >
      {/* ── Sidebar: conversation list ─────────────────────────────────────── */}
      <div
        style={{
          width: 256,
          flexShrink: 0,
          borderRight: "1px solid #e5ded9",
          display: "flex",
          flexDirection: "column",
          background: "#faf8f6",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid #e5ded9",
          }}
        >
          <h1 className="font-semibold text-sm" style={{ color: "#414141" }}>
            Mensajes internos
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#a09890" }}>
            Chat del equipo
          </p>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversaciones.map((conv) => {
            const active =
              (conv.es_broadcast && seleccion === "broadcast") ||
              (!conv.es_broadcast && seleccion === conv.id);

            return (
              <button
                key={conv.es_broadcast ? "broadcast" : conv.id}
                onClick={() =>
                  setSeleccion(conv.es_broadcast ? "broadcast" : conv.id ?? null)
                }
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 14px",
                  background: active ? "#fff5f0" : "transparent",
                  borderLeft: active ? "3px solid #ea650d" : "3px solid transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "#f5f0ec";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                {conv.es_broadcast ? (
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "#e5ded9",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="#6b6560" strokeWidth="2" strokeLinecap="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                ) : (
                  <Initials nombre={conv.nombre} size={32} />
                )}

                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm truncate"
                    style={{
                      color: active ? "#ea650d" : "#414141",
                      fontWeight: conv.no_leidos > 0 ? 600 : 400,
                    }}
                  >
                    {conv.nombre}
                  </p>
                </div>

                {conv.no_leidos > 0 && (
                  <span
                    style={{
                      background: "#ea650d",
                      color: "#fff",
                      borderRadius: "9999px",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      flexShrink: 0,
                    }}
                  >
                    {conv.no_leidos}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Chat header */}
        {convActiva && (
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #e5ded9",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#ffffff",
              flexShrink: 0,
            }}
          >
            {convActiva.es_broadcast ? (
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#e5ded9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="#6b6560" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
            ) : (
              <Initials nombre={convActiva.nombre} size={36} />
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: "#414141" }}>
                {convActiva.nombre}
              </p>
              {convActiva.es_broadcast && (
                <p className="text-xs" style={{ color: "#a09890" }}>
                  Canal del equipo — visible para todos
                </p>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}
        >
          {mensajes.length === 0 ? (
            <div
              className="flex-1 flex items-center justify-center"
              style={{ color: "#c7bdb7", fontSize: 14 }}
            >
              No hay mensajes aún. ¡Envía el primero!
            </div>
          ) : (
            mensajes.map((m) => {
              const esMio = m.de_comercial_id === miComercialId;
              const remitente = comerciales.find((c) => c.id === m.de_comercial_id);
              const nombre = remitente?.nombre ?? "Desconocido";

              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    flexDirection: esMio ? "row-reverse" : "row",
                    alignItems: "flex-end",
                    gap: 8,
                    maxWidth: "70%",
                    alignSelf: esMio ? "flex-end" : "flex-start",
                  }}
                >
                  {!esMio && <Initials nombre={nombre} size={28} />}

                  <div>
                    {!esMio && seleccion === "broadcast" && (
                      <p
                        className="text-xs mb-1"
                        style={{ color: "#a09890", paddingLeft: 4 }}
                      >
                        {nombre}
                      </p>
                    )}
                    <div
                      style={{
                        padding: "9px 14px",
                        borderRadius: esMio ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: esMio ? "#ea650d" : "#f5f0ec",
                        color: esMio ? "#ffffff" : "#414141",
                        fontSize: 14,
                        lineHeight: "20px",
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.mensaje}
                    </div>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{
                        color: "#c7bdb7",
                        textAlign: esMio ? "right" : "left",
                        paddingLeft: esMio ? 0 : 4,
                        paddingRight: esMio ? 4 : 0,
                      }}
                    >
                      {formatHora(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e5ded9",
            background: "#ffffff",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              background: "#f5f0ec",
              border: "1px solid #e5ded9",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                convActiva?.es_broadcast
                  ? "Escribe un mensaje para todos..."
                  : `Mensaje para ${convActiva?.nombre ?? "..."}...`
              }
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: 14,
                color: "#414141",
                lineHeight: "20px",
                maxHeight: 120,
                overflow: "auto",
              }}
            />
            <button
              onClick={enviarMensaje}
              disabled={!texto.trim() || enviando}
              style={{
                background: texto.trim() ? "#ea650d" : "#e5ded9",
                border: "none",
                borderRadius: 6,
                padding: "7px 10px",
                cursor: texto.trim() ? "pointer" : "default",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#c7bdb7" }}>
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>
    </div>
  );
}
