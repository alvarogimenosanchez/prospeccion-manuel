# Investigación: Mejoras de Prospección — Tendencias globales aplicadas al CRM Manulo
**Fecha:** 18 de abril de 2026  
**Fuentes:** X/Twitter, Autobound, ColdIQ, Apollo, Clay, HubSpot, Lemlist, Artisan, ZoomInfo  
**Método:** Búsqueda en tiempo real de debates de comerciales, SDRs y equipos de ventas en redes

---

## CONTEXTO GLOBAL: QUÉ ESTÁ PASANDO EN PROSPECCIÓN AHORA MISMO

### El gran cambio de 2025
El email masivo ha muerto. Las campañas de alto volumen sin personalización generan ahora un 30% menos de leads que hace dos años (Sopro, 2025). Los equipos que sobrevivieron este cambio hicieron la transición de **volumen → señales + precisión**:

- Campañas a 50 prospectos bien seleccionados: **5,8% de respuesta**
- Campañas masivas: **2,1% de respuesta**
- Outreach basado en señal (trigger): **15–25% de respuesta vs. 3–5% media de cold email**
- Contactar en las primeras 5 minutos tras una señal: **21x más conversión** que esperar 30 minutos

Las herramientas que concentran todas las conversaciones de los comerciales en X son: Clay, Apollo, Lemlist, Klenty, LaGrowthMachine y Reply.io.

---

## 10 GRANDES TENDENCIAS Y SU TRADUCCIÓN A ESTE CRM

---

### TENDENCIA 1 — Prospección basada en señales (Signal-Based Selling)
**Qué hacen los mejores comerciales en X:**
Los SDRs más activos en Twitter/X publican flujos enteros basados en "triggers": detectan el momento exacto en que un prospecto tiene mayor propensión a comprar y atacan en ese momento, no a fuerza bruta.

**Señales de alta conversión que usan:**
- Cambio de trabajo reciente (nuevo directivo = 3x más receptivo en sus primeros 90 días)
- Financiación recibida por una empresa
- Publicación de oferta de empleo (señal de crecimiento)
- Visita a la web de la empresa
- Participación en evento del sector
- Cambio en el stack tecnológico

**Qué tiene hoy el CRM:**  
Scraping de empresas, enriquecimiento básico de LinkedIn, campo `fuente` para saber el origen.

**Mejora propuesta para el CRM:**

#### MEJORA-01: Panel de Señales (`/senales`)
Una nueva sección que agregue y muestre las señales activas de los prospectos:

```
Señal                          Lead               Empresa          Hace
──────────────────────────────────────────────────────────────────────────
💼 Cambio de trabajo           Carlos Fdz.        TechPyme SL      2 días
📈 Empresa buscando empleados  María López        Banco Santander  1 día
🔄 Lead inactivo 30 días       Ana Gómez          Cafetería Aromas 30 días
📞 Respondió WhatsApp          Laura Sánchez      Inmo Costa Sur   hace 2h  ← URGENTE
🎯 Cita no realizada           Javier Torres      —                ayer
```

**Implementación:**  
- Job change: cruzar el nombre/empresa del lead con una búsqueda periódica en LinkedIn scraping
- "Empresa contratando": scraper de Infojobs/LinkedIn Jobs por empresa
- Lead inactivo X días: query SQL contra `updated_at` (ya existe la columna)
- Respondió WhatsApp: ya disponible vía webhook Wassenger
- Prioridad visual: señales con mayor conversión estimada aparecen primero

**Esfuerzo:** 3–5 días | **Impacto:** Alto — elimina el "¿a quién llamo hoy?"

---

### TENDENCIA 2 — Secuencias multicanal automáticas (Cadences)
**Qué hacen en X:**  
Los SDRs diseñan "cadencias" de 7 toques en 14 días combinando WhatsApp, llamada y email. No es spam — es una secuencia planificada con un mensaje diferente en cada toque:

