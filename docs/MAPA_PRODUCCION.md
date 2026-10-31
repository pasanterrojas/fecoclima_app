# Corrección del mapa en producción · 2026-10-31

La imagen de incidencia muestra el zoom máximo (escala de 5 metros) y el texto alternativo «Marker». El encuadre inicial de Leaflet llegaba a zoom 21 cuando recibía una sola estación o ubicaciones coincidentes. El fondo satelital tiene zoom nativo 14: a 21 se agrandan píxeles y puede verse una superficie uniforme.

El icono se solicitaba en `/fecoclima-estacion-marcador.svg`, fuera del prefijo de la aplicación. Un proxy que solo publica `/fecoclima-ia` no sirve necesariamente ese archivo. El texto «Marker» es el alternativo que usa Leaflet cuando la imagen no carga; sin acceso al servidor no se confirma si el rechazo real fue 404, otra respuesta o una política del navegador.

La corrección limita solo el encuadre automático a la resolución del fondo. Conserva el zoom manual y el encuadre de varias estaciones. El SVG ahora forma parte del build con nombre versionado en `/fecoclima-ia/_nuxt/`; los marcadores usan el nombre de la estación como texto alternativo.

Se verificó typecheck, build y las pruebas de Chrome sin WebGL sobre el artefacto de producción. La regresión de estación única bloquea expresamente la ruta antigua, exige que el SVG cargue realmente y comprueba el zoom 14. El flujo completo con varias estaciones sigue pasando.

Para aplicar la corrección, desplegar el frontend actualizado, incluyendo el nuevo SVG en `app/assets/icons`, reconstruir y reiniciar el proceso de producción. Con la configuración PM2 incluida en el repositorio, desde `frontend` y usando Node >=22.12:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
pm2 restart fecoclima-ia-front --update-env
```

Publicar también `.output/public` o dejar que lo sirva el proceso Node según el proxy existente. No mezclar HTML/JavaScript nuevos con activos de otro build. El proxy debe permitir `/fecoclima-ia/_nuxt/`. Recargar la página después del despliegue. No requiere cambios de base de datos, credenciales ni prompts.

El checkpoint privado anterior conserva el estado previo a este arreglo. Para promover una imagen completa con este cambio se debe generar un checkpoint nuevo; el manifiesto de fuentes actual identifica esta corrección.

## Ilustraciones de soja en W3

El componente también usaba rutas absolutas `/references/soy-phenology/...` fuera del prefijo publicado. Las cinco imágenes originales ahora se importan desde `app/assets/references/soy-phenology`, por lo que el build las publica con nombre versionado en `/fecoclima-ia/_nuxt/`. Se mantienen los encuadres y la correspondencia documental de V1, V2–V4, V5–V8, V9, R1, R3, R5, R7 y R8. Los originales públicos y su `source.json` se conservan para trazabilidad.

La regresión con `MAP_TEST_TECHNICAL_SOURCES=1` bloquea `/references/soy-phenology/*`, muestra las nueve etapas ilustradas y exige que cada imagen se decodifique con sus dimensiones originales desde el prefijo de la aplicación. Este cambio se publica reconstruyendo y reiniciando el mismo frontend; no necesita cambios de configuración del admin.
