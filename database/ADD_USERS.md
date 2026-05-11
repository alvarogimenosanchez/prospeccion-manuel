# Cómo añadir nuevos usuarios a la plataforma

Esta guía documenta el proceso para dar de alta nuevos comerciales / directores / admins
en el CRM de Prospección.

## Estructura de roles

| Rol | Permisos |
|---|---|
| `admin` | Todos los permisos. Puede gestionar roles, ver todas las métricas, modificar plantillas globales, etc. Único actualmente: `alvarogimeno2002@gmail.com` |
| `director` | Acceso a todos los leads del equipo, métricas globales, gestión de comerciales, lanzar scraping, asignar leads. **Es el rol "máximo después de admin"**. |
| `comercial` | Solo ve sus propios leads + huérfanos. Permisos básicos para gestionar su cartera. |

La RLS de Supabase usa estos roles para decidir qué datos puede leer/escribir cada usuario.

## Requisito previo: cuenta Google

El sistema usa **Google OAuth** vía Supabase Auth. Para que un nuevo usuario pueda hacer login,
hacen falta **3 cosas**:

1. Su email debe estar asociado a una cuenta Google real (Gmail, Workspace, etc.).
2. Debe existir una entrada en `auth.users` de Supabase (pre-creada con la admin API).
3. Debe existir una fila en `comerciales` con `activo = true`.

El `middleware.ts` de Next.js comprueba la sesión + la fila `comerciales` antes de dejar entrar.

**Importante**: Supabase tiene `signups_disabled = true` por seguridad. Eso significa que un
email NUEVO no puede registrarse vía OAuth — devolvería el error
`error_code=signup_disabled`. Por eso el endpoint `/admin/seed-comercial` pre-crea al usuario
en `auth.users` con `supabase.auth.admin.create_user()`, que sí bypassa ese límite (admin).
Cuando luego el usuario hace login con Google, Supabase encuentra el user existente y hace
link en lugar de signup → permitido.

## Método rápido — endpoint backend (recomendado)

Hay un endpoint protegido por secreto en el backend que inserta/actualiza comerciales con
la `service_role` key (que sí puede bypass la RLS):

```bash
# Reemplaza <EMAIL> y <ROL> (admin | director | comercial)
curl -sS -X POST "https://prospeccion-manuel-production.up.railway.app/admin/seed-comercial" \
  -H "Content-Type: application/json" \
  -H "X-Debug-Secret: debug-2026-prospeccion-test-x9k4m2" \
  -d '{"email":"<EMAIL>","rol":"<ROL>"}'
```

**Ejemplo (añadir un director):**

```bash
curl -sS -X POST "https://prospeccion-manuel-production.up.railway.app/admin/seed-comercial" \
  -H "Content-Type: application/json" \
  -H "X-Debug-Secret: debug-2026-prospeccion-test-x9k4m2" \
  -d '{"email":"info@flowhipotecas.com","rol":"director"}'
```

**Respuesta esperada:**

```json
{
  "auth_user": { "status": "created", "id": "1821f09c-..." },
  "comercial": { "status": "created", "id": "1ceb4381-..." },
  "email": "info@flowhipotecas.com",
  "rol": "director"
}
```

- `auth_user.status`: `"created"` (nuevo) o `"already_exists"` (ya estaba)
- `comercial.status`: `"created"` (nuevo) o `"updated"` (ya estaba, actualiza rol/activo)

El endpoint es **idempotente** — puedes llamarlo varias veces con el mismo email sin romper
nada. Si el usuario ya existe en `auth.users`, simplemente actualiza la fila de `comerciales`.

### Notas:

- El email se normaliza a minúsculas automáticamente.
- El campo `nombre` se rellena con la parte del email antes del `@` capitalizada
  (`info@flowhipotecas.com` → "Info"). El usuario puede cambiarlo después desde su perfil.
- Los objetivos y límites por defecto (`5 cierres/mes`, `200 leads/mes`) son sensibles
  ajustables más tarde.

## Verificar quién está dado de alta

```bash
curl -sS "https://prospeccion-manuel-production.up.railway.app/scraping/debug-config" \
  -H "X-Debug-Secret: debug-2026-prospeccion-test-x9k4m2" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
for c in d['checks']['comerciales']:
    print(f\"{c['rol']:10} {c['email']:35} {'✓' if c['activo'] else '✗'}\")
"
```

## Método alternativo — Supabase Dashboard SQL

Si el endpoint backend no estuviera disponible, también se puede hacer directamente vía
Supabase Dashboard → SQL Editor:

```sql
INSERT INTO comerciales (email, nombre, rol, activo)
VALUES ('nuevo@email.com', 'Nombre', 'director', true)
ON CONFLICT (email) DO UPDATE
  SET rol = EXCLUDED.rol, activo = true, updated_at = NOW();
```

## Cómo darse de baja (desactivar)

No borres la fila — desactívala. Así se preserva el histórico de leads/interacciones
asignados a esa persona.

```bash
# Vía el endpoint con rol vacío no se puede, pero puedes hacerlo vía SQL editor:
UPDATE comerciales SET activo = false WHERE email = 'baja@email.com';
```

O cambiar el rol a uno con menos permisos:

```bash
curl -sS -X POST "https://prospeccion-manuel-production.up.railway.app/admin/seed-comercial" \
  -H "Content-Type: application/json" \
  -H "X-Debug-Secret: debug-2026-prospeccion-test-x9k4m2" \
  -d '{"email":"<EMAIL>","rol":"comercial"}'
```

## Seguridad del endpoint

El `X-Debug-Secret` (`debug-2026-prospeccion-test-x9k4m2`) está hardcodeado en
`backend/api/webhook_whatsapp.py`. Si se filtra:

1. Cambia el secret en el código.
2. Redeploya Railway.
3. Actualiza esta documentación con el nuevo secret.

A medio plazo conviene migrarlo a una env var (`ADMIN_SEED_SECRET`) en Railway.

## Troubleshooting

### `error_code=signup_disabled` en la URL de /login después de Google OAuth
Significa que el email **no estaba pre-creado en `auth.users`**. Verifica que el endpoint
`/admin/seed-comercial` devolvió `auth_user.status = "created"` o `"already_exists"`.

### Usuario está en `comerciales` pero al hacer login lo manda a /login con `error=no_autorizado`
Probablemente había un mismatch de capitalización (`Manulopezz` vs `manulopezz`). El
middleware ya usa `.ilike()` para hacer match case-insensitive, pero verifica que tanto el
email en `auth.users` como en `comerciales` están en lowercase.

### El usuario hace login pero no ve nada en la app
Verifica que `comerciales.activo = true`. También revisa que `rol` no esté vacío.

## Histórico

| Fecha | Acción |
|---|---|
| 2026-05-11 | Alta de 3 directors: `info@flowhipotecas.com`, `nestorcurto85@gmail.com`, `manulopezz2002@gmail.com` |
| 2026-05-11 | Alta de cuenta de prueba: `alvarogimeno2002.2@gmail.com` (director) |
| 2026-05-11 | Fix: endpoint ahora pre-crea `auth.users` para bypass `signups_disabled` + middleware ahora case-insensitive |