```
Día 1  → WhatsApp (introducción + valor)
Día 3  → Llamada corta
Día 5  → WhatsApp (caso de éxito del sector)
Día 7  → Email con propuesta específica
Día 10 → WhatsApp (seguimiento corto: "¿Pudiste revisar?")
Día 14 → Llamada de cierre o descarte
```

Usar LinkedIn + Email + WhatsApp genera **24% más conversión** que canal único (Apollo, 2025).

**Qué tiene hoy el CRM:**  
Mensajes generados por IA (agente 3), envío manual por WhatsApp. Sin secuencias automáticas.

**Mejora propuesta:**

#### MEJORA-02: Cadencias de prospección (`/cadencias`)
Una nueva sección donde el comercial puede:
1. Elegir una plantilla de cadencia ("Cadencia Pyme — 7 días", "Cadencia Autónomo — 5 días")
2. Asignar un lead o grupo de leads a esa cadencia
3. El sistema genera automáticamente la cola de acciones día a día en `/hoy`
4. Cada paso puede ser revisado antes de enviarse (modo aprobación) o enviarse automáticamente

```
Cadencia: "Pyme 7 días"
Paso 1 - Día 0: WhatsApp introducción        → IA genera mensaje → Comercial aprueba
Paso 2 - Día 2: Recordatorio llamada          → Aparece en /hoy como tarea
Paso 3 - Día 4: WhatsApp caso de éxito Pyme  → IA genera mensaje con sector real del lead
Paso 4 - Día 7: Cierre o descarte            → Modal con opciones
```

**BD necesaria:**
```sql
CREATE TABLE cadencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  pasos jsonb NOT NULL,  -- [{dia:0, canal:"whatsapp", tipo:"introduccion"}, ...]
  created_at timestamptz DEFAULT now()
);

CREATE TABLE lead_cadencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  cadencia_id uuid REFERENCES cadencias(id),
  comercial_id uuid REFERENCES comerciales(id),
  paso_actual integer DEFAULT 0,
  fecha_inicio date DEFAULT CURRENT_DATE,
  estado text DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'completada', 'cancelada')),
  created_at timestamptz DEFAULT now()
);
```

**Esfuerzo:** 1 semana | **Impacto:** Muy alto — multiplica los toques por lead sin aumentar la carga del comercial

---

### TENDENCIA 3 — Enriquecimiento en cascada (Waterfall Enrichment)
**Qué hacen en X:**  
El estándar ahora no es un proveedor de datos, son tres en cascada. Si el primero no tiene el teléfono, pasa al segundo, luego al tercero. Con tres fuentes se alcanza **70–85% de cobertura** vs. 40–50% con una sola.

Clay, Apollo, ZoomInfo y Hunter en combinación son el stack habitual que publican los comerciales en X.

**Qué tiene hoy el CRM:**  
Agente 4 de LinkedIn scraping, búsqueda Google, Bing. Sin priorización por fuente ni cascada organizada.

**Mejora propuesta:**

#### MEJORA-03: Pipeline de enriquecimiento configurable
En la sección `/prospeccion`, añadir un configurador visual de fuentes en orden de prioridad:

```
Fuentes de enriquecimiento (arrastrar para reordenar):
1. LinkedIn scraping         ✓ Activo   [Teléfono, Cargo, Empresa]
2. Google/Bing search        ✓ Activo   [Web, Descripción]
3. Hunter.io API             ○ Inactivo [Email profesional]
4. Apollo.io API             ○ Inactivo [Teléfono directo, LinkedIn]
5. Clearbit API              ○ Inactivo [Sector, Tamaño empresa]
```

Cuando un campo llega vacío del paso 1, el agente prueba automáticamente el paso 2, y así.

**Esfuerzo:** 3–4 días | **Impacto:** Medio-alto — más datos sin trabajo manual

---

### TENDENCIA 4 — Velocidad de respuesta como ventaja competitiva
**Dato clave de la investigación:**  
Contactar un lead en los primeros **5 minutos** hace la conversión **21x más probable** que esperar 30 minutos. Los leads inbound (formulario, WhatsApp entrante, LinkedIn reply) son los más urgentes.

