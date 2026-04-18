-- ============================================================
-- SISTEMA DE PROSPECCIÓN COMERCIAL - MANUEL
-- Esquema de base de datos para Supabase (PostgreSQL)
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: leads
-- Ficha completa de cada lead/prospecto
-- ============================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Datos de identificación
    nombre TEXT NOT NULL,
    apellidos TEXT,
    email TEXT,
    telefono TEXT,
    telefono_whatsapp TEXT,

    -- Datos profesionales/empresa
    cargo TEXT,                          -- "Autónomo", "CEO", "Director Comercial"...
    empresa TEXT,
    sector TEXT,                         -- "Hostelería", "Inmobiliaria", "Tecnología"...
    tipo_lead TEXT CHECK (tipo_lead IN ('particular', 'autonomo', 'pyme', 'empresa')),
    num_empleados INTEGER,               -- Tamaño empresa si aplica

    -- Datos personales relevantes para segmentación
    edad_estimada INTEGER,
    tiene_hijos BOOLEAN,
    tiene_hipoteca BOOLEAN,

    -- Fuente y origen
    fuente TEXT CHECK (fuente IN ('linkedin', 'scraping', 'inbound', 'base_existente', 'referido', 'manual')),
    fuente_detalle TEXT,                 -- URL, nombre del referido, etc.
    fecha_captacion TIMESTAMPTZ DEFAULT NOW(),

    -- Ubicación
    ciudad TEXT,
    provincia TEXT,

    -- Estado en el pipeline
    estado TEXT DEFAULT 'nuevo' CHECK (estado IN (
        'nuevo',
        'enriquecido',
        'segmentado',
        'mensaje_generado',
        'mensaje_enviado',
        'respondio',
        'cita_agendada',
        'en_negociacion',
        'cerrado_ganado',
        'cerrado_perdido',
        'descartado'
    )),

    -- Scoring (actualizado por Agente 6)
    temperatura TEXT DEFAULT 'frio' CHECK (temperatura IN ('caliente', 'templado', 'frio')),
    nivel_interes INTEGER DEFAULT 0 CHECK (nivel_interes BETWEEN 0 AND 10),
    prioridad TEXT DEFAULT 'baja' CHECK (prioridad IN ('alta', 'media', 'baja')),

    -- Productos recomendados (array de IDs de producto)
    productos_recomendados TEXT[],       -- ej: ['contigo_pyme', 'sialp']
    producto_interes_principal TEXT,     -- El que más le interesa tras conversación

    -- Notas y contexto
    notas TEXT,
    señales_detectadas TEXT[],          -- Señales del Agente 1/2 que motivaron el contacto
    web TEXT,                            -- URL web del negocio (para enriquecimiento agent4)

    -- Próxima acción (gestionada por comercial o agent2)
    proxima_accion TEXT,                 -- 'llamar', 'whatsapp', 'email', 'reunion', etc.
    proxima_accion_fecha TIMESTAMPTZ,   -- Cuándo ejecutar la acción
    proxima_accion_nota TEXT,            -- Nota libre sobre la próxima acción

    -- Asignación
    comercial_asignado UUID,            -- FK a tabla comerciales
    team_id UUID,                        -- FK a tabla teams

    -- Control
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles para búsquedas frecuentes
CREATE INDEX idx_leads_estado ON leads(estado);
CREATE INDEX idx_leads_temperatura ON leads(temperatura);
CREATE INDEX idx_leads_prioridad ON leads(prioridad);
CREATE INDEX idx_leads_fuente ON leads(fuente);
CREATE INDEX idx_leads_tipo ON leads(tipo_lead);
CREATE INDEX idx_leads_comercial ON leads(comercial_asignado);

