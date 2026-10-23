/*
 * Adaptadores para fuentes públicas con formatos distintos:
 * - M3U/M3U8 de listas de canales
 * - JSON de TDTChannels
 * - JSON de catálogo y streams de iptv-org
 *
 * La app solo consume enlaces HTTP(S) directos que AVPlay pueda abrir. No
 * resuelve DRM, no evita geobloqueos y no reproduce enlaces embebidos de YouTube.
 */
window.ApiClient = class ApiClient {
    async loadSources(sources) {
        const outcomes = await Promise.all((sources || []).map(async source => {
            try {
                return { source, channels: await this.loadSource(source), error: '' };
            } catch (error) {
                return { source, channels: [], error: error.message || String(error) };
            }
        }));

        const channels = [];
        const byId = Object.create(null);
        const byName = Object.create(null);
        const byUrl = Object.create(null);
        let duplicateCount = 0;
        outcomes.forEach(outcome => {
            outcome.channels.forEach(channel => {
                const urlKey = this.canonicalUrl(channel.streamUrl);
                if (!urlKey) return;

                const idKey = this.canonicalId(channel.canonicalId);
                const name = this.canonicalName(channel.dedupeName || channel.name);
                // Keep one visible entry for a channel even when country lists expose it
                // under different URLs or region labels. Stable IDs take precedence.
                const nameKey = name ? `name:${name}` : '';
                const target = (idKey && byId[idKey]) || (nameKey && byName[nameKey]) || byUrl[urlKey];
                let merged = target;
                if (merged) {
                    duplicateCount += 1;
                } else {
                    merged = Object.assign({}, channel, {
                        streamCandidates: [],
                        sourceNames: [],
                        countryCodes: [],
                        categories: [],
                        labels: []
                    });
                    channels.push(merged);
                }

                if (!merged.streamCandidates.some(candidate =>
                    this.canonicalUrl(candidate.streamUrl) === urlKey && (candidate.userAgent || '') === (channel.userAgent || ''))) {
                    merged.streamCandidates.push({
                        streamUrl: channel.streamUrl,
                        userAgent: channel.userAgent || '',
                        source: channel.source || 'Fuente pública'
                    });
                }
                merged.streamUrl = merged.streamCandidates[0].streamUrl;
                if (!merged.logoUrl && channel.logoUrl) merged.logoUrl = channel.logoUrl;
                if (!merged.description && channel.description) merged.description = channel.description;
                [channel.source || 'Fuente pública'].forEach(value => {
                    if (merged.sourceNames.indexOf(value) < 0) merged.sourceNames.push(value);
                });
                merged.source = merged.sourceNames.join(', ');
                [channel.countryCode].filter(Boolean).forEach(value => {
                    if (merged.countryCodes.indexOf(value) < 0) merged.countryCodes.push(value);
                });
                if (!merged.countryCode && channel.countryCode) merged.countryCode = channel.countryCode;
                (channel.categories || []).forEach(value => {
                    if (merged.categories.indexOf(value) < 0) merged.categories.push(value);
                });
                (channel.labels || []).forEach(value => {
                    if (merged.labels.indexOf(value) < 0) merged.labels.push(value);
                });

                if (idKey) byId[idKey] = merged;
                if (nameKey) byName[nameKey] = merged;
                byUrl[urlKey] = merged;
            });
        });

        return {
            channels,
            duplicateCount,
            failures: outcomes.filter(outcome => outcome.error),
            loadedSources: outcomes.filter(outcome => !outcome.error && outcome.channels.length)
        };
    }

    loadSource(source) {
        if (!source || !source.type) return Promise.reject(new Error('Fuente sin tipo configurado.'));
        if (source.type === 'm3u') {
            return this.fetchText(source.url).then(text => this.parseM3u(text, source));
        }
        if (source.type === 'tdt-json') {
            return this.fetchJson(source.url).then(data => this.parseTdtChannels(data, source));
        }
        if (source.type === 'iptv-org-json') {
            return this.loadIptvOrg(source);
        }
        return Promise.reject(new Error(`Tipo de fuente no reconocido: ${source.type}`));
    }

    async fetchText(url) {
        const response = await fetch(url, {
            method: 'GET', mode: 'cors', credentials: 'omit', cache: 'default',
            headers: { Accept: 'application/vnd.apple.mpegurl, audio/x-mpegurl, text/plain, */*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
    }

    async fetchJson(url) {
        const response = await fetch(url, {
            method: 'GET', mode: 'cors', credentials: 'omit', cache: 'default',
            headers: { Accept: 'application/json, */*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    async loadIptvOrg(source) {
        const requests = await Promise.all([
            this.fetchJson(source.channelsUrl),
            this.fetchJson(source.streamsUrl),
            this.fetchJson(source.blocklistUrl)
        ]);
        return this.parseIptvOrg(requests[0], requests[1], requests[2], source);
    }

    parseIptvOrg(channelRows, streamRows, blockRows, source) {
        const channelsById = Object.create(null);
        const blocked = Object.create(null);
        const spanishCountries = (source.spanishCountries || []).reduce((map, code) => {
            map[String(code).toUpperCase()] = true;
            return map;
        }, Object.create(null));

        (blockRows || []).forEach(row => {
            if (row && row.channel) blocked[row.channel] = true;
        });

        (channelRows || []).forEach(channel => {
            if (!channel || !channel.id || !channel.name || channel.is_nsfw || blocked[channel.id]) return;
            if (channel.closed && Date.parse(channel.closed) < Date.now()) return;
            if (!spanishCountries[String(channel.country || '').toUpperCase()]) return;
            channelsById[channel.id] = channel;
        });

        const output = [];
        (streamRows || []).forEach(stream => {
            if (!stream || !stream.channel || !stream.url || stream.referrer) return;
            const channel = channelsById[stream.channel];
            if (!channel) return;
            const streamUrl = this.resolveHttpUrl(stream.url);
            if (!streamUrl) return;

            const categoryIds = (channel.categories || []).map(value => this.categoryId(value));
            const labels = (stream.labels || []).map(value => String(value));
            const details = [source.label || 'iptv-org', channel.country || ''];
            if (stream.quality) details.push(stream.quality);
            if (labels.length) details.push(labels.join(', '));
            output.push({
                id: `${channel.id}:${stream.feed || stream.title || streamUrl}`,
                name: stream.title || channel.name,
                description: details.filter(Boolean).join(' · '),
                logoUrl: '',
                streamUrl,
                userAgent: stream.user_agent || '',
                categories: categoryIds.length ? categoryIds : ['general'],
                countryCode: String(channel.country || '').toUpperCase(),
                source: source.label || 'iptv-org',
                labels,
                canonicalId: channel.id,
                dedupeName: channel.name,
                restricted: false
            });
        });
        return output;
    }

    parseTdtChannels(data, source) {
        const output = [];
        const countries = data && Array.isArray(data.countries) ? data.countries : [];
        countries.forEach(country => {
            (country.ambits || []).forEach(ambit => {
                (ambit.channels || []).forEach(channel => {
                    const flags = (channel.extra_info || []).map(value => String(value).toUpperCase());
                    // Links that need a custom Referer cannot be represented by AVPlay's
                    // supported streaming properties, so leave them out of the playable list.
                    if (channel.referer || flags.some(flag => /^REF/.test(flag))) return;

                    (channel.options || []).forEach(option => {
                        if (!option || !this.isSupportedFormat(option.format)) return;
                        const streamUrl = this.resolveHttpUrl(option.url);
                        if (!streamUrl) return;

                        const category = this.categoryId(ambit.name || 'general');
                        const notes = [country.name, ambit.name, source.label || 'TDTChannels'];
                        if (flags.indexOf('GEO') >= 0 || option.geo2) notes.push('posible restricción geográfica');
                        if (flags.indexOf('EVT') >= 0) notes.push('emisión intermitente');
                        output.push({
                            id: `${country.name}:${channel.epg_id || channel.name}:${streamUrl}`,
                            name: channel.name || 'Canal',
                            description: notes.filter(Boolean).join(' · '),
                            logoUrl: this.resolveHttpUrl(channel.logo || ''),
                            streamUrl,
                            userAgent: option.user_agent || '',
                            categories: [category],
                            countryCode: this.countryCode(country.name),
                            source: source.label || 'TDTChannels',
                            labels: flags,
                            canonicalId: channel.epg_id || '',
                            dedupeName: channel.name,
                            restricted: false
                        });
                    });
                });
            });
        });
        return output;
    }

    parseM3u(text, source) {
        const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
        const channels = [];
        let entry = null;

        lines.forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;
            if (/^#EXTINF:/i.test(line)) {
                const comma = this.findUnquotedComma(line);
                const metadata = comma < 0 ? line.slice(8) : line.slice(8, comma);
                const title = comma < 0 ? '' : line.slice(comma + 1).trim();
                const attrs = this.parseAttributes(metadata);
                const group = attrs['group-title'] || '';
                const cleanTitle = source.stripChannelNumberPrefix
                    ? title.replace(/^\s*\d{2,4}\s+/, '').trim()
                    : title;
                entry = {
                    name: cleanTitle || attrs['tvg-name'] || attrs['tvg-id'] || 'Canal',
                    id: attrs['tvg-id'] || attrs['tvg-name'] || '',
                    canonicalId: attrs['tvg-id'] || '',
                    dedupeName: attrs['tvg-name'] || cleanTitle,
                    logoUrl: this.resolveHttpUrl(attrs['tvg-logo'] || '', source.url),
                    group
                };
                return;
            }

            if (line.charAt(0) === '#') return;
            if (!entry) entry = { name: 'Canal', id: '', logoUrl: '', group: '' };
            const streamUrl = this.resolveHttpUrl(line, source.url);
            let host = '';
            try { host = new URL(streamUrl).hostname.toLowerCase(); } catch (_) { /* URL validation below skips it */ }
            const excludedHost = (source.excludeHosts || []).some(value =>
                host === String(value).toLowerCase() || host.endsWith(`.${String(value).toLowerCase()}`));
            const excludedName = (source.excludeNameContains || []).some(value =>
                String(entry.name || '').toLowerCase().indexOf(String(value).toLowerCase()) >= 0);
            const unresolvedTemplate = source.skipTemplateUrls && /\[[A-Z0-9_]+\]/i.test(line);
            const unsupportedStream = source.requireHls && !/\.m3u8?(?:[?#]|$)/i.test(streamUrl);
            if (streamUrl && !excludedHost && !excludedName && !unresolvedTemplate && !unsupportedStream) {
                channels.push({
                    id: entry.id || streamUrl,
                    name: entry.name,
                    description: [entry.group, source.label || 'Lista pública'].filter(Boolean).join(' · '),
                    logoUrl: entry.logoUrl,
                    streamUrl,
                    userAgent: '',
                    categories: [this.categoryId(entry.group || entry.name || 'general')],
                    countryCode: source.countryCode || '',
                    source: source.label || 'M3U',
                    labels: [],
                    canonicalId: entry.canonicalId,
                    dedupeName: entry.dedupeName || entry.name,
                    restricted: false
                });
            }
            entry = null;
        });
        return channels;
    }

    isSupportedFormat(format) {
        const value = String(format || '').toLowerCase().replace(/\s/g, '');
        return value === 'm3u8' || value === 'hls' || value === 'mpd' || value === 'dash' ||
            value === 'ism' || value === 'ism/manifest' || value === 'smoothstreaming' || value === 'mp4';
    }

    categoryId(value) {
        const text = String(value || '').toLowerCase().normalize ? String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(value || '').toLowerCase();
        if (/movie|film|cine|pelicula/.test(text)) return 'movies';
        if (/series|serie/.test(text)) return 'series';
        if (/animation|animacion|infantil|children|kids|cartoon/.test(text)) return 'animation';
        if (/entertainment|entretenimiento|variedades|comedy|comedia/.test(text)) return 'entertainment';
        if (/documentary|documental/.test(text)) return 'documentary';
        if (/sport|deporte/.test(text)) return 'sports';
        if (/news|noticia|informativo/.test(text)) return 'news';
        return 'general';
    }

    countryCode(country) {
        const value = String(country || '').toLowerCase();
        const countries = {
            argentina: 'AR', bolivia: 'BO', brazil: 'BR', brasil: 'BR', chile: 'CL',
            colombia: 'CO', 'costa rica': 'CR', cuba: 'CU', 'dominican republic': 'DO',
            'república dominicana': 'DO', ecuador: 'EC', spain: 'ES', españa: 'ES',
            guatemala: 'GT', honduras: 'HN', mexico: 'MX', méxico: 'MX', nicaragua: 'NI',
            panama: 'PA', panamá: 'PA', paraguay: 'PY', peru: 'PE', perú: 'PE',
            'puerto rico': 'PR', 'el salvador': 'SV', uruguay: 'UY', venezuela: 'VE'
        };
        return countries[value] || '';
    }

    findUnquotedComma(value) {
        let quoted = false;
        for (let i = 0; i < value.length; i += 1) {
            if (value.charAt(i) === '"') quoted = !quoted;
            else if (value.charAt(i) === ',' && !quoted) return i;
        }
        return -1;
    }

    parseAttributes(value) {
        const attrs = {};
        const expression = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]*))/g;
        let match;
        while ((match = expression.exec(value)) !== null) {
            attrs[match[1].toLowerCase()] = match[2] || match[3] || match[4] || '';
        }
        return attrs;
    }

    resolveHttpUrl(value, baseUrl) {
        if (!value) return '';
        try {
            const url = new URL(value, baseUrl || undefined);
            if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return '';
            return url.toString();
        } catch (_) {
            return '';
        }
    }

    canonicalUrl(value) {
        try {
            const url = new URL(String(value || '').trim());
            url.hash = '';
            if (url.pathname.length > 1 && url.pathname.endsWith('/') && !url.search) {
                url.pathname = url.pathname.slice(0, -1);
            }
            return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname}${url.search}`;
        } catch (_) {
            return String(value || '').trim();
        }
    }

    canonicalId(value) {
        const id = String(value || '').trim().toLowerCase();
        return id ? `id:${id}` : '';
    }

    canonicalName(value) {
        let name = String(value || '').toLowerCase();
        if (name.normalize) name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return name
            .replace(/\b(uhd|fhd|hd|sd|4k|1080p|720p|480p|24\s*\/\s*7)\b/g, ' ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }
};
