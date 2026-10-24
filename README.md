# Canales hispano-latinos (M3U)

Lista pública de canales en español y Latinoamérica, organizada por categorías temáticas estandarizadas y con alternativas manuales para pruebas.

## Categorías incluidas

1. **Películas**: cine, largometrajes y films.
2. **Series**: series dramáticas y telenovelas.
3. **Anime / Animaciones**: anime, animación infantil y juvenil.
4. **Noticias**: informativos y canales de noticias 24/7.
5. **Deportes**: eventos deportivos, ligas y análisis.
6. **Música**: videoclips, conciertos y radio visual.
7. **Documentales**: historia, ciencia, naturaleza y cultura.
8. **Entretenimiento**: shows de variedades, comedia y estilo de vida.
9. **Religión**: canales comunitarios, de culto y fe.
10. **General**: cadenas nacionales abiertas y televisión local/regional.
11. **Respaldos manuales**: streams alternativos agrupados al final.

Los nombres de canales incluyen prefijo de país (`[CO]`, `[ES]`, `[AR]`, `[MX]`, `[CL]`, etc.) para facilitar su filtrado y búsqueda en cualquier reproductor.

## Archivo

canales-hispano-latino-vlc.m3u

Se omitieron las URLs de stream con parámetros de acceso en la consulta. El workflow también elimina esas entradas antes de publicar cada actualización.

## Fuentes y actualización

La generación combina catálogos públicos de iptv-org, TDTChannels, Llorchico/LG y Runtime. GitHub Actions reconstruye la lista una vez al día y publica un commit solo cuando detecta cambios. También puede ejecutarse manualmente desde la pestaña Actions.

## OTTPlayer

Después de publicar el repositorio, usa el enlace Raw del archivo M3U como URL de actualización automática. El repositorio debe permanecer público para que OTTPlayer pueda descargar la lista sin autenticación.

El servicio OTTPlayer puede comprobar esa URL con su propio intervalo. Las URLs de los streams siguen dependiendo de sus fuentes y pueden cambiar o dejar de funcionar.