-- ============================================================
-- TABLA: interactions
-- Historial completo de conversaciones WhatsApp y contactos
-- ============================================================
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

    -- Tipo de interacción
    tipo TEXT CHECK (tipo IN (
        'whatsapp_enviado',
        'whatsapp_recibido',
        'llamada_saliente',
        'llamada_entrante',
        'email_enviado',
        'cita_presencial',
        'nota_manual'
    )),

    -- Contenido
    mensaje TEXT,                        -- Texto del mensaje o descripción de la llamada

    -- Metadata WhatsApp
    whatsapp_message_id TEXT,           -- ID del mensaje en la API de 360dialog/Meta

    -- Quién interviene
    origen TEXT CHECK (origen IN ('bot', 'comercial', 'lead')),
    comercial_id UUID,                  -- Si fue el comercial quien intervino

    -- Análisis del Agente 6
    sentimiento TEXT CHECK (sentimiento IN ('positivo', 'neutro', 'negativo')),
    palabras_clave_interes TEXT[],      -- ej: ['precio', 'me interesa', 'cuándo']
    señal_escalado BOOLEAN DEFAULT FALSE, -- Si el bot detectó que hay que escalar

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_lead ON interactions(lead_id);
CREATE INDEX idx_interactions_tipo ON interactions(tipo);
CREATE INDEX idx_interactions_fecha ON interactions(created_at);

-- ============================================================
-- TABLA: appointments
-- Citas presenciales y llamadas agendadas
-- ============================================================
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    comercial_id UUID,

    tipo TEXT CHECK (tipo IN ('llamada', 'reunion_presencial', 'videollamada')),
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'realizada', 'cancelada', 'no_show')),

    fecha_hora TIMESTAMPTZ NOT NULL,
    duracion_minutos INTEGER DEFAULT 30,

    -- Contexto
    producto_a_tratar TEXT,            -- Producto que se va a discutir
    notas_previas TEXT,
    notas_post TEXT,                    -- Notas tras la reunión

    -- Resultado
    resultado TEXT CHECK (resultado IN ('interesado', 'no_interesado', 'pendiente_decision', 'contrato_iniciado')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_lead ON appointments(lead_id);
CREATE INDEX idx_appointments_fecha ON appointments(fecha_hora);
CREATE INDEX idx_appointments_estado ON appointments(estado);

-- ============================================================
-- TABLA: products
-- Catálogo de productos para el chatbot y el segmentador
-- ============================================================
CREATE TABLE products (
    id TEXT PRIMARY KEY,               -- ej: 'contigo_futuro', 'sialp'
    nombre TEXT NOT NULL,
    categoria TEXT,
    descripcion_chatbot TEXT,          -- Descripción que usa el chatbot para explicar el producto
    precio_desde TEXT,
    perfil_ideal JSONB,                -- Array de perfiles
    señales_matching JSONB,            -- Array de señales que activan este producto
    preguntas_frecuentes JSONB,        -- Array de {pregunta, respuesta}
    ventaja_diferencial TEXT,
    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: scoring_history
-- Evolución histórica del scoring de cada lead
-- ============================================================
CREATE TABLE scoring_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

    -- Valores en este momento
    temperatura TEXT,
    nivel_interes INTEGER,
    prioridad TEXT,
    producto_interes TEXT,

    -- Por qué cambió
    motivo TEXT,                        -- Descripción del evento que causó el cambio
    evento_tipo TEXT,                   -- 'respuesta_whatsapp', 'cita_agendada', 'sin_respuesta_7_dias'...

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scoring_lead ON scoring_history(lead_id);
CREATE INDEX idx_scoring_fecha ON scoring_history(created_at);

-- ============================================================
-- TABLA: comerciales
-- Equipo comercial de Manuel
-- ============================================================
CREATE TABLE comerciales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    apellidos TEXT,
    email TEXT UNIQUE,
    telefono TEXT,
    whatsapp TEXT,
    activo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Añadir FK de leads a comerciales
ALTER TABLE leads ADD CONSTRAINT fk_leads_comercial
    FOREIGN KEY (comercial_asignado) REFERENCES comerciales(id);

ALTER TABLE appointments ADD CONSTRAINT fk_appointments_comercial
    FOREIGN KEY (comercial_id) REFERENCES comerciales(id);

ALTER TABLE interactions ADD CONSTRAINT fk_interactions_comercial
    FOREIGN KEY (comercial_id) REFERENCES comerciales(id);

-- ============================================================
-- TABLA: message_templates
-- Plantillas de mensajes aprobadas por Meta para WhatsApp
-- ============================================================
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,              -- Nombre interno
    meta_template_name TEXT,           -- Nombre en Meta (para API)
    producto_id TEXT REFERENCES products(id),
    tipo_lead TEXT,                    -- 'autonomo', 'pyme', 'particular'

    -- Contenido
    asunto TEXT,                       -- Para email (si aplica)
    cuerpo TEXT NOT NULL,              -- El mensaje con variables {{nombre}}, {{ciudad}}, etc.
    variables TEXT[],                  -- Lista de variables usadas

    -- Estado en Meta
    meta_status TEXT DEFAULT 'pendiente' CHECK (meta_status IN ('pendiente', 'aprobado', 'rechazado')),

    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: mensajes_pendientes
-- Mensajes generados por Claude pendientes de aprobación del comercial
-- ============================================================
CREATE TABLE mensajes_pendientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    comercial_id UUID REFERENCES comerciales(id),

    mensaje TEXT NOT NULL,              -- Mensaje generado por Claude
    canal TEXT DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'email', 'llamada')),
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'descartado', 'enviado')),
    editado_por_comercial BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mensajes_lead ON mensajes_pendientes(lead_id);
