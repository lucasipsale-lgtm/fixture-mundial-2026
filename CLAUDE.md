# Fixture Mundial 2026 — Praxia

## Contexto del proyecto
Aplicación web del fixture del Mundial 2026, desarrollada internamente por Praxia.

## Estructura de archivos (fija, no modificar)
```
index.html
css/styles.css
js/main.js
```
No crear carpetas adicionales ni renombrar estos archivos. Todo el CSS va en `css/styles.css`, todo el JS en `js/main.js`.

## API
Los datos provienen de la API pública de ESPN. No romper, reemplazar ni mockear esa conexión bajo ninguna circunstancia. Ante cualquier cambio que toque el fetch o las URLs de la API, advertir explícitamente al usuario antes de proceder.

## Diseño
- Mobile first siempre. Partir desde el breakpoint más pequeño y escalar hacia arriba.
- No agregar dependencias externas (frameworks CSS, JS libraries) sin aprobación explícita.

## Flujo de trabajo
Después de cada cambio aprobado por el usuario:
1. Hacer `git add` de los archivos modificados.
2. Hacer `git commit` con un mensaje descriptivo en español que explique qué cambió y por qué.
3. Hacer `git push origin main` automáticamente.

No pedir confirmación para el commit/push una vez que el usuario aprobó el cambio de código.
