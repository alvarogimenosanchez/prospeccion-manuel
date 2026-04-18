# Auditoría completa CRM Manulo
**Fecha:** 18 de abril de 2026  
**Alcance:** Todas las páginas frontend + base de datos Supabase + coherencia código-esquema  
**Método:** Lectura exhaustiva de código + consultas SQL directas a producción

---

## 1. BUGS CRÍTICOS Y GAPS TÉCNICOS

### 🔴 P0 — Rompen funcionalidad en producción ahora mismo

---

#### BUG-01: 5 tablas referenciadas en código no existen en la BD

**Impacto:** Las siguientes páginas devuelven datos vacíos o fallan silenciosamente:

| Tabla faltante | Usada en | Consecuencia |
|---|---|---|
| `clientes` | /clientes, /dashboard, agent2_seguimiento | Página de clientes vacía. Dashboard muestra 0 clientes activos siempre |
| `teams` | /equipos, /agenda, /desempeno, /pipeline | Filtros de equipo no funcionan. /equipos carga vacío |
| `team_members` | /equipos, /desempeno | Asignaciones de equipo imposibles |
| `mensajes_pendientes` | /mensajes | Toda la página de mensajes vacía. "Pendientes IA" siempre 0 |
| `lead_state_history` | /desempeno | "Velocidad del pipeline" nunca muestra datos |

**Solución:** Crear las 5 tablas. Ver Sección 4 para los DDL sugeridos.

---

#### BUG-02: 6 columnas faltantes en `leads`

La tabla `leads` en producción **no tiene** estas columnas que el código usa:

| Columna faltante | Usada en | Consecuencia |
|---|---|---|
| `proxima_accion` | /hoy (secciones 1, 2), /desempeno, /leads/[id] | Toda la cola de tareas de /hoy está rota: secciones "Acciones vencidas" y "Hacer hoy" siempre vacías |
| `proxima_accion_fecha` | ídem | ídem |
| `proxima_accion_nota` | /hoy, /leads/[id] | Notas de acciones no se guardan ni muestran |
| `team_id` | /equipos (query leads por equipo), /agenda (filtro equipo) | Filtro por equipo en agenda no funciona |

**Solución:**
```sql
ALTER TABLE leads 
  ADD COLUMN proxima_accion text,
  ADD COLUMN proxima_accion_fecha timestamptz,
  ADD COLUMN proxima_accion_nota text,
  ADD COLUMN team_id uuid REFERENCES teams(id);
```

---

#### BUG-03: 3 columnas faltantes en `comerciales`

| Columna faltante | Usada en | Consecuencia |
|---|---|---|
| `rol` | /desempeno — filtro "Director / Comercial" | Filtro de rol invisible, no funciona |
| `objetivo_cierres_mes` | /desempeno — barra de progreso de objetivos | Siempre muestra objetivo por defecto (5), no se puede personalizar |
| `objetivo_citas_mes` | /desempeno — barra de progreso de objetivos | ídem (20) |

**Solución:**
```sql
ALTER TABLE comerciales 
  ADD COLUMN rol text DEFAULT 'comercial' CHECK (rol IN ('director', 'comercial')),
  ADD COLUMN objetivo_cierres_mes integer DEFAULT 5,
  ADD COLUMN objetivo_citas_mes integer DEFAULT 20;
```

---

#### BUG-04: Constraint de `appointments.resultado` incompatible con código

**DB tiene:** `CHECK (resultado IN ('interesado', 'no_interesado', 'pendiente_decision', 'contrato_iniciado'))`

**El modal post-cita en /agenda intenta insertar:**
- `necesita_mas_info` → ❌ no está en el constraint → **fallo silencioso, nota no se guarda**
- `cerrado_ganado` → ❌ ídem
- `aplazado` → ❌ ídem

Cuando el comercial rellena el modal post-cita con cualquiera de esos 3 valores, el update falla sin mostrar error. La cita se marca como "realizada" pero sin resultado ni nota.

**Solución:**
```sql
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_resultado_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_resultado_check 
  CHECK (resultado IN ('interesado', 'necesita_mas_info', 'no_interesado', 'cerrado_ganado', 'aplazado', 'pendiente_decision', 'contrato_iniciado'));
```