CREATE INDEX idx_mensajes_estado ON mensajes_pendientes(estado);
ALTER TABLE mensajes_pendientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON mensajes_pendientes FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - para Supabase
-- ============================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE comerciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Política: solo usuarios autenticados pueden ver/editar sus datos
-- (Por ahora permisiva para desarrollo, restringir en producción)
CREATE POLICY "Allow authenticated access" ON leads FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON interactions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON appointments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON scoring_history FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON comerciales FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON message_templates FOR ALL USING (auth.role() = 'authenticated');

-- Acceso público de solo lectura a productos (para el chatbot sin auth)
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);

-- ============================================================
-- DATOS INICIALES: Productos
-- ============================================================
INSERT INTO products (id, nombre, categoria, descripcion_chatbot, precio_desde, perfil_ideal, señales_matching, preguntas_frecuentes, ventaja_diferencial) VALUES
(
    'contigo_futuro',
    'Contigo Futuro',
    'ahorro_inversion',
    'Plan de ahorro garantizado a largo plazo. Desde 83€/mes con el 80% del capital garantizado. Rescatable desde el primer año. Ideal para construir un capital para el futuro.',
    '83€/mes',
    '["Empleados con nómina estable", "Autónomos con ingresos regulares", "Personas 30-55 años"]',
    '["jubilación", "ahorro", "futuro financiero", "colchón", "estudios hijos"]',
    '[{"pregunta": "¿Puedo recuperar mi dinero cuando quiera?", "respuesta": "Sí, desde el primer año."}, {"pregunta": "¿Es seguro?", "respuesta": "Sí, tienes el 80% del capital garantizado."}]',
    'Garantía de capital con rentabilidad adicional superior a cuenta de ahorro'
),
(
    'sialp',
    'Plan Creciente SIALP',
    'ahorro_fiscal',
    'Ahorro con ventaja fiscal única: exención total de IRPF sobre rendimientos si mantienes 5 años. Hasta 5.000€/año. El 85% del capital garantizado.',
    'Hasta 5.000€/año',
    '["Personas con capacidad de ahorro", "Autónomos con ingresos variables", "Empleados en tramos altos de IRPF"]',
    '["reducir impuestos", "IRPF", "ahorro fiscal", "declaración renta", "plan de pensiones"]',
    '[{"pregunta": "¿Cuánto me ahorro en impuestos?", "respuesta": "Depende de tu tramo de IRPF. Los rendimientos quedan exentos al 100%."}, {"pregunta": "¿Qué pasa si lo rescato antes?", "respuesta": "Recuperas tu dinero pero pierdes la ventaja fiscal."}]',
    'Único producto con exención total de IRPF sobre rendimientos. Más ventajoso que planes de pensiones para muchos perfiles.'
),
(
    'contigo_autonomo',
    'Contigo Autónomo',
    'proteccion_autonomos',
    'Seguro integral para autónomos desde 5,25€/mes. Cobertura de Incapacidad Laboral Temporal: cobras entre 10€ y 200€/día desde el primer día de baja. Incluye chat médico y asesoría legal 24h.',
    '5,25€/mes',
    '["Autónomos dados de alta", "Freelancers", "Profesionales independientes"]',
    '["autónomo", "trabajar por cuenta propia", "no puedo trabajar", "enfermo", "accidente", "baja laboral"]',
    '[{"pregunta": "¿Desde cuándo cobro si me pongo enfermo?", "respuesta": "Desde el primer día."}, {"pregunta": "¿Cubre accidentes y enfermedades?", "respuesta": "Sí, ambos."}]',
    'ILT desde el día 1. Chat médico y legal 24h incluido sin coste extra.'
),
(
    'contigo_familia',
    'Contigo Familia',
    'seguro_vida',
    'Seguro de vida flexible y modular para proteger a tu familia. Desde 5,25€/mes hasta 1.000.000€ de capital asegurado. Personalizas exactamente las coberturas que necesitas.',
    '5,25€/mes',
    '["Cabezas de familia", "Padres con hijos menores", "Personas con hipoteca"]',
    '["hijos", "hipoteca", "familia", "fallecimiento", "qué pasaría si", "proteger a mi familia"]',
    '[{"pregunta": "¿Cuánto capital necesito?", "respuesta": "Depende de tus cargas: hipoteca, hijos, deudas."}, {"pregunta": "¿Puedo cambiar coberturas?", "respuesta": "Sí, es completamente modular."}]',
    'Modularidad total. Pagas exactamente por lo que necesitas.'
),
(
    'contigo_pyme',
    'Contigo Pyme',
    'seguro_empresas',
    'Seguro colectivo de vida para proteger a los empleados de tu empresa. Sin cuestionario médico individual. Excelente beneficio laboral para retener talento.',
    'Consultar según plantilla',
    '["Empresas de 1-50 empleados", "Pymes que quieren mejorar beneficios sociales"]',
    '["empleados", "empresa", "equipo", "beneficios laborales", "retener talento", "pyme"]',
    '[{"pregunta": "¿Hay que hacer reconocimiento médico?", "respuesta": "No, es colectivo. No hay cuestionario individual."}, {"pregunta": "¿Qué cubre?", "respuesta": "Fallecimiento e invalidez como mínimo, ampliable según póliza."}]',
    'Sin reconocimiento médico individual. Se contrata toda la plantilla de golpe.'
),
(
    'contigo_senior',
    'Contigo Senior',
    'seguro_mayores',
    'Seguro de accidentes para personas de 55 a 80 años. Desde 42€/mes con cobertura hasta 65.000€ y acceso a servicios de Sanitas (teléfono médico 24h).',
    '42€/mes',
    '["Personas entre 55 y 80 años", "Jubilados", "Personas mayores"]',
    '["mayor", "jubilado", "65 años", "70 años", "seguro vida mayores", "padres mayores"]',
    '[{"pregunta": "¿Hasta qué edad puedo contratarlo?", "respuesta": "Hasta los 80 años."}, {"pregunta": "¿Qué incluye Sanitas?", "respuesta": "Teléfono médico 24h y orientación sanitaria."}]',
    'Acepta hasta 80 años sin reconocimiento médico. Incluye acceso a Sanitas.'
),
(
    'liderplus',
    'LiderPlus Accidentes',
    'seguro_accidentes',
    'Seguro de accidentes de muy bajo coste. Desde 74,77€/año (6,23€/mes). Opción A: 90.000€ por 134,59€/año. Opción B: 50.000€ por 74,77€/año. Solo cubre accidentes (no enfermedad).',
    '74,77€/año',
    '["Cualquier persona activa", "Primeros compradores de seguro", "Complemento a seguro de vida"]',
    '["accidente", "poco presupuesto", "algo básico", "empezar", "complementar seguro"]',
    '[{"pregunta": "¿Cubre enfermedades?", "respuesta": "No, solo accidentes."}, {"pregunta": "¿Cuánto cuesta?", "respuesta": "Desde 74,77€/año (Opción B, 50.000€) o 134,59€/año (Opción A, 90.000€)."}]',
    'Precio imbatible desde 74,77€/año. Ideal como primer seguro o complemento.'
);

