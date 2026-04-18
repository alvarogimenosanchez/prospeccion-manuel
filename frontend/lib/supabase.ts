import { createBrowserClient } from "@supabase/ssr";

// Cliente SSR-aware que mantiene la sesión via cookies (compatible con RLS)
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder_key"
);

// Tipos TypeScript que reflejan el esquema de Supabase
export type Lead = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  cargo: string | null;
  empresa: string | null;
  sector: string | null;
  tipo_lead: "particular" | "autonomo" | "pyme" | "empresa" | null;
  num_empleados: number | null;
  edad_estimada: number | null;
  tiene_hijos: boolean | null;
  tiene_hipoteca: boolean | null;
  fuente: "linkedin" | "scraping" | "inbound" | "base_existente" | "referido" | "manual" | null;
  fuente_detalle: string | null;
  fecha_captacion: string;
  ciudad: string | null;
  provincia: string | null;
  estado: string;
  temperatura: "caliente" | "templado" | "frio";
  nivel_interes: number;
  prioridad: "alta" | "media" | "baja";
  productos_recomendados: string[] | null;
  producto_interes_principal: string | null;
  notas: string | null;
  web: string | null;
  comercial_asignado: string | null;
  team_id: string | null;
  proxima_accion: "llamar" | "whatsapp" | "email" | "esperar_respuesta" | "enviar_info" | "reunion" | "ninguna" | null;
  proxima_accion_fecha: string | null;
  proxima_accion_nota: string | null;
  motivo_perdida: "precio" | "competencia" | "no_interesado" | "timing" | "sin_contacto" | "otro" | null;
  motivo_perdida_nota: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadDashboard = Lead & {
  comercial_nombre: string | null;
  team_nombre: string | null;
  ultima_interaccion: string | null;
  proxima_cita: string | null;
  horas_sin_atencion: number | null;
};

export type Interaction = {
  id: string;
  lead_id: string;
  tipo: string;
  mensaje: string | null;
  origen: "bot" | "comercial" | "lead" | null;
  sentimiento: "positivo" | "neutro" | "negativo" | null;
  señal_escalado: boolean;
  created_at: string;
};

export type Appointment = {
  id: string;
  lead_id: string;
  comercial_id: string | null;
  tipo: "llamada" | "reunion_presencial" | "videollamada";
  estado: "solicitud_pendiente" | "pendiente" | "confirmada" | "realizada" | "cancelada" | "no_show";
  fecha_hora: string;
  duracion_minutos: number;
  producto_a_tratar: string | null;
  notas_previas: string | null;
  notas_post: string | null;
  resultado: string | null;
  solicitado_por: "lead" | "comercial";
  google_calendar_event_id: string | null;
  google_meet_link: string | null;
  notificado_comercial_at: string | null;
  respondido_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  nombre: string;
  descripcion: string | null;
  zona_geografica: string | null;
  activo: boolean;
  created_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  comercial_id: string;
  rol: "lider" | "miembro";
  created_at: string;
};

export type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  whatsapp: string | null;
  activo: boolean;
  rol: "director" | "comercial";
  max_leads_activos: number;
  google_calendar_id: string | null;
  created_at: string;
};

export type Cliente = {
  id: string;
  lead_id: string | null;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  empresa: string | null;
  comercial_asignado: string | null;
  producto: string | null;
  fecha_inicio: string;
  fecha_renovacion: string | null;
  valor_contrato: number | null;
  notas: string | null;
  estado: "activo" | "pausado" | "cancelado" | "renovado";
  created_at: string;
  updated_at: string;
};

export type DashboardResumen = {
  fecha: string;
  leads_nuevos_hoy: number;
  leads_calientes_total: number;
  citas_hoy: number;
  sin_atencion_urgente: Array<{
    id: string;
    nombre: string;
    apellidos: string | null;
    nivel_interes: number;
  }>;
};