**Qué tiene hoy el CRM:**  
El webhook de WhatsApp (Wassenger) llega al CRM y crea el lead. No hay alerta al comercial asignado.

**Mejora propuesta:**

#### MEJORA-04: Alertas de respuesta urgente
Cuando un lead responde por WhatsApp o solicita información:
1. **Notificación push** al comercial asignado (vía WhatsApp usando el propio Wassenger)
2. El lead aparece con badge `⚡ URGENTE` en `/hoy` y en `/leads`
3. Si el comercial no responde en 30 min → alerta al director de equipo
4. Registro automático en el historial del lead: "Lead respondió — 14:32h — sin atender 45min"

También aplica a:
- Leads con `horas_sin_atencion > 2` (ya calculado en la vista)
- Cita solicitada por el lead (estado `solicitud_pendiente`)
- Lead marcado como "caliente" que lleva 3+ días sin contacto

**Esfuerzo:** 2 días | **Impacto:** Muy alto — el dato de 21x habla solo

---

### TENDENCIA 5 — Lead scoring automático basado en comportamiento
**Qué hacen en X:**  
Los comerciales en X se quejan de que el `nivel_interes` manual en CRMs siempre acaba como 5/10 para todos. El estándar moderno es un score **calculado automáticamente** en base a:

- ¿Respondió alguna vez? (+3 puntos)
- ¿Tiene cita agendada? (+4 puntos)
- ¿Ha interactuado más de una vez? (+2 puntos)
- ¿El perfil encaja con el ICP (cliente ideal)? (+2 puntos)
- ¿Tiempo de inactividad >30 días? (−2 puntos)
- ¿Marcado como cerrado_perdido antes? (−3 puntos)

**Qué tiene hoy el CRM:**  
Campo `nivel_interes` (1–10) asignado manualmente. Campo `prioridad` derivado del nivel_interes. Sin scoring automático.

**Mejora propuesta:**

#### MEJORA-05: Score de conversión automático
Añadir una función SQL/edge function que calcule y actualice el score nightly:

```sql
-- Score automático (0-10) basado en comportamiento real
UPDATE leads SET nivel_interes = LEAST(10, GREATEST(1,
  5  -- base
  + CASE WHEN estado IN ('respondio','cita_agendada','en_negociacion') THEN 3 ELSE 0 END
  + CASE WHEN (SELECT COUNT(*) FROM interactions WHERE lead_id = leads.id) > 2 THEN 2 ELSE 0 END
  + CASE WHEN (SELECT COUNT(*) FROM appointments WHERE lead_id = leads.id) > 0 THEN 2 ELSE 0 END
  - CASE WHEN updated_at < NOW() - INTERVAL '30 days' THEN 2 ELSE 0 END
  - CASE WHEN estado = 'cerrado_perdido' THEN 4 ELSE 0 END
)) WHERE nivel_interes_manual IS FALSE;  -- respetar overrides manuales
```

En la ficha del lead: un badge que explique el score: "7/10 · Respondió + tiene cita"

**Esfuerzo:** 1 día | **Impacto:** Medio — elimina el ruido de scores manuales obsoletos

---

### TENDENCIA 6 — Inbox unificado multicanal
**Lo que publican SDRs en X:**  
El mayor dolor que repiten los comerciales es tener conversaciones de un prospecto repartidas en 4 apps: WhatsApp personal, LinkedIn DMs, email, CRM. El inbox unificado es la feature más pedida en CRMs modernos.

**Qué tiene hoy el CRM:**  
WhatsApp vía Wassenger (ya integrado en la ficha del lead), historial de interacciones. Sin integración de email ni LinkedIn.

**Mejora propuesta:**

#### MEJORA-06: Chat unificado por lead (`/mensajes` o en la ficha)
En la ficha del lead, la pestaña de chat debería mostrar:
- **WhatsApp** (ya existe vía Wassenger)
- **Email** (integrar Gmail/Outlook vía OAuth — el contexto indica que hay MCP de Gmail disponible)
- **Notas de llamada** (los comerciales registran una nota rápida: "Llamé, no contestó", "Me pidió info del SIALP")

