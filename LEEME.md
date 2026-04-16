# Regatas Náuticas — Guía de instalación

Aplicación web para gestionar campeonatos de regatas. Lectura pública, edición con contraseña.

---

## Tecnologías
- **Frontend**: HTML + CSS + JS puro (sin frameworks)
- **Backend/DB**: Supabase (gratuito)
- **Hosting**: Netlify (gratuito)

---

## Paso 1 — Crear cuenta en Supabase

1. Ir a https://supabase.com y crear una cuenta gratuita
2. Crear un nuevo proyecto (elegí región más cercana, ej: South America)
3. Guardar la contraseña del proyecto

---

## Paso 2 — Crear la base de datos

1. En el dashboard de Supabase, ir a **SQL Editor**
2. Copiar y pegar todo el contenido de `sql/schema.sql`
3. Hacer clic en **Run**

---

## Paso 3 — Crear usuario administrador

1. En Supabase, ir a **Authentication > Users**
2. Clic en **Add user > Create new user**
3. Ingresar email y contraseña (esta será la contraseña para editar el campeonato)
4. Podés crear múltiples usuarios si son varios los que van a cargar resultados

---

## Paso 4 — Configurar credenciales

1. En Supabase, ir a **Project Settings > API**
2. Copiar:
   - **Project URL** (algo como `https://abcxyz.supabase.co`)
   - **anon public key** (clave larga)
3. Abrir el archivo `js/config.js` y reemplazar:

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU-CLAVE-ANON-PUBLICA';
```

---

## Paso 5 — Publicar en Netlify

### Opción A — Drag & Drop (más fácil)
1. Ir a https://netlify.com y crear cuenta gratuita
2. En el dashboard, arrastrar la carpeta `regatas/` completa al área de deploy
3. ¡Listo! Netlify te da una URL como `https://nombre-aleatorio.netlify.app`
4. Podés cambiar el nombre en **Site settings > Domain management**

### Opción B — GitHub (recomendado para actualizaciones fáciles)
1. Subir la carpeta a un repositorio GitHub
2. En Netlify: **New site > Import from Git**
3. Conectar el repo y hacer deploy
4. Cada vez que hagas cambios al repo, Netlify actualiza automáticamente

---

## Cómo usar la aplicación

### Vista pública (sin login)
- Ver todos los campeonatos
- Ver tabla de resultados con puntos brutos y netos
- Ver resultados por regata
- Exportar CSV

### Vista administrador (con login)
1. Clic en el botón **Admin** en el encabezado
2. Ingresar email y contraseña del usuario creado en Supabase
3. Nuevas opciones disponibles:
   - **+ Nuevo campeonato**: crear campeonato con nombre, regatas, descartes
   - **Participantes**: agregar/eliminar participantes
   - **Cargar regata**: ingresar resultados, DNS/DNF/OCS, regata doble, no descartable

---

## Puntuación

- Puntos = posición de llegada (1° = 1 punto, 2° = 2 puntos, etc.)
- **DNS / DNF / OCS / DSQ / RET** = N+1 puntos (N = cantidad de participantes)
- **Regata doble**: los puntos de esa regata se multiplican × 2
- **No descartable**: esa regata no puede ser descartada aunque sea la peor
- **Descartes**: se descartan las peores puntuaciones (no descartables excluidas)
- Ranking por puntos **netos** (menor puntaje gana), desempate por puntos brutos

---

## Estructura de archivos

```
regatas/
├── index.html          ← Página principal
├── css/
│   └── style.css       ← Estilos
├── js/
│   ├── config.js       ← Credenciales Supabase (EDITAR ESTO)
│   └── app.js          ← Lógica de la aplicación
└── sql/
    └── schema.sql      ← Schema de base de datos (ejecutar en Supabase)
```
