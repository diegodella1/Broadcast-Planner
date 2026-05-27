# Roxom TV — Guest Lineup

Panel de gestión y display para la grilla de invitados del canal. Permite cargar fotos o videos de cada guest, asignarles fecha, host y categoría, y mostrar todo en una pantalla de TV en formato 1920×1080.

---

## Cómo correrlo localmente

### Requisitos

- Node.js 18 o superior
- npm

### Pasos

```bash
# 1. Entrar a la carpeta del proyecto
cd "next project"

# 2. Instalar dependencias (solo la primera vez)
npm install

# 3. Correr el servidor de desarrollo
npm run dev
```

Abrir en el browser:

- **Admin:** `http://localhost:3000/admin`
- **Display:** `http://localhost:3000/display`

---

## Las dos pantallas

### `/display` — Pantalla del canal

Canvas fijo de **1920×1080px** que se escala automáticamente a cualquier resolución manteniendo la proporción. Muestra el guest activo en el panel principal con su foto o video, nombre, host, rol, empresa y fecha. La barra inferior muestra los próximos 3 guests.

- Avanza automáticamente cada 9 segundos
- Se refresca desde el servidor cada 10 segundos — si alguien edita desde el admin, el display se actualiza solo
- Si no hay guests cargados, muestra guests de demo

### `/admin` — Panel de gestión

Formulario para agregar, editar y eliminar guests. Permite subir imagen o video desde la computadora. El botón "Ver Display" abre la pantalla del canal en una pestaña nueva.

---

## Cómo está guardando los datos

Los datos se guardan en archivos locales:

| Qué                                         | Dónde              |
| ------------------------------------------- | ------------------ |
| Datos de guests (nombre, fecha, host, etc.) | `data/guests.json` |
| Imágenes y videos subidos                   | `public/uploads/`  |

Esto funciona perfecto para usar en **una sola computadora**. Si necesitás que múltiples personas accedan desde distintas computadoras, ver la sección de deploy más abajo.

---

## Medidas para imágenes y videos

El panel visual del guest ocupa **680×700px** dentro del canvas de 1920×1080.

| Archivo | Medida ideal   | Formato   | Notas                                            |
| ------- | -------------- | --------- | ------------------------------------------------ |
| Foto    | 1360 × 1400 px | JPG o PNG | La cara debe estar centrada en la mitad superior |
| Video   | 1360 × 1400 px | MP4       | Sin audio requerido                              |

> Si el video y la foto están cargados al mismo tiempo, **el video tiene prioridad** sobre la foto.

---

## Categorías y colores

| Categoría | Color             |
| --------- | ----------------- |
| BITCOIN   | Naranja `#f7931a` |
| MACRO     | Azul `#3b82f6`    |
| POLICY    | Púrpura `#a78bfa` |
| MARKETS   | Verde `#1ae784`   |

El color se asigna automáticamente al seleccionar la categoría, pero se puede personalizar con el color picker.

---

## Estructura del proyecto

```
next project/
├── app/
│   ├── display/          → pantalla del canal (1920×1080)
│   ├── admin/            → panel de gestión de guests
│   └── api/
│       ├── guests/       → GET, POST, PUT, DELETE de guests
│       └── upload/       → subida de imágenes y videos
├── components/
│   └── display/
│       ├── GlCanvas      → wrapper que escala la pantalla a cualquier resolución
│       ├── Hero          → panel principal del guest
│       ├── Strip         → barra inferior con próximos guests
│       └── Shimmer       → efecto de luz animado
├── lib/
│   ├── db.ts             → lectura y escritura de guests.json
│   ├── types.ts          → tipo Guest
│   └── schema.sql        → schema SQL para migración futura a Postgres
├── data/
│   └── guests.json       → base de datos local
└── public/
    └── uploads/          → imágenes y videos subidos
```

---

## Cómo llevarlo a producción

Para que cualquier persona acceda al admin desde su browser y el display refleje los cambios en tiempo real, necesitás un servidor online.

### Opción A — Railway (recomendada, sin cambios en el código)

Railway corre el servidor de Next.js tal cual está. El filesystem es persistente, así que los datos siguen guardándose en `guests.json` y las imágenes en `public/uploads/` — exactamente igual que en local.

1. Crear cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto → "Deploy from GitHub repo" (o subir la carpeta)
3. Railway detecta Next.js y hace el deploy automáticamente
4. Te da una URL pública del tipo `https://guest-lineup.up.railway.app`

**Costo:** ~$5/mes · **Cambios en el código:** ninguno

---

### Opción B — Vercel (gratis, requiere cambios en el código)

Vercel es serverless — no tiene filesystem persistente, así que hay que migrar el almacenamiento a servicios de Vercel.

**Qué migrar:**

| Actualmente                     | Migrar a                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| `data/guests.json` (filesystem) | Vercel Postgres o [Neon](https://neon.tech) (PostgreSQL gratuito) |
| `public/uploads/` (filesystem)  | Vercel Blob                                                       |

**Pasos:**

1. Crear cuenta en [vercel.com](https://vercel.com)
2. Desde el dashboard de Vercel, crear un **Postgres database** y un **Blob store**
3. Copiar las variables de entorno al archivo `.env.local`:

```env
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=
BLOB_READ_WRITE_TOKEN=
```

4. Ejecutar el schema en la base de datos (está en `lib/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS guests (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  role        VARCHAR(255) NOT NULL DEFAULT '',
  company     VARCHAR(255) NOT NULL DEFAULT '',
  host        VARCHAR(255) NOT NULL DEFAULT '',
  program     VARCHAR(255) NOT NULL DEFAULT '',
  category    VARCHAR(50)  NOT NULL DEFAULT 'BITCOIN',
  date        TIMESTAMP    NOT NULL,
  photo_url   TEXT,
  video_url   TEXT,
  color       VARCHAR(7)   NOT NULL DEFAULT '#f7931a',
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

5. Reemplazar `lib/db.ts` para que use `@vercel/postgres` en vez de `fs`
6. Reemplazar `app/api/upload/route.ts` para que use `@vercel/blob`
7. Deploy con `vercel deploy`

**Costo:** Gratis en el tier básico · **Cambios en el código:** `lib/db.ts` y `app/api/upload/route.ts`