Timeline unificado en orden cronológico:
```
📱 WhatsApp · hace 2h · "Perfecto, ¿me mandas más info?"
📧 Email    · hace 1d · Enviado: "Propuesta SIALP personalizada"
📞 Llamada  · hace 3d · Nota: "No contestó, dejé mensaje de voz"
📱 WhatsApp · hace 5d · "Hola Carlos, soy Álvaro de Manuel..."
```

**Esfuerzo:** 3–4 días | **Impacto:** Alto — elimina el saltar entre apps

---

### TENDENCIA 7 — IA que contextualiza mensajes con datos reales del lead
**Lo más compartido en X sobre IA en ventas:**  
El error número 1 es usar ChatGPT genérico para escribir mensajes. Los comerciales con más respuestas usan IA que **tiene contexto del prospecto**:

- Nombre real, empresa real, sector real
- Último punto de contacto ("como hablamos el martes...")
- Señal reciente ("vi que tu empresa está contratando desarrolladores")
- Producto más relevante según el perfil (ya calculado en el CRM)

**Qué tiene hoy el CRM:**  
Agente 3 genera mensajes con algunos datos del lead. El modelo es Claude Haiku.

**Mejoras propuestas:**

#### MEJORA-07a: Prompt contextual mejorado
El mensaje generado debe incluir obligatoriamente:
1. Nombre + empresa + sector del lead
2. El producto principal recomendado **y por qué encaja** (basado en su perfil)
3. Último punto de contacto si existe (última interacción)
4. Señal activa si existe (si el lead respondió recientemente, si tiene cita próxima)

```python
# Añadir al agente 3 actual
context = f"""
Lead: {lead['nombre']} {lead['apellidos']}
Empresa: {lead['empresa']} | Sector: {lead['sector']}
Tipo: {lead['tipo_lead']} | Ciudad: {lead['ciudad']}
Producto principal recomendado: {lead['producto_interes_principal']}
Razón del encaje: {calcular_razon_encaje(lead)}
Último contacto: {lead['ultima_interaccion'] or 'Sin contacto previo'}
Estado actual en pipeline: {lead['estado']}
"""
```

#### MEJORA-07b: Variantes de mensaje por canal
El mismo lead, tres mensajes optimizados para cada canal:
- WhatsApp: corto, conversacional, emoji opcional, sin links
- Email: asunto + cuerpo formal, incluir propuesta de valor clara
- LinkedIn: conexión + nota de 300 caracteres máximo

**Esfuerzo:** 1–2 días | **Impacto:** Medio-alto — mejora la tasa de respuesta directamente

---

### TENDENCIA 8 — Prospección en X/Twitter para captar leads activos
**Lo que la investigación muestra:**  
Especialmente en sectores tech y startup, X es una fuente de leads donde los prospectos **publican sus propios pain points** en tiempo real. Los SDRs más avanzados monitorizan:

- Palabras clave: "buscando seguro", "necesito hipoteca", "alguien conoce...", "recomendación"
- Menciones a competidores: "he tenido mala experiencia con X"
- Hashtags del sector: #autónomos, #pyme, #inmobiliaria

**Applicabilidad al CRM Manulo:**  
El CRM trabaja con seguros e hipotecas para el mercado español. En X.es hay constante flujo de:
- Autónomos quejándose de su seguro médico actual
- Personas preguntando por la mejor hipoteca
- Familias buscando seguro de vida
- Pymes buscando asesoría financiera

**Mejora propuesta:**

#### MEJORA-08: Monitor de X (`/prospeccion` → pestaña "X/Twitter")
Una subsección dentro de prospección que monitorice X en tiempo real:

