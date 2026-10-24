/* Fuentes abiertas; cada adapter interpreta el formato propio del proveedor. */
window.APP_CONFIG = Object.freeze({
    sources: [
        {
            id: 'colombia-m3u',
            type: 'm3u',
            label: 'iptv-org · Colombia',
            countryCode: 'CO',
            url: 'https://iptv-org.github.io/iptv/countries/co.m3u'
        },
        {
            id: 'tdtchannels-json',
            type: 'tdt-json',
            label: 'TDTChannels · JSON',
            url: 'https://www.tdtchannels.com/lists/tv.json'
        },
        {
            id: 'lg-mexico-m3u',
            type: 'm3u',
            label: 'LG México · HLS directo',
            countryCode: 'MX',
            url: 'https://raw.githubusercontent.com/Llorchico/LG/refs/heads/main/mxlg.m3u',
            stripChannelNumberPrefix: true,
            skipTemplateUrls: true,
            requireHls: true,
            excludeHosts: ['jmp2.uk', 'pluto.tv'],
            excludeNameContains: ['pluto']
        },
        {
            id: 'runtime-m3u',
            type: 'm3u',
            label: 'Runtime · títulos HLS (pendiente de prueba)',
            url: 'https://llorchico.github.io/Runtime/runtime.m3u',
            skipTemplateUrls: true,
            requireHls: true
        },
        {
            id: 'iptv-org-json',
            type: 'iptv-org-json',
            label: 'iptv-org · API JSON',
            channelsUrl: 'https://iptv-org.github.io/api/channels.json',
            streamsUrl: 'https://iptv-org.github.io/api/streams.json',
            blocklistUrl: 'https://iptv-org.github.io/api/blocklist.json',
            spanishCountries: [
                'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GT', 'HN',
                'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE'
            ]
        }
    ],
    categoryLabels: {
        all: 'Todo',
        colombia: 'Colombia',
        movies: 'Películas',
        series: 'Series',
        animation: 'Anime / Animaciones',
        entertainment: 'Entretenimiento',
        documentary: 'Documentales',
        general: 'General',
        sports: 'Deportes',
        news: 'Noticias',
        music: 'Música',
        religious: 'Religión'
    }
});
