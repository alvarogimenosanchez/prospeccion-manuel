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

El sistema usa **Google OAuth** vía Supabase Auth. Para que un nuevo usuario pueda hacer login:

1. Su email debe estar asociado a una cuenta Google real (Gmail, Workspace, etc.).
2. Debe existir una fila en la tabla `comerciales` con ese email exacto (case-insensitive) y `activo = true`.

El `middleware.ts` de Next.js comprueba la sesión de Supabase + la fila `comerciales` antes de
dejar entrar al usuario. Si falta cualquiera de las dos cosas, redirige a `/login`.

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
  "status": "created",
  "data": [{
    "id": "1ceb4381-e742-4ca8-91e9-4ecc128bb5f1",
    "email": "info@flowhipotecas.com",
    "rol": "director",
    "activo": true,
    "objetivo_cierres_mes": 5,
    "objetivo_citas_mes": 20,
    "max_leads_activos": 50,
    "limite_leads_mes": 200,
    ...
  }]
}
```

Si el email ya existe, el endpoint hace UPDATE de `rol` y `activo=true` en lugar de un
insert nuevo (idempotente).

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

## Histórico

| Fecha | Acción |
|---|---|
| 2026-05-11 | Alta de 3 directors: `info@flowhipotecas.com`, `nestorcurto85@gmail.com`, `manulopezz2002@gmail.com` |
