# Canales hispano-latinos (M3U)

Lista pública de canales en español y Latinoamérica, ordenada por categorías y con alternativas manuales para pruebas.

## Archivo

canales-hispano-latino-vlc.m3u

Se omitieron las URLs de stream con parámetros de acceso en la consulta. El workflow también elimina esas entradas antes de publicar cada actualización.

## Fuentes y actualización

La generación combina catálogos públicos de iptv-org, TDTChannels, Llorchico/LG y Runtime. GitHub Actions reconstruye la lista una vez al día y publica un commit solo cuando detecta cambios. También puede ejecutarse manualmente desde la pestaña Actions.

## OTTPlayer

Después de publicar el repositorio, usa el enlace Raw del archivo M3U como URL de actualización automática. El repositorio debe permanecer público para que OTTPlayer pueda descargar la lista sin autenticación.

El servicio OTTPlayer puede comprobar esa URL con su propio intervalo. Las URLs de los streams siguen dependiendo de sus fuentes y pueden cambiar o dejar de funcionar.