-- ============================================================
-- VISTA: leads_dashboard
-- Vista optimizada para el dashboard de Manuel
-- ============================================================
CREATE VIEW leads_dashboard AS
SELECT
    l.id,
    l.nombre,
    l.apellidos,
    l.empresa,
    l.tipo_lead,
    l.telefono_whatsapp,
    l.estado,
    l.temperatura,
    l.nivel_interes,
    l.prioridad,
    l.productos_recomendados,
    l.producto_interes_principal,
    l.ciudad,
    l.fuente,
    l.fecha_captacion,
    l.updated_at,
    c.nombre AS comercial_nombre,
    -- Última interacción
    (SELECT MAX(created_at) FROM interactions WHERE lead_id = l.id) AS ultima_interaccion,
    -- Próxima cita
    (SELECT MIN(fecha_hora) FROM appointments WHERE lead_id = l.id AND estado = 'confirmada' AND fecha_hora > NOW()) AS proxima_cita,
    -- Horas sin respuesta del equipo (si el lead respondió y nadie contestó)
    CASE
        WHEN l.estado = 'respondio' THEN
            EXTRACT(EPOCH FROM (NOW() - l.updated_at)) / 3600
        ELSE NULL
    END AS horas_sin_atencion
FROM leads l
LEFT JOIN comerciales c ON l.comercial_asignado = c.id
WHERE l.estado != 'descartado';