```
Palabras clave monitorizadas:
  "seguro autónomo" | "mejor hipoteca" | "seguro médico pyme" | "contigo futuro"

Resultados (últimas 24h):
────────────────────────────────────────────────────────────────────
@MariaGarcia_ES  · 2h
"Alguien me recomienda un buen seguro médico para autónomos? 
El de mi banco es carísimo 🤯"  
Valencia · 342 seguidores · Foto de perfil profesional
[+ Añadir como lead]  [Ver perfil]  [Enviar DM]
────────────────────────────────────────────────────────────────────
@PedroLopezArq   · 5h
"Buscando refinanciar mi hipoteca, cualquier recomendación bienvenida"
Madrid · 891 seguidores · Arquitecto
[+ Añadir como lead]  [Ver perfil]  [Enviar DM]
```

Cuando el comercial hace clic en "+ Añadir como lead", se crea el lead con:
- `fuente = 'inbound'`, `fuente_detalle = 'Twitter/X'`
- `notas = 'Detectado via X: "texto del tweet"'`
- `proxima_accion = 'whatsapp'`, fecha inmediata

**Esfuerzo:** 3–5 días (API de X tiene coste) | **Impacto:** Alto para el sector — captura intent explícito

---

### TENDENCIA 9 — Auto-logging de actividad (sin entrada manual)
**El mayor queja de SDRs en X:**  
"Paso 3 horas al día metiendo datos en el CRM en lugar de hablar con clientes." El CRM moderno debe registrar la actividad **automáticamente**:

- Llamada realizada (integración con softphone/móvil) → registra duración + nota
- Email enviado → registra asunto + adjuntos
- WhatsApp enviado → ya llega vía webhook Wassenger

**Qué tiene hoy el CRM:**  
Las interacciones de WhatsApp se registran automáticamente. Las llamadas no.

**Mejora propuesta:**

#### MEJORA-09: Registro de llamada rápido (30 segundos)
Después de cada llamada, un modal simplificado en `/hoy` o en la ficha del lead:

```
📞 ¿Cómo fue la llamada con Carlos Fernández?
[ No contestó ]  [ Contestó · positivo ]  [ Contestó · no interesado ]  [ Volver a llamar ]

Si contestó → Nota rápida: ___________________________
                Próxima acción: [Llamar ▼]  Fecha: [hoy + 3 días]
                Mover a etapa: [actual ▼]
[ Guardar en 1 clic ]
```

Este modal en 30 segundos registra: tipo de interacción, resultado, próxima acción y posible cambio de estado.

**Esfuerzo:** 1 día | **Impacto:** Alto — reduce la fricción de logging drásticamente

---

### TENDENCIA 10 — Vista de pipeline para directores con métricas de actividad
**Lo que piden los managers en X:**  
Los directores comerciales quieren ver no solo el estado del pipeline, sino la **actividad** detrás: cuántos toques por lead, tiempo promedio por etapa, eficiencia de cada comercial.

**Qué tiene hoy el CRM:**  
`/desempeno` existe pero tiene el bug del N+1 queries. `/pipeline` solo muestra los leads del comercial logueado.

**Mejoras propuestas:**

#### MEJORA-10a: Pipeline global con toggle (ya identificado en auditoría)
En `/pipeline`, añadir filtro: "Mi pipeline / Equipo / Toda la empresa"

#### MEJORA-10b: Dashboard de actividad para directores
En `/desempeno`, añadir sección "Actividad de la semana":
```
Comercial         Llamadas  WhatsApps  Citas  Leads movidos
Álvaro Gimeno     12        34         3      8
Carlos Martínez   4         12         1      2        ← ⚠ Baja actividad
María López       18        41         5      14       ← ⭐ Top
```

Esto requiere que las llamadas se logueen (MEJORA-09) y que `lead_state_history` esté funcionando (ya creada en la migración P0 de hoy).

**Esfuerzo:** 2–3 días | **Impacto:** Alto para management

---

## ROADMAP SUGERIDO — Ordenado por impacto/esfuerzo

### Sprint 1 — Esta semana (impacto inmediato, poco esfuerzo)