---

#### BUG-05: `appointments.estado` no incluye `solicitud_pendiente`

**DB tiene:** `CHECK (estado IN ('pendiente', 'confirmada', 'realizada', 'cancelada', 'no_show'))`

El código de /agenda usa `solicitud_pendiente` en `ESTADO_CITA_STYLE` y en la alerta "pendientes de confirmar". Si algún registro tiene ese estado, la visualización se rompe.

**Solución:**
```sql
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_estado_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_estado_check 
  CHECK (estado IN ('pendiente', 'confirmada', 'realizada', 'cancelada', 'no_show', 'solicitud_pendiente'));
```

---

### 🟠 P1 — Alto impacto, degradan funcionalidad importante

---

#### BUG-06: Dashboard muestra contadores de temperatura hardcodeados

`/dashboard` (page.tsx líneas 80–97) sigue calculando y mostrando `leads_calientes`, `leads_templados`, `leads_frios`. Desde que la temperatura es manual, estos contadores mostrarán 0 casi siempre. La tarjeta "Calientes" del dashboard es engañosa.

**Fix:** Reemplazar las 3 tarjetas de temperatura por tarjetas más útiles: "Sin asignar", "En negociación", "Citas esta semana".

---

#### BUG-07: Import de Excel sigue poniendo `temperatura: "frio"` automáticamente

En `prospeccion/page.tsx` línea 363:
```js
temperatura: "frio" as const,
```
Esto contradice la decisión de que la temperatura la asigne el usuario.

**Fix:** Eliminar esa línea.

---

#### BUG-08: `/hoy` sección "Calientes sin tocar" depende de `temperatura`

La sección 3 de /hoy filtra `temperatura = 'caliente'`. Dado que ahora la temperatura es manual, esta sección estará vacía para leads recién importados aunque sean urgentes.

**Fix:** Cambiar esa sección para que muestre leads en estado `respondio` o `en_negociacion` sin actividad en las últimas 24h — independientemente de temperatura.

---

#### BUG-09: Webhook Wassenger sin verificación de firma

`backend/api/webhook_whatsapp.py` acepta mensajes entrantes sin verificar la firma HMAC de Wassenger. Cualquiera que conozca el endpoint puede inyectar mensajes falsos en el sistema, crear interacciones en cualquier lead y potencialmente manipular estados.

**Fix urgente:**
```python
import hmac, hashlib
signature = request.headers.get("X-Wassenger-Signature")
expected = hmac.new(WASSENGER_WEBHOOK_SECRET.encode(), await request.body(), hashlib.sha256).hexdigest()
if not hmac.compare_digest(signature, expected):
    raise HTTPException(403, "Invalid signature")
```

---

#### BUG-10: `/desempeno` hace 13 queries SQL por comercial en bucle secuencial

En `desempeno/page.tsx` línea 160–211, hay un `for (const comercial of comerciales)` que lanza 13 `await Promise.all(...)` por comercial. Con 10 comerciales = 130 consultas SQL en serie. Con 20 = 260. En producción esto causará timeouts y la página tardará 15–30 segundos.

**Fix:** Convertir a consultas SQL agregadas con GROUP BY usando Supabase RPC o una vista materializada.

---

### 🟡 P2 — Mejoras UX/flujo

---

#### GAP-11: No hay paginación real en ninguna lista

Todos los listados tienen `.limit(100)` o `.limit(500)` pero ninguno tiene paginación real. Con 303 leads ya (y creciendo), el usuario no puede ver leads 101–200.

**Fix:** Añadir paginación "offset" o scroll infinito en /leads, /prospeccion, /pipeline.

---

#### GAP-12: No se puede crear una cita desde /agenda

El único sitio donde se puede crear una cita es la ficha del lead (`/leads/[id]`). Desde /agenda no hay botón "Nueva cita". El comercial tiene que ir al lead, luego volver a la agenda.

**Fix:** Añadir botón "+ Nueva cita" en /agenda que abra un modal con selector de lead.

---

#### GAP-13: Métricas no tienen filtro por periodo ni por comercial

`/metricas` es siempre global y siempre "todos los tiempos". No se puede ver el funnel del mes pasado, ni el ROI por fuente de un comercial específico.

