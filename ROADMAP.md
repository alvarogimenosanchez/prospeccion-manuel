# Roadmap — Sistema de Prospección Manuel

Estado actualizado: 2026-03-15

---

## Lo que ya está construido

### Frontend (Next.js — Vercel)
- `/login` — Login con Google OAuth + protección de rutas por email autorizado
- `/` — Dashboard principal
- `/leads` — Listado de leads con filtros (fuente, estado, ciudad, sector)
- `/leads/[id]` — Ficha de detalle de lead *(página existe, pendiente de contenido completo)*
- `/pipeline` — Vista Kanban con temperatura, interés y botones de movimiento
- `/prospeccion` — Lanzar campañas de scraping (zona libre, ciudades sugeridas, categorías), historial de campañas
- `/agenda` — Gestión de citas
- `/equipos` — Vista multi-equipo
- `/desempeno` — Dashboard de rendimiento por comercial
- `/metricas` — KPIs y estadísticas
- `/mensajes` — Bandeja de mensajes WhatsApp
- `/landing/[producto]` — Landing pages por producto con formulario de captación inbound

### Backend (FastAPI — Railway)
- `POST /scraping/lanzar` — Lanza campaña de scraping (Agente 1: Google Places API)
- `POST /linkedin/enriquecer` — Enriquece leads en background (Agente 4: scraping web + Claude)
- `GET /linkedin/diagnostico` — Debug: muestra candidatos a enriquecer
- `POST /seguimiento/generar-mensaje` — Genera mensaje WhatsApp personalizado con Claude
- `POST /webhook/whatsapp` — Recibe mensajes entrantes de WhatsApp (360dialog)
- Supabase Edge Function `notify-new-lead` — Email via Resend cuando entra un lead nuevo

### Base de datos (Supabase)
Tablas: `leads`, `interactions`, `appointments`, `products`, `comerciales`, `equipos`
Columnas en leads: `nombre`, `apellidos`, `empresa`, `ciudad`, `sector`, `estado`, `temperatura`, `fuente`, `fuente_detalle`, `web`, `direccion`, `cargo`, `telefono_whatsapp`, `notas`, `puntuacion_interes`

---

## Próximos pasos (por orden de prioridad)

### FASE 2 — Completar el ciclo de contacto

#### 1. Página de detalle de lead completa [ ]
- Ficha con todos los datos del lead (nombre, empresa, web, dirección, sector, producto recomendado)
- Historial de interacciones (mensajes WhatsApp enviados/recibidos, citas, notas)
- Botón "Generar mensaje" → llama a `/seguimiento/generar-mensaje` y muestra el resultado
- Botón "Enviar por WhatsApp" → envía via 360dialog API
- Botón "Cambiar estado" (nuevo → contactado → interesado → cerrado)
- Campo de notas editable

#### 2. Generación y envío de mensajes desde la UI [ ]
- En la ficha del lead: generar mensaje personalizado con Claude (ya existe el endpoint)
- El comercial revisa y aprueba con 1 click
- Envío real via 360dialog WhatsApp API
- Guardar el mensaje enviado en tabla `interactions`
- Requiere: añadir `ANTHROPIC_API_KEY` a Railway env vars

#### 3. Chatbot WhatsApp — Agente 5 [ ]
- Cuando llega un mensaje entrante al webhook `/webhook/whatsapp`:
  - Si el lead existe en BD → cargar su historial y contexto
  - Responder automáticamente con Claude usando `knowledge_base_productos.json`
  - Detectar intención: informacional / comparativa / decisional
  - Si detecta señal de compra → notificar al comercial (push o email)
  - Guardar cada mensaje en tabla `interactions`
- Requiere: 360dialog configurado con webhook apuntando a Railway

#### 4. Scoring automático — Agente 6 [ ]
- Después de cada interacción, recalcular temperatura del lead:
  - Caliente / Templado / Frío según respuestas, tiempo, preguntas hechas
- Actualizar `puntuacion_interes` (1-10) y `temperatura` en la ficha
- Próxima acción recomendada automática

---

### FASE 3 — Prospección avanzada

#### 5. Importar base de datos existente de Manuel [ ]
- Subir Excel de contactos actuales → convertir a leads en Supabase
- Deduplicar con leads existentes
- Clasificar automáticamente por estado inicial

#### 6. Agente 2 — Enriquecedor mejorado [ ]
- El enriquecedor actual (Agente 4) funciona bien para negocios pequeños con web propia
- Mejorar para: LinkedIn scraping de perfiles individuales, cruce con registros públicos
- Priorizar categorías donde funciona bien: hostelería, peluquerías, talleres (negocios donde el dueño aparece en la web)
- Las inmobiliarias grandes no funcionan bien (webs corporativas sin nombre del director)

#### 7. Agente 3 — Segmentador automático [ ]
- Al crear un lead, asignar automáticamente producto recomendado + prioridad
- Lógica ya definida en el plan estratégico (ver PLAN_ESTRATEGICO.md)
- Mostrar en la ficha del lead: "Producto recomendado: Contigo Pyme — Motivo: autónomo hostelería"

---

### FASE 4 — Automatización completa

#### 8. Cadencia de seguimiento automática [ ]
- Día 1: primer mensaje
- Día 3 sin respuesta: follow-up suave
- Día 7 sin respuesta: cambio de ángulo
- Día 14 sin respuesta: lead pasa a templado, recordatorio en 30 días
- Motor de cron jobs en Railway

#### 9. Renovaciones y cross-selling [ ]
- Cuando un lead se marca como "cerrado ganado" → pasa a tabla `clientes`
- Recordatorio de renovación según plazo del producto
- A los 30 días: flujo de cross-selling automático

#### 10. Referidos sistematizados [ ]
- 30 días tras contratación → mensaje automático pidiendo referido
- Referido entra al CRM con tag y prioridad alta

---

## Deuda técnica pendiente

- [ ] Añadir `ANTHROPIC_API_KEY` a Railway env vars (necesario para generación de mensajes)
- [ ] Probar enriquecimiento con categorías hostelería/peluquerías (funcionará mejor que inmobiliarias)
- [ ] 360dialog: configurar webhook en producción apuntando a Railway

---

## Stack técnico

| Capa | Tecnología | URL |
|------|-----------|-----|
| Frontend | Next.js + Tailwind | https://prospeccion-manuel.vercel.app |
| Backend | FastAPI + Python | https://prospeccion-manuel-production.up.railway.app |
| Base de datos | Supabase (PostgreSQL) | supabase.com |
| WhatsApp | 360dialog + Meta API | pendiente de configurar |
| IA | Claude (Anthropic) | claude-sonnet-4-6 |
| Email | Resend via Supabase Edge | configurado |
