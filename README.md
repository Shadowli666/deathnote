# Deathnote

Aplicación de gestión de notas con frontend en React y persistencia real en SQLite mediante un servidor Node.js.

## Arquitectura

- Frontend: Vite + React en http://127.0.0.1:3000
- Backend: Express + SQLite en http://127.0.0.1:3101
- Archivo de base de datos: data/deathnote.sqlite

## Migración de datos existentes

La primera vez que abras la app con esta versión:

1. El frontend revisa si existe información antigua en localStorage.
2. Si encuentra una base guardada con sql.js o los arreglos legacy, la envía al backend.
3. El backend importa esos datos a data/deathnote.sqlite.
4. Cuando la importación termina, el almacenamiento local anterior se limpia automáticamente.

La migración solo se ejecuta una vez por navegador y se omite si el servidor ya tiene datos.

## Desarrollo

1. Instala dependencias:
   npm install
2. Inicia frontend y backend juntos:
   npm run dev

## Scripts útiles

- npm run dev:client: inicia solo el frontend
- npm run dev:server: inicia solo el backend SQLite
- npm run build: compila el frontend
- npm start: inicia solo el backend

## Exportación para DBeaver

El botón Exportar .sqlite descarga una copia del archivo SQLite servido por el backend. También puedes abrir directamente data/deathnote.sqlite desde DBeaver cuando el servidor no esté escribiendo datos.