| # | Mejora | Esfuerzo | Impacto |
|---|--------|----------|---------|
| MEJORA-04 | Alertas urgentes cuando lead responde | 2 días | ⭐⭐⭐⭐⭐ |
| MEJORA-05 | Score automático de conversión | 1 día | ⭐⭐⭐⭐ |
| MEJORA-09 | Modal de registro rápido de llamada | 1 día | ⭐⭐⭐⭐ |
| MEJORA-07a | Prompt IA mejorado con contexto real | 1 día | ⭐⭐⭐⭐ |

### Sprint 2 — Próximas 2 semanas (features de alto valor)

| # | Mejora | Esfuerzo | Impacto |
|---|--------|----------|---------|
| MEJORA-02 | Cadencias multicanal automáticas | 1 semana | ⭐⭐⭐⭐⭐ |
| MEJORA-01 | Panel de señales activas | 3–5 días | ⭐⭐⭐⭐ |
| MEJORA-06 | Inbox unificado (WA + Email + notas) | 3–4 días | ⭐⭐⭐⭐ |
| MEJORA-07b | Variantes de mensaje por canal | 2 días | ⭐⭐⭐ |

### Sprint 3 — Próximo mes (diferenciación competitiva)

| # | Mejora | Esfuerzo | Impacto |
|---|--------|----------|---------|
| MEJORA-08 | Monitor de X/Twitter para captar leads | 3–5 días | ⭐⭐⭐⭐ |
| MEJORA-10b | Dashboard actividad para directores | 2–3 días | ⭐⭐⭐⭐ |
| MEJORA-03 | Enriquecimiento en cascada configurable | 3–4 días | ⭐⭐⭐ |
| MEJORA-10a | Pipeline global (toggle equipo/empresa) | 1 día | ⭐⭐⭐ |

---

## RESUMEN EJECUTIVO

### Los 3 cambios con mayor retorno (basados en los datos de la investigación)

**1. Alertas en tiempo real cuando un lead responde (MEJORA-04)**  
El dato de "21x más conversión en los primeros 5 minutos" es el más impactante de toda la investigación. El CRM ya recibe el webhook de Wassenger — solo falta que dispare una notificación al comercial por WhatsApp. Es literalmente 2 días de trabajo que puede multiplicar x21 la efectividad de los leads inbound.

**2. Cadencias automáticas multicanal (MEJORA-02)**  
La investigación es unánime: los comerciales con secuencias planificadas cierran 2–3x más que los que improvisamos el follow-up. Hoy el comercial de Manulo tiene que recordar manualmente cuándo hacer el toque 2, 3 y 4 con cada lead. Una cadencia automatizada lo hace por él, sin aumentar la carga.

**3. Monitor de X para captura de intent explícito (MEJORA-08)**  
Es la diferencia entre buscar clientes que podrían necesitar nuestros productos y encontrar clientes que **ya están buscando** nuestros productos en tiempo real. En el sector de seguros e hipotecas para España, X tiene volumen relevante de personas expresando sus necesidades públicamente.

---

*Documento generado a partir de investigación en X/Twitter, análisis de herramientas como Clay, Apollo, Lemlist, Reply.io, Artisan, Autobound y debates de SDRs y directores comerciales en 2025–2026.*

---

**Fuentes consultadas:**
- https://www.autobound.ai/blog/state-of-ai-sales-prospecting-2026
- https://coldiq.com/blog/twitter-prospecting-tools
- https://www.clay.com/customers/coverflex
- https://www.artisan.co/blog/ai-prospecting-tools
- https://www.apollo.io/insights/signal-based-selling
- https://coldiq.com/blog/sales-cadence-tools
- https://www.lemlist.com/multichannel-prospecting
- https://fundraiseinsider.com/blog/ai-sdr-tools/
- https://www.breakcold.com/how-to/how-to-do-b2b-sales-with-whatsapp
- https://www.autobound.ai/blog/targeting-prospects-using-x-twitter-posts-turn-tweets-into-leads-with-hyper-personalized-outreach