**Fix:** Añadir selector de periodo (7d, 30d, 90d, este año) y filtro por comercial_asignado.

---

#### GAP-14: Vista semanal de agenda no permite ver detalles de cita

En la vista semanal (grid 7 columnas), las tarjetas compactas son muy pequeñas y no muestran la empresa. Hacer clic no abre detalle — solo el link "Ver lead →" que saca al usuario de la agenda.

**Fix:** Modal de detalle al hacer clic en tarjeta compacta, sin salir de la agenda.

---

#### GAP-15: /hoy no respeta el comercial logueado

`/hoy` muestra tareas de **todos** los comerciales mezcladas. Un comercial ve las tareas de otro.

**Fix:** Filtrar todas las queries de /hoy por `comercial_asignado = currentComercialId` (igual que se hizo en /pipeline).

---

#### GAP-16: Pipeline no tiene vista para directores

Un director no puede ver el pipeline global. La implementación actual es personal-only.

**Fix:** Añadir toggle "Mi pipeline / Global" visible solo para usuarios con `rol = 'director'`.

---

#### GAP-17: Clientes no están vinculados automáticamente al lead origen

En /clientes hay un campo `lead_id` que debería rellenarse automáticamente cuando el estado del lead cambia a `cerrado_ganado`. Actualmente el comercial tiene que crear el cliente manualmente y no hay ningún flujo automático de lead → cliente.

**Fix:** Cuando un lead pasa a `cerrado_ganado`, crear automáticamente un registro en `clientes` con los datos del lead y `lead_id` apuntando al lead original.

---

#### GAP-18: Tiempo estimado de etapa en /metricas es incorrecto

En `metricas/page.tsx` línea 280–293, el "tiempo medio por etapa" se calcula como `diasEntre(fecha_captacion, updated_at)`. Esto mide el tiempo total desde captación, no el tiempo en cada etapa individual. Un lead en `respondio` muestra "días desde captación", no "días desde que se contactó".

**Fix:** Usar `lead_state_history` para calcular tiempo real en cada etapa.

---

## 2. MEJORAS POR PÁGINA

### Dashboard `/`
**Estado actual:** Funcional pero con información obsoleta  
**Mejoras:**
- Eliminar tarjetas de temperatura (caliente/templado/frío) → reemplazar por "Leads sin asignar", "En negociación esta semana", "Citas pendientes de confirmar"
- Las alertas "Sin atender" (rojo) dependen de temperatura=caliente → cambiar a leads con `nivel_interes ≥ 7` sin actividad en 24h
- Añadir notificación de clientes con renovación en 7 días (ahora solo se muestra en 30 días)
- El pipeline summary solo muestra números — añadir mini barras de progreso para visualizar el embudo de un vistazo
- Link desde "Nuevos hoy" → /prospeccion (no /leads), que es donde se gestionan los nuevos

---

### Trabajo de hoy `/hoy`
**Estado actual:** Diseño excelente, pero roto por columnas faltantes  
**Mejoras prioritarias (una vez arreglados los bugs):**
- Filtrar por comercial logueado (BUG-15)
- Sección "Calientes sin tocar" → redefinir sin depender de temperatura
- Añadir sección "Citas sin registrar resultado" (ya existe en /agenda pero no en /hoy)
- Botón "Posponer" en acciones: establecer `proxima_accion_fecha` para mañana sin marcar como hecha
- Contador total de tareas en el título del tab del navegador: `(5) Trabajo de hoy`

---

### Leads `/leads`
**Estado actual:** Lista funcional, sin paginación  
**Mejoras:**
- Paginación real (actualmente límite 100)
- Ordenación por columna (click en cabecera)
- Filtro por comercial asignado (para directores)
- Columna "Última actividad" visible en tabla
- Acción rápida inline "Asignar a mí" para leads sin comercial asignado
- Export CSV de la lista actual

---