-- ============================================================
-- TABLA: teams
-- Equipos comerciales
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: team_members
-- Relación comerciales ↔ equipos
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    comercial_id UUID NOT NULL REFERENCES comerciales(id) ON DELETE CASCADE,
    rol TEXT DEFAULT 'comercial' CHECK (rol IN ('director', 'comercial')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, comercial_id)
);

-- ============================================================
-- TABLA: clientes
-- Cartera de clientes con pólizas activas
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id),
    comercial_asignado UUID REFERENCES comerciales(id),

    nombre TEXT NOT NULL,
    apellidos TEXT,
    email TEXT,
    telefono TEXT,
    empresa TEXT,

    producto TEXT,                        -- Producto contratado
    fecha_inicio DATE,                    -- Fecha de contratación
    fecha_renovacion DATE,                -- Próxima fecha de renovación
    valor_contrato NUMERIC(10,2),         -- Valor anual del contrato

    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'renovado', 'cancelado', 'vencido')),
    notas TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado);
CREATE INDEX IF NOT EXISTS idx_clientes_renovacion ON clientes(fecha_renovacion);
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON clientes FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- TABLA: recursos_rapidos
-- Scripts, argumentarios, links y plantillas del equipo
-- ============================================================
CREATE TABLE IF NOT EXISTS recursos_rapidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creado_por UUID REFERENCES comerciales(id),
    titulo TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('script', 'argumentario', 'link', 'plantilla_wa', 'documento', 'otro')),
    contenido TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT,
    es_global BOOLEAN DEFAULT TRUE,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recursos_rapidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON recursos_rapidos FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- TABLA: mensajes_internos
-- Chat interno del equipo (tipo Slack ligero)
-- ============================================================
CREATE TABLE IF NOT EXISTS mensajes_internos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    de_comercial_id UUID NOT NULL REFERENCES comerciales(id),
    para_comercial_id UUID REFERENCES comerciales(id),  -- NULL = broadcast a todos
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'texto' CHECK (tipo IN ('texto', 'alerta', 'nota_lead')),
    leido_por UUID[] DEFAULT '{}',
    adjunto_lead_id UUID REFERENCES leads(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_internos_de ON mensajes_internos(de_comercial_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_internos_para ON mensajes_internos(para_comercial_id);
ALTER TABLE mensajes_internos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON mensajes_internos FOR ALL USING (auth.role() = 'authenticated');
