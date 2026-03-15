# Inventario de la App — Sistema de Prospección Manuel

Última actualización: 2026-03-15
Referencia rápida de todo lo que existe en la app. Usar este archivo antes de proponer mejoras o nuevas funcionalidades.

---

## Rutas y páginas

### Públicas (sin login)
| Ruta | Función |
|------|---------|
| `/(public)/captacion` | Formulario público de captación, 5 pasos: situación → preocupaciones → datos → urgencia → confirmación. Recomienda producto automáticamente. Guarda en Supabase. |
| `/(public)/landing/[producto]` | Landing page por producto con hero + formulario integrado + testimonios. Guarda lead en Supabase con fuente=inbound. |

### Autenticadas
| Ruta | Función | Componentes clave |
|------|---------|------------------|
| `/` | Dashboard del día | 4 StatsCards (leads nuevos, calientes, citas, sin atender), AlertasUrgentes (+2h sin respuesta), tabla leads calientes |
| `/leads` | Listado de todos los leads | FiltrosBar (temperatura, prioridad, búsqueda, equipo), tabla agrupada por temperatura, LeadRow con acciones rápidas |
| `/leads/[id]` | Ficha completa de lead | Cabecera (badges temperatura/prioridad/fuente, barra interés), edición de datos, cambio de estado, asignación comercial, historial interacciones, citas, generador de mensajes por sector |
| `/pipeline` | Kanban del pipeline | 6 columnas (Nuevo → Contactado → Respondió → Cita → Negociación → Ganado), mover leads entre columnas, filtrar por equipo |
| `/mensajes` | Revisión de mensajes IA | Stats (pendientes/aprobados/enviados), tarjetas con texto generado, acciones: editar / regenerar / aprobar / descartar / enviar WhatsApp |
| `/agenda` | Calendario de citas | Vista semanal + vista lista, navegación por semanas, selector de comercial, cambio de estado de cita (pendiente → confirmada → realizada / no_show / cancelada) |
| `/prospeccion` | Campañas de scraping | Panel de 3 agentes, configuración de campaña (zona libre + ciudades sugeridas, 6 categorías, profundidad, solo con teléfono), historial de últimas 10 campañas, tabla de leads scrapeados con filtros y selección múltiple |
| `/metricas` | Dashboard analítico | Funnel de ventas (barras), rendimiento por fuente y por sector (tabla), seguimiento pendiente (3 niveles), tiempo medio por etapa |
| `/desempeno` | Rendimiento por comercial | Selector de periodo (semana/mes/todo), tarjetas por comercial con mini funnel, tabla comparativa de KPIs |
| `/equipos` | Gestión de equipos | Tab Equipos: lista + detalle con miembros y capacidad. Tab Comerciales: cards con barra de carga de trabajo, alertas de saturación |
| `/equipo` | Gestión de comerciales | Lista activos/inactivos, leads por comercial, reasignación, crear/editar comercial |
| `/login` | Login | Google OAuth, mensaje de error si no autorizado |

---

## Componentes compartidos

| Componente | Función |
|-----------|---------|
| `Navbar.tsx` | Navegación: Dashboard / Leads / Pipeline / Mensajes / Agenda / Prospección / Métricas / Desempeño / Equipos + logout + fecha |
| `LeadRow.tsx` | Fila de tabla: temperatura, prioridad, interés, última actividad, acciones rápidas |
| `FiltrosBar.tsx` | Filtros: temperatura, prioridad, búsqueda full-text, equipo |
| `StatsCard.tsx` | Card con número grande, descripción, badge urgente opcional |
| `AlertasUrgentes.tsx` | Cards de leads sin atender hace +2h |
| `TemperaturaBadge.tsx` | Badge caliente / templado / frío |
| `PrioridadBadge.tsx` | Badge alta / media / baja |
| `FuenteBadge.tsx` | Badge scraping / linkedin / inbound / referido / manual |
| `NivelInteresBar.tsx` | Barra de 10 segmentos para nivel 1-10 |

---

## API calls del frontend

### Backend (Railway via rewrites Next.js)
| Endpoint | Acción |
|---------|--------|
| `POST /api/scraping/lanzar` | Lanzar campaña (body: ciudades, categorias, paginas, solo_con_telefono) |
| `POST /api/linkedin/enriquecer` | Enriquecer leads en background (body: limite) |
| `GET /api/linkedin/diagnostico` | Debug: ver candidatos a enriquecer |
| `POST /api/seguimiento/ejecutar` | Ejecutar seguimiento automático (body: tipo) |
| `POST /api/backend/mensajes/generar` | Generar mensajes con IA (body: limite) |
| `POST /api/backend/mensajes/generar-uno` | Generar mensaje para un lead (body: lead_id) |
| `POST /api/backend/mensajes/{id}/aprobar` | Aprobar mensaje (body: mensaje_editado) |
| `POST /api/backend/mensajes/{id}/descartar` | Descartar mensaje |

### Supabase (directo desde cliente)
Tablas leídas/escritas: `leads`, `interactions`, `appointments`, `teams`, `team_members`, `comerciales`, `mensajes_pendientes`

---

## Tablas en Supabase

| Tabla | Contenido |
|-------|-----------|
| `leads` | Ficha completa: nombre, apellidos, empresa, ciudad, sector, estado, temperatura, fuente, fuente_detalle, web, direccion, cargo, telefono_whatsapp, email, notas, puntuacion_interes, tipo_lead, tiene_hijos, tiene_hipoteca, comercial_id, team_id |
| `leads_dashboard` | Vista materializada para el dashboard (campos limitados) |
| `interactions` | Historial: notas, mensajes enviados/recibidos, llamadas — vinculadas a lead_id |
| `appointments` | Citas: lead_id, comercial_id, fecha, estado, notas |
| `teams` | Equipos: nombre, zona, descripción |
| `team_members` | Miembros: team_id, comercial_id, rol (líder/miembro) |
| `comerciales` | Usuarios: nombre, email, activo, max_leads_activos |
| `mensajes_pendientes` | Mensajes generados por IA pendientes de revisión |

---

## Estados de un lead

`nuevo` → `contactado` → `respondio` → `cita_agendada` → `en_negociacion` → `cerrado_ganado`
También: `cerrado_perdido`, `descartado`, `enriquecido` (estado interno post-enriquecimiento)

## Fuentes de un lead

`scraping`, `linkedin`, `inbound`, `referido`, `base_existente`, `manual`

## Temperaturas

`caliente`, `templado`, `frío`

---

## Backend (FastAPI — Railway)

Archivo principal: `backend/api/webhook_whatsapp.py`
Agentes Python:
- `agent1_scraper.py` — Google Places API → leads crudos
- `agent4_linkedin.py` — Scraping web del negocio → extrae nombre del director/propietario con Claude

Webhook de WhatsApp entrante: `POST /webhook/whatsapp` (360dialog)
Supabase Edge Function activa: `notify-new-lead` (email via Resend cuando entra lead nuevo)

---

## Funcionalidades NO implementadas aún (ver ROADMAP.md)

- Envío real de WhatsApp desde la ficha del lead (la UI existe, el envío via 360dialog no)
- Chatbot WhatsApp automático (Agente 5)
- Scoring automático tras cada interacción (Agente 6)
- Cadencia de seguimiento automática (cron jobs)
- Importar Excel de base existente de Manuel
- Segmentador automático de producto por perfil (Agente 3)
