"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Comercial {
  id: string;
  nombre: string;
  email: string;
}

interface ChatGrupo {
  id: string;
  nombre: string;
  emoji: string;
  members: string[];
  creado_por: string;
  activo: boolean;
  created_at: string;
}

interface MensajeInterno {
  id: string;
  de_comercial_id: string;
  para_comercial_id: string | null;
  grupo_id: string | null;
  mensaje: string;
  tipo: "texto" | "alerta" | "nota_lead";
  leido_por: string[];
  adjunto_lead_id: string | null;
  mentions: string[];
  reactions: Record<string, string[]>;
  reply_to_id: string | null;
  reply_to?: { id: string; mensaje: string; de_comercial_id: string } | null;
  created_at: string;
}

interface Conversacion {
  id: string | null;
  nombre: string;
  email?: string;
  es_broadcast: boolean;
  es_grupo: boolean;
  no_leidos: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const REACCIONES = ["👍", "❤️", "🔥", "✅"];
const EMOJIS_GRUPO = ["💬", "🏆", "📊", "🎯", "⚡", "🚀", "🔔", "👥"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatHora(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const isHoy =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();
  if (isHoy) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function Initials({ nombre, size = 32 }: { nombre: string; size?: number }) {
  const parts = nombre.trim().split(" ");
  const initials = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  const colors = ["#ea650d", "#0270e0", "#16a34a", "#9333ea", "#dc2626", "#ca8a04"];
  const color = colors[nombre.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 600, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MensajesInternosPage() {
  const supabase = createClient();
  const [, setUser] = useState<User | null>(null);
  const [miComercialId, setMiComercialId] = useState<string | null>(null);
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [grupos, setGrupos] = useState<ChatGrupo[]>([]);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeInterno[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Reply
  const [replyTo, setReplyTo] = useState<MensajeInterno | null>(null);

  // Reactions hover
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  // @mention dropdown
  const [mencionQuery, setMencionQuery] = useState<string | null>(null);
  const [mencionIndex, setMencionIndex] = useState(0);
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);

  // Create group modal
  const [grupoModal, setGrupoModal] = useState(false);
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState("");
  const [nuevoGrupoEmoji, setNuevoGrupoEmoji] = useState("💬");
  const [nuevoGrupoMembers, setNuevoGrupoMembers] = useState<string[]>([]);
  const [creandoGrupo, setCreandoGrupo] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user?.email) {
        supabase.from("comerciales").select("id, nombre, email")
          .eq("email", data.user.email).single()
          .then(({ data: c }) => { if (c) setMiComercialId(c.id); });
      }
    });
  }, []);