### Ficha lead `/leads/[id]`
**Estado actual:** La más completa, bien estructurada  
**Mejoras:**
- Cuando `estado = 'cerrado_ganado'` mostrar botón "Convertir en cliente" → crea registro en `clientes` automáticamente
- Historial de interacciones vacío por ahora (tabla `interactions` tiene 0 filas en prod) — verificar que el webhook de Wassenger escribe correctamente
- Sección de citas: mostrar historial de citas pasadas, no solo la próxima
- Añadir campo "Valor estimado" al lead para que el pipeline tenga valor económico
- El botón WhatsApp directo (Wassenger) no tiene confirmación antes de enviar — añadir preview del mensaje

---

### Pipeline `/pipeline`
**Estado actual:** Funcional, personal por comercial  
**Mejoras:**
- Vista global para directores (BUG-16)
- Drag & drop en las tarjetas (actualmente solo con botones ← →)
- Mostrar valor económico total de cada columna si hay `valor_estimado`
- Filtro por producto en la columna
- Tarjeta debería mostrar `proxima_accion` si existe (actualmente no la muestra)

---

### Mensajes `/mensajes`
**Estado actual:** Completamente rota — tabla `mensajes_pendientes` no existe  
**Mejoras (post-fix):**
- Separar "Pendientes de revisión" vs "Aprobados sin enviar" en pestañas
- Añadir filtro por comercial para directores
- "Enviar por WhatsApp" debería usar la API de Wassenger (envío directo) en vez de abrir wa.me (que requiere hacerlo manual desde el móvil)
- Indicador de cuándo se generó el mensaje (hace Xh)

---

### Agenda `/agenda`
**Estado actual:** Bien diseñada, varios bugs  
**Mejoras:**
- Crear cita directamente desde la agenda (BUG-12)
- Vista de detalle al hacer clic en tarjeta compacta (BUG-14)
- Sincronización con Google Calendar (prioridad alta para el equipo)
- El modal post-cita no actualiza el estado del lead a `en_negociacion` cuando resultado es `interesado` — actualmente sí lo hace, pero el constraint lo bloquea (BUG-04)
- Añadir campo "lugar" para reuniones presenciales
- Recordatorio automático 24h antes (push notification o WhatsApp al comercial)

---

### Prospección `/prospeccion`
**Estado actual:** Funcional para scraping e importación  
**Mejoras:**
- Eliminar `temperatura: "frio"` del import (BUG-07)
- Mostrar progreso en tiempo real del scraping (actualmente solo "buscando...")
- Historial de campañas en BD, no en localStorage (se pierde al limpiar caché)
- Agente 4 (LinkedIn) tiene botón pero el backend puede no estar disponible — mejor UI de estado del backend
- Import Excel: preview muestra máximo 50 filas — mostrar total al usuario
- Añadir columna "Estado" al listado de leads (actualmente solo se ve en el filtro)

---

### Mapa `/mapa`
**Estado actual:** Funcional con coordenadas estáticas hardcodeadas  
**Mejoras:**
- Las coordenadas son estáticas por ciudad — leads de barrios/códigos postales no tienen coordenadas exactas
- Añadir clustering cuando hay muchos leads en la misma ciudad
- Click en marcador → panel lateral con acceso directo a la ficha del lead
- Filtro por producto recomendado (ver dónde están los leads más relevantes para cada producto)
- Exportar vista del mapa como imagen o PDF para presentaciones

---

### Métricas `/metricas`
**Estado actual:** Funcional pero con datos inexactos  
**Mejoras:**
- Filtro por periodo (BUG-13)
- Filtro por comercial
- Tiempo medio por etapa usa fecha incorrecta (BUG-18)
- Añadir gráfico de tendencia mensual (leads captados mes a mes)
- Sección "Seguimiento" con botón "Ejecutar" llama al backend — si está caído no hay feedback claro
- Añadir métrica "Leads por comercial" para comparar carga de trabajo

---

### Desempeño `/desempeno`
**Estado actual:** Diseño excelente pero roto por columnas faltantes y N+1 queries  
**Mejoras:**
- Arreglar N+1 queries (BUG-10)
- Columnas `rol`, `objetivo_cierres_mes`, `objetivo_citas_mes` faltantes (BUG-03)
- Vista personal: un comercial debería poder ver su propio desempeño sin necesitar ser director
- "Velocidad del pipeline" siempre vacía porque `lead_state_history` no existe (BUG-01)
- Alertas de "calientes sin atender" dependen de temperatura
- Gráfico de tendencia mensual de cierres (actualmente solo compara periodo actual vs anterior)
- Añadir `ultima_actividad` calculada desde `interactions` (actualmente usa `updated_at` del lead, menos preciso)

