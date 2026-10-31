# Fondo compartido Esri World Imagery

La integración está preparada para Mi parcela, Mapa, los editores administrativos y el visor de imágenes de parcela. Mantiene Leaflet, GeoJSON, estaciones, capas de clima y Copernicus. No requiere WebGL ni instala otro motor de mapas.

El fondo por defecto sigue siendo EOxCloudless. Para activar Esri, **una vez confirmada una licencia aplicable a la aplicación**, definir en el entorno del frontend:

```env
NUXT_PUBLIC_SATELLITE_BASEMAP=esri
```

`eox` restaura el fondo actual. Reiniciar Node/PM2 con el entorno actualizado; si se usa `.env` para construir, reconstruir y entregar las mismas variables al proceso de producción. Nuxt no carga automáticamente `.env` al ejecutar `.output/server/index.mjs`. Esta opción es pública y no contiene secretos. Se conserva la clave de MapTiler solo por compatibilidad; esta integración no la utiliza.

Se solicitan teselas bajo demanda a:

```
https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

La atribución visible corresponde al servicio consultado el 31/10/2026: Esri, Vantor, Earthstar Geographics y GIS User Community, con enlace al elemento y sus condiciones. Se usa zoom nativo máximo 19 conservador; la resolución real y las fechas varían por ubicación. El encuadre inicial sigue limitado al zoom nativo configurado y no lleva una estación aislada al zoom 21. La imagen de fondo no se utiliza como evidencia científica de los agentes.

No se crea una cuenta, no se activa facturación, no se descargan teselas masivamente ni se guardan en el backend, el volumen `/data` o los respaldos. El navegador aplica su caché HTTP habitual.

## Condiciones verificadas

- [Elemento World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)
- [Metadatos REST](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson)
- [Resumen oficial de uso, 21/04/2025](https://goto.arcgis.com/termsofuse/viewsummary)
- [Atribución oficial](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040)

El acceso público sin token no demuestra autorización de uso gratuito irrestricto. El resumen oficial exige software/licencia o una suscripción aplicable y contiene restricciones para uso comercial, redistribución y descarga sin conexión. La activación en producción queda pendiente de confirmar el derecho de uso; conservar `eox` mientras tanto.

## Regresión

Las pruebas de navegador aceptan `MAP_TEST_BASEMAP=esri`; el servidor de pruebas debe iniciarse con `NUXT_PUBLIC_SATELLITE_BASEMAP=esri`. Usar `MAP_TEST_MOCK_TILES=1` para simular las teselas Esri y no consumir el servicio durante las pruebas. Se verifica el proveedor, el encuadre, los créditos y la preservación de los flujos de estación/parcela.