  // ── Load comerciales ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("comerciales").select("id, nombre, email")
      .eq("activo", true).order("nombre")
      .then(({ data }) => { if (data) setComerciales(data); });
  }, []);

  // ── Load grupos ───────────────────────────────────────────────────────────
  const cargarGrupos = useCallback(async (mid: string) => {
    const { data } = await supabase.from("chat_grupos")
      .select("*").eq("activo", true).order("nombre");
    if (data) {
      setGrupos((data as ChatGrupo[]).filter(g =>
        g.creado_por === mid || g.members?.includes(mid)
      ));
    }
  }, [supabase]);

  useEffect(() => {
    if (miComercialId) cargarGrupos(miComercialId);
  }, [miComercialId, cargarGrupos]);

  // ── Build conversation list ───────────────────────────────────────────────
  const buildConversaciones = useCallback(async (mid: string, coms: Comercial[]) => {
    const { data: msgs } = await supabase.from("mensajes_internos")
      .select("de_comercial_id, para_comercial_id, grupo_id, leido_por, created_at")
      .or(`de_comercial_id.eq.${mid},para_comercial_id.eq.${mid},para_comercial_id.is.null`)
      .order("created_at", { ascending: false });

    if (!msgs) return;

    const noLeidosMap: Record<string, number> = { broadcast: 0 };
    for (const c of coms.filter(c => c.id !== mid)) noLeidosMap[c.id] = 0;

    for (const m of msgs) {
      const leidoPorMi = m.leido_por?.includes(mid);
      const esMio = m.de_comercial_id === mid;
      if (esMio || leidoPorMi) continue;
      if (!m.para_comercial_id && !m.grupo_id) {
        noLeidosMap["broadcast"] = (noLeidosMap["broadcast"] ?? 0) + 1;
      } else if (!m.grupo_id && m.de_comercial_id !== mid) {
        noLeidosMap[m.de_comercial_id] = (noLeidosMap[m.de_comercial_id] ?? 0) + 1;
      }
    }

    setConversaciones([
      { id: null, nombre: "Todos", es_broadcast: true, es_grupo: false, no_leidos: noLeidosMap["broadcast"] ?? 0 },
      ...coms.filter(c => c.id !== mid).map(c => ({
        id: c.id, nombre: c.nombre, email: c.email,
        es_broadcast: false, es_grupo: false, no_leidos: noLeidosMap[c.id] ?? 0,
      })),
    ]);
    setCargando(false);
    setSeleccion(prev => prev ?? "broadcast");
  }, [supabase]);

  useEffect(() => {
    if (miComercialId && comerciales.length > 0) {
      buildConversaciones(miComercialId, comerciales);
    }
  }, [miComercialId, comerciales, buildConversaciones]);

  // ── Load messages ─────────────────────────────────────────────────────────
  const cargarMensajes = useCallback(async (conv: string | null, mid: string) => {
    let q = supabase.from("mensajes_internos")
      .select("*, de_comercial:comerciales!de_comercial_id(id,nombre,email), reply_to:mensajes_internos!reply_to_id(id,mensaje,de_comercial_id)")
      .order("created_at", { ascending: true }).limit(200);

    if (conv === "broadcast" || conv === null) {
      q = q.is("para_comercial_id", null).is("grupo_id", null);
    } else if (conv.startsWith("grupo-")) {
      const grupoId = conv.replace("grupo-", "");
      q = q.eq("grupo_id", grupoId);
    } else {
      q = q.or(
        `and(de_comercial_id.eq.${mid},para_comercial_id.eq.${conv}),and(de_comercial_id.eq.${conv},para_comercial_id.eq.${mid})`
      );
    }

    const { data } = await q;
    if (data) setMensajes(data as MensajeInterno[]);
    if (mid && conv) await marcarLeido(conv, mid);
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (seleccion !== null && miComercialId) {
      cargarMensajes(seleccion, miComercialId);
    }
  }, [seleccion, miComercialId, cargarMensajes]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  // ── Real-time ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!miComercialId) return;

    const channel = supabase.channel("mensajes_internos_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes_internos" }, (payload) => {
        const m = payload.new as MensajeInterno;
        const myGruposIds = grupos.map(g => g.id);
        const relevant =
          (!m.para_comercial_id && !m.grupo_id) ||
          m.de_comercial_id === miComercialId ||
          m.para_comercial_id === miComercialId ||
          (m.grupo_id != null && myGruposIds.includes(m.grupo_id));

        if (!relevant) return;

        // Browser notification for @mentions
        if (m.mentions?.includes(miComercialId) && m.de_comercial_id !== miComercialId) {
          const sender = comerciales.find(c => c.id === m.de_comercial_id);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(`${sender?.nombre ?? "Alguien"} te mencionó`, {
              body: m.mensaje.substring(0, 100),
              icon: "/favicon.ico",
            });
          }
        }

        const isCurrentConv =
          (seleccion === "broadcast" && !m.para_comercial_id && !m.grupo_id) ||
          (seleccion === m.de_comercial_id && m.para_comercial_id === miComercialId) ||
          (seleccion === m.para_comercial_id && m.de_comercial_id === miComercialId) ||
          (m.grupo_id != null && seleccion === `grupo-${m.grupo_id}`);

        if (isCurrentConv) setMensajes(prev => [...prev, m]);

        setConversaciones(prev => prev.map(c => {
          if (m.de_comercial_id === miComercialId) return c;
          if (!m.para_comercial_id && !m.grupo_id && c.es_broadcast)
            return { ...c, no_leidos: c.no_leidos + (isCurrentConv ? 0 : 1) };
          if (m.de_comercial_id === c.id && !m.grupo_id)
            return { ...c, no_leidos: c.no_leidos + (isCurrentConv ? 0 : 1) };
          return c;
        }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mensajes_internos" }, (payload) => {
        const m = payload.new as MensajeInterno;
        setMensajes(prev => prev.map(msg => msg.id === m.id ? { ...msg, reactions: m.reactions } : msg));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [miComercialId, seleccion, supabase, grupos, comerciales]);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Mark as read ──────────────────────────────────────────────────────────
  async function marcarLeido(conv: string, mid: string) {
    let q = supabase.from("mensajes_internos").select("id, leido_por")
      .not("de_comercial_id", "eq", mid);

    if (conv === "broadcast") {
      q = q.is("para_comercial_id", null).is("grupo_id", null);
    } else if (conv.startsWith("grupo-")) {
      q = q.eq("grupo_id", conv.replace("grupo-", ""));
    } else {
      q = q.eq("de_comercial_id", conv).eq("para_comercial_id", mid);
    }

    const { data } = await q;
    if (!data) return;
    const sinLeer = data.filter(m => !m.leido_por?.includes(mid));
    for (const m of sinLeer) {
      await supabase.from("mensajes_internos")
        .update({ leido_por: [...(m.leido_por ?? []), mid] }).eq("id", m.id);
    }
    setConversaciones(prev => prev.map(c => {
      if (conv === "broadcast" && c.es_broadcast) return { ...c, no_leidos: 0 };
      if (c.id === conv) return { ...c, no_leidos: 0 };
      return c;
    }));
  }

  // ── @mention detection ────────────────────────────────────────────────────
  function handleTextoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTexto(val);

    const cursor = e.target.selectionStart ?? val.length;
    const textoBefore = val.slice(0, cursor);
    const lastAt = textoBefore.lastIndexOf("@");

    if (lastAt !== -1) {
      const charBeforeAt = lastAt > 0 ? textoBefore[lastAt - 1] : " ";
      const queryPart = textoBefore.slice(lastAt + 1);
      if ((charBeforeAt === " " || charBeforeAt === "\n" || lastAt === 0) && !queryPart.includes(" ")) {
        setMencionQuery(queryPart);
        setMencionIndex(0);
        return;
      }
    }
    setMencionQuery(null);
  }

  const mencionFiltrados = mencionQuery !== null
    ? comerciales.filter(c =>
        c.id !== miComercialId &&
        c.nombre.toLowerCase().includes(mencionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  function insertarMencion(comercial: Comercial) {
    const lastAt = texto.lastIndexOf("@");
    const newTexto = texto.slice(0, lastAt) + `@${comercial.nombre} `;
    setTexto(newTexto);
    setPendingMentions(prev => [...new Set([...prev, comercial.id])]);
    setMencionQuery(null);
    textareaRef.current?.focus();
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function enviarMensaje() {
    if (!texto.trim() || !miComercialId || enviando) return;
    setEnviando(true);

    const grupoId = seleccion?.startsWith("grupo-") ? seleccion.replace("grupo-", "") : null;

    const payload = {
      de_comercial_id: miComercialId,
      para_comercial_id: !grupoId && seleccion !== "broadcast" ? (seleccion ?? null) : null,
      grupo_id: grupoId ?? null,
      mensaje: texto.trim(),
      tipo: "texto",
      leido_por: [miComercialId],
      mentions: pendingMentions,
      reply_to_id: replyTo?.id ?? null,
    };

    const { error } = await supabase.from("mensajes_internos").insert(payload);
    if (!error) {
      setTexto("");
      setPendingMentions([]);
      setReplyTo(null);
      textareaRef.current?.focus();
    }
    setEnviando(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mencionQuery !== null && mencionFiltrados.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMencionIndex(i => Math.min(i + 1, mencionFiltrados.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMencionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || (e.key === "Enter")) { e.preventDefault(); insertarMencion(mencionFiltrados[mencionIndex]); return; }
      if (e.key === "Escape") { setMencionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensaje();
    }
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  async function toggleReaccion(msgId: string, emoji: string) {
    if (!miComercialId) return;
    const msg = mensajes.find(m => m.id === msgId);
    if (!msg) return;

    const current = msg.reactions ?? {};
    const currentUsers = current[emoji] ?? [];
    const newUsers = currentUsers.includes(miComercialId)
      ? currentUsers.filter(id => id !== miComercialId)
      : [...currentUsers, miComercialId];

    const newReactions = { ...current, [emoji]: newUsers };
    if (newUsers.length === 0) delete newReactions[emoji];

    setMensajes(prev => prev.map(m => m.id === msgId ? { ...m, reactions: newReactions } : m));
    await supabase.from("mensajes_internos").update({ reactions: newReactions }).eq("id", msgId);
  }

  // ── Create group ──────────────────────────────────────────────────────────
  async function crearGrupo() {
    if (!nuevoGrupoNombre.trim() || !miComercialId || creandoGrupo) return;
    setCreandoGrupo(true);

    const members = [...new Set([miComercialId, ...nuevoGrupoMembers])];
    const { data, error } = await supabase.from("chat_grupos").insert({
      nombre: nuevoGrupoNombre.trim(),
      emoji: nuevoGrupoEmoji,
      creado_por: miComercialId,
      members,
    }).select().single();

    if (!error && data) {
      setGrupos(prev => [...prev, data as ChatGrupo]);
      setGrupoModal(false);
      setNuevoGrupoNombre("");
      setNuevoGrupoEmoji("💬");
      setNuevoGrupoMembers([]);
      setSeleccion(`grupo-${(data as ChatGrupo).id}`);
    }
    setCreandoGrupo(false);
  }

  // ── Info active conversation ──────────────────────────────────────────────
  const grupoActivo = seleccion?.startsWith("grupo-")
    ? grupos.find(g => g.id === seleccion.replace("grupo-", ""))
    : null;

  const convActiva = conversaciones.find(c =>
    (c.es_broadcast && seleccion === "broadcast") || c.id === seleccion
  );

  // ── Render mention highlights ─────────────────────────────────────────────
  function renderTexto(text: string, mentions: string[]) {
    if (!mentions?.length) return <>{text}</>;
    const parts: React.ReactNode[] = [];
    let remaining = text;
    for (const mid of mentions) {
      const com = comerciales.find(c => c.id === mid);
      if (!com) continue;
      const tag = `@${com.nombre}`;
      const idx = remaining.indexOf(tag);
      if (idx === -1) continue;
      if (idx > 0) parts.push(remaining.slice(0, idx));
      parts.push(
        <span key={`${mid}-${idx}`} style={{ fontWeight: 700, background: "rgba(234,101,13,0.18)", borderRadius: 3, padding: "0 2px" }}>
          {tag}
        </span>
      );
      remaining = remaining.slice(idx + tag.length);
    }
    parts.push(remaining);
    return <>{parts}</>;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm" style={{ color: "#a09890" }}>Cargando mensajes...</div>
      </div>
    );
  }

  const headerNombre = grupoActivo?.nombre ?? convActiva?.nombre ?? "";

  return (
    <div className="flex rounded" style={{
      height: "calc(100vh - 96px)",
      border: "1px solid #e5ded9",
      background: "#ffffff",
      boxShadow: "0 2px 8px rgba(102,102,102,0.08)",
      overflow: "hidden",
    }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div style={{
        width: 256, flexShrink: 0, borderRight: "1px solid #e5ded9",
        display: "flex", flexDirection: "column", background: "#faf8f6",
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #e5ded9" }}>
          <h1 className="font-semibold text-sm" style={{ color: "#414141" }}>Mensajes internos</h1>
          <p className="text-xs mt-0.5" style={{ color: "#a09890" }}>Chat del equipo</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Direct messages */}
          {conversaciones.map((conv) => {
            const key = conv.es_broadcast ? "broadcast" : conv.id;
            const active = (conv.es_broadcast && seleccion === "broadcast") || (!conv.es_broadcast && seleccion === conv.id);
            return (
              <button key={key}
                onClick={() => setSeleccion(conv.es_broadcast ? "broadcast" : conv.id ?? null)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 14px", background: active ? "#fff5f0" : "transparent",
                  borderLeft: `3px solid ${active ? "#ea650d" : "transparent"}`,
                  textAlign: "left", cursor: "pointer", transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f5f0ec"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {conv.es_broadcast ? (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#e5ded9",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b6560" strokeWidth="2" strokeLinecap="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                ) : (
                  <Initials nombre={conv.nombre} size={32} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{
                    color: active ? "#ea650d" : "#414141",
                    fontWeight: conv.no_leidos > 0 ? 600 : 400,
                  }}>{conv.nombre}</p>
                </div>
                {conv.no_leidos > 0 && (
                  <span style={{
                    background: "#ea650d", color: "#fff", borderRadius: "9999px",
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", flexShrink: 0,
                  }}>{conv.no_leidos}</span>
                )}
              </button>
            );
          })}

          {/* Groups section */}
          <div style={{ padding: "10px 14px 4px", borderTop: "1px solid #e5ded9", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a09890" }}>Grupos</span>
            <button onClick={() => setGrupoModal(true)}
              title="Crear grupo"
              style={{
                background: "none", border: "1px solid #f5a677", cursor: "pointer",
                padding: "1px 7px", borderRadius: 6, color: "#ea650d", fontSize: 15, lineHeight: "18px",
              }}>+</button>
          </div>

          {grupos.length === 0 && (
            <p className="text-xs px-4 py-1.5" style={{ color: "#c7bdb7" }}>Sin grupos todavía</p>
          )}

          {grupos.map(g => {
            const gKey = `grupo-${g.id}`;
            const active = seleccion === gKey;
            return (
              <button key={gKey} onClick={() => setSeleccion(gKey)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 14px", background: active ? "#fff5f0" : "transparent",
                  borderLeft: `3px solid ${active ? "#ea650d" : "transparent"}`,
                  textAlign: "left", cursor: "pointer", transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f5f0ec"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", background: active ? "#fff5f0" : "#f0ebe6",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 16,
                }}>{g.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: active ? "#ea650d" : "#414141" }}>{g.nombre}</p>
                  <p className="text-xs" style={{ color: "#a09890" }}>{g.members.length} miembros</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        {(convActiva || grupoActivo) && (
          <div style={{
            padding: "14px 20px", borderBottom: "1px solid #e5ded9",
            display: "flex", alignItems: "center", gap: 10,
            background: "#ffffff", flexShrink: 0,
          }}>
            {grupoActivo ? (
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: "#fff5f0",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>{grupoActivo.emoji}</div>
            ) : convActiva?.es_broadcast ? (
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: "#e5ded9",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b6560" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
            ) : (
              <Initials nombre={headerNombre} size={36} />
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: "#414141" }}>{headerNombre}</p>
              {convActiva?.es_broadcast && (
                <p className="text-xs" style={{ color: "#a09890" }}>Canal del equipo — visible para todos</p>
              )}
              {grupoActivo && (
                <p className="text-xs" style={{ color: "#a09890" }}>
                  {grupoActivo.members.length} miembros ·{" "}
                  {grupoActivo.members
                    .map(id => comerciales.find(c => c.id === id)?.nombre?.split(" ")[0])
                    .filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
          {mensajes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: "#c7bdb7", fontSize: 14 }}>
              No hay mensajes aún. ¡Envía el primero!
            </div>
          ) : (
            mensajes.map(m => {
              const esMio = m.de_comercial_id === miComercialId;
              const remitente = comerciales.find(c => c.id === m.de_comercial_id);
              const nombre = remitente?.nombre ?? "Desconocido";
              const isHovered = hoveredMsgId === m.id;
              const reactions = m.reactions ?? {};
              const hasReactions = Object.values(reactions).some(users => users.length > 0);
              const showAuthor = !esMio && (seleccion === "broadcast" || seleccion?.startsWith("grupo-"));

              return (
                <div key={m.id}
                  onMouseEnter={() => setHoveredMsgId(m.id)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                  style={{
                    display: "flex",
                    flexDirection: esMio ? "row-reverse" : "row",
                    alignItems: "flex-end",
                    gap: 8,
                    maxWidth: "72%",
                    alignSelf: esMio ? "flex-end" : "flex-start",
                    position: "relative",
                  }}
                >
                  {!esMio && <Initials nombre={nombre} size={28} />}

                  <div style={{ minWidth: 0 }}>
                    {showAuthor && (
                      <p className="text-xs mb-1" style={{ color: "#a09890", paddingLeft: 4 }}>{nombre}</p>
                    )}

                    {/* Reply context */}
                    {m.reply_to && (
                      <div style={{
                        padding: "4px 10px", marginBottom: 3,
                        borderLeft: "3px solid #ea650d",
                        borderRadius: "6px 6px 0 0",
                        background: esMio ? "rgba(255,255,255,0.2)" : "#ede8e4",
                        fontSize: 12,
                        color: esMio ? "rgba(255,255,255,0.75)" : "#6b6560",
                        maxWidth: 280, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        ↩ {m.reply_to.mensaje}
                      </div>
                    )}

                    <div style={{
                      padding: "9px 14px",
                      borderRadius: esMio ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: esMio ? "#ea650d" : "#f5f0ec",
                      color: esMio ? "#ffffff" : "#414141",
                      fontSize: 14, lineHeight: "20px",
                      wordBreak: "break-word", whiteSpace: "pre-wrap",
                    }}>
                      {renderTexto(m.mensaje, m.mentions ?? [])}
                    </div>

                    {/* Reactions */}
                    {hasReactions && (
                      <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap", justifyContent: esMio ? "flex-end" : "flex-start" }}>
                        {Object.entries(reactions).map(([emoji, users]) =>
                          users.length > 0 ? (
                            <button key={emoji}
                              onClick={() => toggleReaccion(m.id, emoji)}
                              style={{
                                background: users.includes(miComercialId ?? "") ? "#fff5f0" : "#f5f0ec",
                                border: `1px solid ${users.includes(miComercialId ?? "") ? "#f5a677" : "#e5ded9"}`,
                                borderRadius: 12, padding: "2px 7px", fontSize: 12,
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                              }}>
                              {emoji}
                              <span style={{ color: "#6b6560", fontSize: 11, fontWeight: 500 }}>{users.length}</span>
                            </button>
                          ) : null
                        )}
                      </div>
                    )}

                    <p className="text-[10px] mt-0.5" style={{
                      color: "#c7bdb7",
                      textAlign: esMio ? "right" : "left",
                      paddingLeft: esMio ? 0 : 4,
                      paddingRight: esMio ? 4 : 0,
                    }}>
                      {formatHora(m.created_at)}
                    </p>
                  </div>

                  {/* Hover actions: reactions + reply */}
                  {isHovered && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 2,
                      background: "#fff", border: "1px solid #e5ded9", borderRadius: 8,
                      padding: "3px 6px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                      position: "absolute", top: -10,
                      ...(esMio ? { left: 0 } : { right: 0 }),
                      zIndex: 10,
                    }}>
                      {REACCIONES.map(emoji => (
                        <button key={emoji}
                          onClick={() => toggleReaccion(m.id, emoji)}
                          title={emoji}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 16, padding: "2px 3px", borderRadius: 4,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "#f5f0ec"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >{emoji}</button>
                      ))}
                      <div style={{ width: 1, height: 16, background: "#e5ded9", margin: "0 2px" }} />
                      <button onClick={() => setReplyTo(m)}
                        title="Responder"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, fontSize: 13, color: "#6b6560" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f5f0ec"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}
                      >↩</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5ded9", background: "#ffffff", flexShrink: 0 }}>

          {/* Reply bar */}
          {replyTo && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", marginBottom: 8,
              background: "#fff5f0", borderRadius: 6, borderLeft: "3px solid #ea650d",
            }}>
              <span style={{ flex: 1, fontSize: 12, color: "#6b6560", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ↩ {replyTo.mensaje.substring(0, 90)}{replyTo.mensaje.length > 90 ? "…" : ""}
              </span>
              <button onClick={() => setReplyTo(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#a09890", fontSize: 14, flexShrink: 0 }}>
                ✕
              </button>
            </div>
          )}

          {/* @mention dropdown */}
          {mencionQuery !== null && mencionFiltrados.length > 0 && (
            <div style={{
              marginBottom: 6, background: "#fff",
              border: "1px solid #e5ded9", borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)", overflow: "hidden",
            }}>
              {mencionFiltrados.map((c, i) => (
                <button key={c.id}
                  onClick={() => insertarMencion(c)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", textAlign: "left", cursor: "pointer",
                    background: i === mencionIndex ? "#fff5f0" : "transparent", border: "none",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#fff5f0"; setMencionIndex(i); }}
                  onMouseLeave={e => { e.currentTarget.style.background = i === mencionIndex ? "#fff5f0" : "transparent"; }}
                >
                  <Initials nombre={c.nombre} size={24} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#414141" }}>{c.nombre}</p>
                    <p style={{ fontSize: 11, color: "#a09890" }}>{c.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "flex-end", gap: 10,
            background: "#f5f0ec", border: "1px solid #e5ded9", borderRadius: 8, padding: "8px 12px",
          }}>
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={handleTextoChange}
              onKeyDown={handleKeyDown}
              placeholder={
                grupoActivo
                  ? `Mensaje en ${grupoActivo.nombre}... @ para mencionar`
                  : convActiva?.es_broadcast
                  ? "Escribe para todos... @ para mencionar"
                  : `Mensaje para ${convActiva?.nombre ?? "..."}...`
              }
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                resize: "none", fontSize: 14, color: "#414141", lineHeight: "20px",
                maxHeight: 120, overflow: "auto",
              }}
            />
            <button onClick={enviarMensaje} disabled={!texto.trim() || enviando}
              style={{
                background: texto.trim() ? "#ea650d" : "#e5ded9",
                border: "none", borderRadius: 6, padding: "7px 10px",
                cursor: texto.trim() ? "pointer" : "default",
                transition: "background 0.15s", flexShrink: 0,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#c7bdb7" }}>
            Enter para enviar · Shift+Enter nueva línea · @ para mencionar
          </p>
        </div>
      </div>

      {/* ── Create group modal ─────────────────────────────────────────────── */}
      {grupoModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
          }}
          onClick={e => { if (e.target === e.currentTarget) setGrupoModal(false); }}
        >
          <div style={{
            background: "#fff", borderRadius: 12, padding: 24,
            width: 400, maxWidth: "90vw",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#414141", marginBottom: 20 }}>Crear grupo</h2>

            {/* Emoji picker */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#6b6560", display: "block", marginBottom: 6 }}>Emoji del grupo</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {EMOJIS_GRUPO.map(e => (
                  <button key={e} onClick={() => setNuevoGrupoEmoji(e)}
                    style={{
                      width: 36, height: 36, fontSize: 18, borderRadius: 8, cursor: "pointer",
                      border: nuevoGrupoEmoji === e ? "2px solid #ea650d" : "1px solid #e5ded9",
                      background: nuevoGrupoEmoji === e ? "#fff5f0" : "#fff",
                    }}>{e}</button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#6b6560", display: "block", marginBottom: 4 }}>Nombre del grupo</label>
              <input
                value={nuevoGrupoNombre}
                onChange={e => setNuevoGrupoNombre(e.target.value)}
                placeholder="Ej: Equipo Madrid, Comerciales senior..."
                style={{
                  width: "100%", border: "1px solid #e5ded9", borderRadius: 8,
                  padding: "8px 12px", fontSize: 14, color: "#414141", outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "#ea650d"}
                onBlur={e => e.target.style.borderColor = "#e5ded9"}
              />
            </div>

            {/* Members */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "#6b6560", display: "block", marginBottom: 6 }}>
                Miembros ({nuevoGrupoMembers.length} seleccionados)
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto" }}>
                {comerciales.filter(c => c.id !== miComercialId).map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 4px", borderRadius: 6 }}>
                    <input type="checkbox"
                      checked={nuevoGrupoMembers.includes(c.id)}
                      onChange={e => {
                        if (e.target.checked) setNuevoGrupoMembers(prev => [...prev, c.id]);
                        else setNuevoGrupoMembers(prev => prev.filter(id => id !== c.id));
                      }}
                      style={{ accentColor: "#ea650d", width: 14, height: 14 }} />
                    <Initials nombre={c.nombre} size={24} />
                    <span style={{ fontSize: 13, color: "#414141" }}>{c.nombre}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setGrupoModal(false)}
                style={{
                  padding: "9px 18px", borderRadius: 8, border: "1px solid #e5ded9",
                  background: "none", cursor: "pointer", fontSize: 14, color: "#6b6560",
                }}>
                Cancelar
              </button>
              <button onClick={crearGrupo} disabled={!nuevoGrupoNombre.trim() || creandoGrupo}
                style={{
                  padding: "9px 18px", borderRadius: 8, border: "none",
                  background: nuevoGrupoNombre.trim() ? "#ea650d" : "#e5ded9",
                  color: "#fff", cursor: nuevoGrupoNombre.trim() ? "pointer" : "default",
                  fontSize: 14, fontWeight: 500,
                }}>
                {creandoGrupo ? "Creando..." : `Crear ${nuevoGrupoEmoji} ${nuevoGrupoNombre || "grupo"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