---

### Clientes `/clientes`
**Estado actual:** Completamente rota — tabla `clientes` no existe  
**Mejoras (post-fix):**
- Conversión automática lead → cliente (BUG-17)
- Filtro por producto contratado
- Alertas de renovación proactivas (email o WhatsApp automático al comercial)
- Vista "Portfolio por comercial" — qué cartera tiene asignada cada uno
- Campo "Historial de interacciones post-venta"
- KPI "Valor promedio de contrato por comercial"

---

### Equipos `/equipos`
**Estado actual:** Completamente rota — tablas `teams` y `team_members` no existen  
**Mejoras (post-fix):**
- Asignación de leads a equipo (campo `team_id` en leads faltante — BUG-02)
- Comparativa de rendimiento entre equipos en /metricas
- Lider de equipo puede ver el pipeline de su equipo (actualmente solo directores globales)

---

## 3. REDISEÑO DE NAVEGACIÓN

### Situación actual
El menú actual tiene 10 items:
`Dashboard | Hoy | Leads | Pipeline | Mensajes | Agenda | Prospección | Mapa | Métricas | Desempeño | Clientes | Equipos`

Son demasiados. El usuario tiene que aprender 12 destinos distintos para hacer su trabajo diario.

### Problemas detectados
1. **Hoy y Pipeline** resuelven el mismo problema de dos ángulos distintos — confuso cuándo usar cada uno
2. **Mensajes** debería estar integrado como pestaña en la ficha del lead, no como página separada
3. **Prospeccion y Leads** se solapan — Prospeccion muestra leads nuevos de scraping, Leads muestra todos
4. **Mapa** es una vista de Leads — no necesita ser página top-level
5. **Métricas y Desempeño** son dos páginas de analytics que deberían ser una sola

### Propuesta de nueva arquitectura

```
TRABAJO DIARIO
├── 🏠 Inicio (dashboard simplificado)
├── ✅ Hoy (cola de tareas — absorbe Pipeline personal)
└── 📅 Agenda (citas del comercial)

LEADS
├── 📋 Leads (lista + filtros + mapa como vista alternativa)
└── 🎯 Prospección (scraping + importación)

VENTAS
├── 📊 Pipeline (kanban — global para director, personal para comercial)
└── 🏆 Clientes (cartera post-venta)

EQUIPO
├── 📈 Métricas (funnel + ROI — absorbe parte de Desempeño)
├── 👥 Desempeño (por comercial — absorbe Equipos)
└── 💬 Mensajes (WhatsApp masivo — o integrar en Leads)
```

**Resultado:** De 12 items a 9, con agrupación clara por contexto de uso.

---

## 4. ROADMAP PRIORIZADO

### P0 — Crítico: arreglar antes del lunes

| # | Tarea | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Crear tabla `clientes` con schema correcto | 1h | /clientes, /dashboard |
| 2 | Crear tablas `teams` y `team_members` | 1h | /equipos, /agenda, /desempeno |
| 3 | Crear tabla `mensajes_pendientes` | 30min | /mensajes |
| 4 | Crear tabla `lead_state_history` | 30min | /desempeno velocidad |
| 5 | Añadir columnas a `leads`: proxima_accion, proxima_accion_fecha, proxima_accion_nota, team_id | 15min SQL | /hoy (completamente roto) |
| 6 | Añadir columnas a `comerciales`: rol, objetivo_cierres_mes, objetivo_citas_mes | 15min SQL | /desempeno objetivos |
| 7 | Arreglar constraint `appointments.resultado` | 5min SQL | Modal post-cita |
| 8 | Añadir `solicitud_pendiente` a constraint `appointments.estado` | 5min SQL | Agenda |
| 9 | Añadir verificación de firma en webhook Wassenger | 1h backend | Seguridad |

**Total P0: ~6 horas de trabajo**

---

### P1 — Esta semana

