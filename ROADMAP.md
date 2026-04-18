# Roadmap — Sistema de Prospección Manuel

Estado actualizado: 2026-04-19 (tarde)

---

## Lo que ya está construido

### Frontend (Next.js — Vercel)
- `/login` — Login con Google OAuth + protección de rutas por email autorizado
- `/` — Dashboard unificado: stats de leads, pipeline por estado, citas hoy, mensajes pendientes, clientes activos, renovaciones próximas, alertas urgentes y accesos rápidos
- `/leads` — Listado de leads con filtros (fuente, estado, ciudad, sector)
- `/leads/[id]` — Ficha completa: datos, historial de interacciones, cambio de estado, próxima acción, generación y envío de mensajes WhatsApp, motivo de pérdida obligatorio, registro post-cita
- `/pipeline` — Vista Kanban; temperatura badge derivada automáticamente del estado (frío/templado/caliente), nunca desincronizable con la BD
- `/prospeccion` — Lanzar campañas de scraping (zona libre, ciudades sugeridas, categorías), historial de campañas
- `/agenda` — Gestión de citas con vista hoy / semana / lista, filtro por comercial y equipo, métricas técnicas (tasa realización, % no-show, tasa conversión, desglose por tipo)
- `/equipos` — Vista multi-equipo; mover miembros entre equipos, names linkados a ficha individual
- `/desempeno` — Dashboard de rendimiento por comercial con filtros por equipo, rol y periodo; alertas de decisión para director
- `/desempeno/[id]` — Ficha individual de comercial: stats, funnel de ventas, métricas clave, leads activos y últimas citas
- `/metricas` — KPIs y estadísticas
- `/mensajes` — Bandeja de mensajes WhatsApp
- `/landing/[producto]` — Landing pages por producto con formulario de captación inbound

### Backend (FastAPI — Railway)
- `POST /scraping/lanzar` — Lanza campaña de scraping (Agente 1: Google Places API)
- `POST /linkedin/enriquecer` — Enriquece leads en background (Agente 4: scraping web + Claude)
- `GET /linkedin/diagnostico` — Debug: muestra candidatos a enriquecer
- `POST /seguimiento/generar-mensaje` — Genera mensaje WhatsApp personalizado con Claude (tono humano + URL cuestionario incluida)
- `POST /webhook/whatsapp` — Recibe mensajes entrantes de WhatsApp (360dialog)
- Cron diario (`cron_seguimiento.py`) — Envía seguimientos automáticos a leads sin respuesta
- Supabase Edge Function `notify-new-lead` — Email via Resend cuando entra un lead nuevo

### Base de datos (Supabase)
Tablas: `leads`, `interactions`, `appointments`, `products`, `comerciales`, `teams`, `team_members`, `clientes`
Vista: `leads_dashboard` — join de leads con comercial_nombre, team_nombre, horas_sin_atencion, proxima_cita
Columnas relevantes en leads: `estado`, `temperatura`, `nivel_interes`, `prioridad`, `proxima_accion`, `proxima_accion_fecha`, `proxima_accion_nota`, `motivo_perdida`, `motivo_perdida_nota`, `comercial_asignado`, `team_id`

---

## Completado recientemente

#### ~~Dashboard unificado~~ [✅ 2026-03-15]
- Reescritura completa de `/`: stats de leads, pipeline, citas hoy, mensajes, clientes, renovaciones, alertas urgentes y accesos rápidos

#### ~~Temperatura automática por estado~~ [✅ 2026-03-15]
- Pipeline y ficha de lead derivan temperatura del estado en tiempo real
- Mapa: nuevo/segmentado/mensaje_enviado → frío · respondio → templado · cita_agendada/en_negociacion → caliente

#### ~~Prioridad derivada de nivel de interés~~ [✅ 2026-03-15]
- Calculada automáticamente: nivel 8-10 → Alta, 5-7 → Media, 1-4 → Baja

#### ~~Mensajes IA~~ [✅ 2026-03-15]
- `agent3_mensajes.py`: tono natural, URL cuestionario incluida, bandeja de aprobación

#### ~~Agenda mejorada~~ [✅ 2026-03-15]
- Vista hoy/semana/lista, filtro por comercial y equipo, métricas técnicas

#### ~~Desempeño~~ [✅ 2026-03-15]
- Filtros equipo/rol/periodo; alertas de decisión; ficha individual `/desempeno/[id]`

#### ~~Próxima acción comprometida~~ [✅ 2026-03-15]
- Panel en ficha del lead + badge vencida/hoy en listado + sección acciones vencidas en /hoy

