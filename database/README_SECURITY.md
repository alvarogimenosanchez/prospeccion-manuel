# Hardening de seguridad — guía de despliegue

Esta guía explica cómo aplicar la migración de seguridad v2 y rotar las credenciales. Hay **6 pasos**: 5 son configuración + 1 manual de rotación de keys.

---

## 1. Aplicar la migración SQL `schema_security_v2.sql`

1. Abre el SQL Editor en el dashboard de Supabase.
2. Pega el contenido completo de `database/schema_security_v2.sql`.
3. Ejecuta. Es idempotente — se puede correr varias veces.
4. Verifica con:
   ```sql
   SELECT tablename, policyname, cmd
     FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, cmd;
   ```
   Deberías ver políticas como `leads select propios o director`, `comerciales insert director`, etc., y **NINGUNA** `Allow authenticated access`.

**Impacto**: tras esta migración, los comerciales no-director solo ven sus propios leads + los huérfanos. Si necesitas reasignar, hazlo como director o desde el backend con service role.

---

## 2. Deshabilitar email signup en Supabase Auth

Por defecto Supabase permite que cualquiera cree una cuenta vía `/auth/signup`. Aunque el middleware del frontend bloquea el acceso al UI, una cuenta creada directamente da JWT `authenticated` válido para consultar Supabase REST. Hay que desactivarlo.

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**.
2. Desactiva **"Enable Sign Up"** (deja "Enable Email Confirmation" como esté).
3. Guarda.

Solo Google OAuth queda habilitado, y el middleware filtra por `comerciales.activo`.

> Nota: si necesitas crear un usuario nuevo, hazlo desde **Authentication → Users → Invite User** (solo el dashboard).

---

## 3. Configurar variables de entorno nuevas

### Backend (Railway)

Añade en Railway → tu servicio backend → **Variables**:

| Variable | Valor | Cómo obtenerlo |
|---|---|---|
| `SUPABASE_JWT_SECRET` | (string largo) | Supabase Dashboard → Settings → API → JWT Settings → JWT Secret |
| `INTERNAL_CRON_SECRET` | (genera con `openssl rand -hex 32`) | Lo inventas tú. Configúralo también en los crons de Railway |
| `ALLOWED_ORIGINS` | `https://prospeccion-manuel.vercel.app,http://localhost:3000` | Lista separada por comas — quita el `*` que había antes |
| `ENV` | `production` | Activa los modos estrictos (HMAC obligatorio, etc.) |

### Cron de Railway (seguimiento + renovaciones)

Los crons internos ahora deben llevar el header `X-Cron-Secret: <INTERNAL_CRON_SECRET>` en las llamadas a `/seguimiento/ejecutar` y `/seguimiento/renovaciones`. Edita los crons en Railway añadiendo este header en el comando `curl`:

```bash
curl -X POST https://<railway-host>/seguimiento/ejecutar \
  -H "X-Cron-Secret: ${INTERNAL_CRON_SECRET}"
```

---

## 4. CORS — fijar `ALLOWED_ORIGINS`

Antes era `*` por defecto (cualquier sitio podía invocar el backend). Tras la migración, si la variable está vacía o es `*` en producción, CORS rechaza todo. Asegúrate de configurar:

```
ALLOWED_ORIGINS=https://prospeccion-manuel.vercel.app,http://localhost:3000
```

Si añades preview deployments de Vercel, inclúyelos también.

---

## 5. Webhook Wassenger — HMAC obligatorio en producción

Antes el webhook aceptaba cualquier POST si `WASSENGER_WEBHOOK_SECRET` no estaba configurado. Ahora con `ENV=production`, sin secret, **rechaza todos los webhooks**. Verifica que `WASSENGER_WEBHOOK_SECRET` esté configurado en Railway (debería estarlo ya).

---

## 6. (RECOMENDADO) Rotar credenciales

Las claves del entorno local de desarrollo deberían rotarse al menos una vez tras este hardening, por si han estado expuestas en logs/screenshots/historial. Hazlo en este orden:

1. **Supabase Service Role Key**
   Dashboard → Settings → API → "Roll service_role key" → copia el nuevo valor → actualízalo en Railway (`SUPABASE_SERVICE_ROLE_KEY`) → redeploy.

2. **Anthropic API Key**
   console.anthropic.com → API Keys → Create new → revoca la antigua → actualiza Railway (`ANTHROPIC_API_KEY`).

3. **Wassenger API Key + Webhook Secret**
   Wassenger Dashboard → Tokens → genera nuevo → revoca antiguo → actualiza Railway (`WASSENGER_API_KEY`, `WASSENGER_WEBHOOK_SECRET`).

4. **Google Places API Key**
   Google Cloud Console → APIs & Services → Credentials → genera nueva → restringe por IP de Railway o referrer → revoca la antigua → actualiza Railway (`GOOGLE_PLACES_API_KEY`).

5. (Opcional) Rotar el JWT Secret de Supabase invalidaría todas las sesiones existentes — solo si sospechas compromiso real.

---

## Verificación end-to-end

Tras aplicar todo lo anterior:

```bash
# 1) Backend rechaza sin auth
curl -i https://<railway>/api/leads
# → HTTP/1.1 401 Unauthorized

# 2) RLS bloquea a un usuario sin comercial
#    Crea una cuenta en Supabase Auth con un email que NO esté en `comerciales`,
#    obtén su JWT, y prueba:
curl -i "https://<proyecto>.supabase.co/rest/v1/leads" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <JWT>"
# → []  (lista vacía, no devuelve los leads del CRM)

# 3) Webhook sin firma rechaza
curl -X POST https://<railway>/webhook/whatsapp \
  -H "Content-Type: application/json" -d '{}'
# → HTTP/1.1 401 Unauthorized

# 4) Captación pública sigue funcionando con rate limit
curl -X POST https://<railway>/api/public/captacion-lead \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test","telefono":"+34600000000"}'
# → 200 (las primeras 10 veces). A partir de la 11ª en una hora → 429.
```

---

## Modelo de seguridad final (3 capas)

1. **Frontend UI** — Next.js middleware + Supabase Auth + tabla `comerciales.activo`.
2. **Datos en Supabase** — RLS con políticas filtradas por `comercial_id` y rol director.
3. **Backend FastAPI** — `verify_supabase_jwt` en todos los endpoints sensibles + CORS restrictivo + HMAC en webhook.

Para acceder a un lead, un atacante necesita romper las tres capas. Si solo tiene una cuenta de Supabase Auth válida, la RLS le devuelve `[]`. Si tiene la URL del backend, le pide JWT. Si solo tiene el JWT, no pasa el check de `comerciales.activo`.
