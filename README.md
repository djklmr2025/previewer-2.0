# Previewer 2.0 (Standalone)

Visor independiente para proyectos JSON del Flow Diagram Builder.

## Incluye

- Abrir JSON local (`vector` o `proyecto`) 
- Cargar por URL params:
  - `?id=...` (usa `/api/project`)
  - `?data=...` (JSON embebido)
  - `?project=https://.../file.json` (URL externa)
- Fondo opcional (imagen local)
- Fijar vista (bloquear paneo)
- Rotar `-15° / +15°`
- Voltear horizontal/vertical
- Zoom `10%` a `500%`
- Limpiar vista
- Panel lateral plegable de catálogo
- Listado de `library` (vectores) y `projects` (proyectos)
- Mini previsualización de cada item
- Búsqueda/filtro por nombre o id
- Subida de nuevo JSON (`vector` o `proyecto`) a Blob vía API:
  - `POST /api/publish` (vector)
  - `POST /api/publish-project` (proyecto)
- Visor multimedia/3D integrado:
  - Imagen: `gif`, `webp`, `png`, `jpg`, `jpeg`
  - Video: `mp4`, `webm`
  - 3D: `glb`, `gltf`, `obj` (+ `mtl` opcional)

## Uso local rápido

Abre `index.html` con cualquier servidor estático.

Ejemplo con `npx`:

```bash
npx serve .
```

Luego entra a `http://localhost:3000/previewer-2.0/`

## Nota

Este módulo está aislado para evolucionar como repo independiente sin romper el builder actual.
