import { createClient } from "@supabase/supabase-js";

// Usa placeholders en build para evitar errores — en runtime lee las vars reales
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder_key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  comercial_asignado: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadDashboard = Lead & {
  comercial_nombre: string | null;
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
  tipo: "llamada" | "reunion_presencial" | "videollamada";
  estado: "pendiente" | "confirmada" | "realizada" | "cancelada" | "no_show";
  fecha_hora: string;
  duracion_minutos: number;
  producto_a_tratar: string | null;
  notas_previas: string | null;
  notas_post: string | null;
  resultado: string | null;
  created_at: string;
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