#### ~~WhatsApp via Wassenger + seguridad webhook~~ [✅ 2026-04-13]
- Migrado de Meta Cloud API a Wassenger
- Verificación HMAC-SHA256 en webhook (firma `X-Webhook-Signature`)

#### ~~Chatbot WhatsApp~~ [✅ 2026-04-13]
- `agent5_chatbot.py`: responde automáticamente con Claude, detecta intención, escala a humano

#### ~~Importar Excel de contactos~~ [✅ 2026-04-13]
- `/prospeccion`: arrastrar Excel, mapear columnas, deduplicar por teléfono/email, importar en lotes

#### ~~Scoring automático — Agente 6~~ [✅ 2026-04-13]
- `agent6_scoring.py`: temperatura + nivel de interés calculados por señales léxicas y comportamiento

#### ~~Auditoría completa UX + brand (ronda 2)~~ [✅ 2026-04-19]
- Corregido bug crítico: `TEMPERATURA_POR_ESTADO` vacío — temperatura nunca se actualizaba al cambiar estado desde lead detail, pipeline kanban o acciones rápidas de /hoy
- Nueva página `/leads/nuevo`: formulario completo de creación manual con sector autocomplete, tipo de lead, producto de interés
- Botón `+ Nuevo lead` en cabecera de /leads y accesos rápidos del dashboard (naranja destacado)
- Post-cita ahora incluye `datetime-local` para programar próxima acción con fecha exacta (en /leads/[id] y /agenda)
- FiltrosBar: filtros activos ahora en naranja NN; añadidos estados `enriquecido` y `segmentado` al selector
- Pipeline `moverLead`: temperatura actualizada al mover tarjeta en Kanban

#### ~~Auditoría completa UX + brand~~ [✅ 2026-04-19]
- Revisión de todas las páginas: brand NN España (#ea650d), purple→orange/teal donde no había semántica
- Campo `web` expuesto en ficha de lead y en agent3/agent4
- Mensajes WA: botón enviar auto-aprueba (flujo de un clic)
- /hoy: notas previas de citas visibles, link agendar cita corregido
- /clientes: enlace desde ficha de lead con búsqueda pre-rellenada
- DB: `max_leads_activos` y `comercial_id` en mensajes_pendientes migrados
- Schema.sql sincronizado con BD real (teams, comerciales, team_members)

---

## Próximos pasos (por orden de prioridad)

### FASE 3 — Prospección avanzada

#### 1. Enriquecedor mejorado (Agente 4) [ ]
- El enriquecedor actual funciona bien para negocios con web propia (hostelería, peluquerías, talleres)
- Mejorar para: LinkedIn scraping de perfiles, cruce con registros públicos
- Las inmobiliarias grandes no funcionan (webs corporativas sin nombre del director)

#### 2. Segmentador automático (Agente 3) [ ]
- Al crear un lead, asignar producto recomendado + prioridad automáticamente
- Mostrar en ficha: "Producto recomendado: Contigo Pyme — Motivo: autónomo hostelería"

---

### FASE 4 — Automatización completa

#### 3. Renovaciones y cross-selling [ ]
- Cuando un lead se marca como "cerrado ganado" → ya pasa a tabla `clientes`
- Alertas de renovación (cron_seguimiento.py ya cubre esto)
- A los 30 días: flujo de cross-selling automático

#### 4. Referidos sistematizados [ ]
- 30 días tras contratación → mensaje automático pidiendo referido
- Referido entra al CRM con tag y prioridad alta

---

## Deuda técnica pendiente

- [ ] Añadir `ANTHROPIC_API_KEY` a Railway env vars (necesario para generación de mensajes con Claude)
- [ ] Añadir `WASSENGER_WEBHOOK_SECRET` a Railway/Vercel env vars (activar verificación HMAC webhook)
- [ ] Probar enriquecimiento con categorías hostelería/peluquerías (mejor rendimiento que inmobiliarias)
- [ ] Google Calendar sync para agenda (campo `google_calendar_id` no existe aún en comerciales)

---

## Stack técnico

| Capa | Tecnología | URL |
|------|-----------|-----|
| Frontend | Next.js + Tailwind | https://prospeccion-manuel.vercel.app |
| Backend | FastAPI + Python | https://prospeccion-manuel-production.up.railway.app |
| Base de datos | Supabase (PostgreSQL) | supabase.com |
| WhatsApp | Wassenger API | configurado y activo |
| IA | Claude (Anthropic) | claude-sonnet-4-6 |
| Email | Resend via Supabase Edge | configurado |