| # | Tarea | Esfuerzo | Impacto |
|---|---|---|---|
| 10 | Filtrar /hoy por comercial logueado | 30min | Privacidad de tareas |
| 11 | Eliminar temperatura automática en import Excel | 5min | Consistencia |
| 12 | Arreglar cálculo "tiempo por etapa" en /metricas | 2h | Datos de conversión correctos |
| 13 | Conversión automática lead → cliente al cerrar ganado | 2h | Flujo de ventas completo |
| 14 | Paginación en /leads y /prospeccion | 2h | Con 303+ leads es bloqueante |
| 15 | Arreglar N+1 queries en /desempeno | 4h | Timeout en producción |
| 16 | Dashboard: reemplazar tarjetas temperatura por métricas útiles | 1h | Dashboard honesto |

---

### P2 — Próximas 2 semanas

| # | Tarea | Esfuerzo |
|---|---|---|
| 17 | Vista global Pipeline para directores | 2h |
| 18 | Crear cita desde /agenda | 3h |
| 19 | Filtro periodo + comercial en /metricas | 3h |
| 20 | Botón "Enviar por WhatsApp" en /mensajes usa Wassenger (directo) | 2h |
| 21 | Sincronización Google Calendar en /agenda | 1 semana |
| 22 | Modal detalle cita en vista semanal | 2h |
| 23 | Historial campañas scraping en BD, no localStorage | 1h |

---

### P3 — Backlog futuro

| # | Tarea |
|---|---|
| 24 | Drag & drop en Pipeline |
| 25 | Recordatorios automáticos 24h antes de cita (WhatsApp al comercial) |
| 26 | Push notifications para alertas urgentes |
| 27 | App móvil (o PWA) |
| 28 | Integración con LinkedIn Sales Navigator |
| 29 | Exportación PDF de informes de desempeño |
| 30 | Vista "Portfolio por comercial" en /clientes |
| 31 | Geocodificación real de leads (reemplazar coordenadas estáticas del mapa) |
| 32 | Rediseño de navegación (propuesta de 9 items en 3 grupos) |

---

## 5. DDL PARA TABLAS FALTANTES

```sql
-- ── Tabla clientes ──────────────────────────────────────────────────────────
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  lead_id uuid REFERENCES leads(id),
  comercial_asignado uuid REFERENCES comerciales(id),
  nombre text NOT NULL,
  apellidos text,
  email text,
  telefono text,
  empresa text,
  producto text,
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  fecha_renovacion date,
  valor_contrato numeric,
  estado text DEFAULT 'activo' CHECK (estado IN ('activo', 'renovado', 'pausado', 'cancelado')),
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Tabla teams ──────────────────────────────────────────────────────────────
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  nombre text NOT NULL,
  descripcion text,
  zona_geografica text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── Tabla team_members ───────────────────────────────────────────────────────
CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  comercial_id uuid NOT NULL REFERENCES comerciales(id) ON DELETE CASCADE,
  rol text DEFAULT 'miembro' CHECK (rol IN ('lider', 'miembro')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (team_id, comercial_id)
);

-- ── Tabla mensajes_pendientes ────────────────────────────────────────────────
CREATE TABLE mensajes_pendientes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mensaje text NOT NULL,
  canal text DEFAULT 'whatsapp',
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'enviado', 'descartado')),
  editado_por_comercial boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Tabla lead_state_history ─────────────────────────────────────────────────
CREATE TABLE lead_state_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  comercial_id uuid REFERENCES comerciales(id),
  estado_anterior text,
  estado_nuevo text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

---

## Resumen ejecutivo

**La app tiene un grave problema de desfase entre código y base de datos.** Se han desarrollado 5 páginas enteras (Clientes, Equipos, Mensajes, velocidad en Desempeño, cola de /Hoy) contra tablas y columnas que nunca se crearon en producción. El resultado es que páginas que parecen funcionales devuelven datos vacíos o fallan silenciosamente.

La buena noticia: todo es solucionable. Con 6 horas de trabajo en BD (ejecutar los DDL de arriba + las migraciones de ALTER TABLE), el 80% de las funcionalidades rotas pasarían a funcionar inmediatamente.

El diseño frontend en general es **de alta calidad** — las páginas de /hoy, /agenda, /desempeno y /pipeline están muy bien pensadas y una vez corregidos los datos de BD serán herramientas potentes para el equipo comercial.
