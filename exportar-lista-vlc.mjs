import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
globalThis.window = {};

for (const file of ['TizenApp/config.js', 'TizenApp/api.js']) {
  vm.runInThisContext(await readFile(path.join(directory, file), 'utf8'), { filename: file });
}

const config = window.APP_CONFIG;
const api = new window.ApiClient();
const spanishCountries = new Set(config.sources.find(source => source.id === 'iptv-org-json').spanishCountries);
// Include Brazil as Latin America; country alone never overrides a geo-block flag.
const allowedCountries = new Set([...spanishCountries, 'BR']);
const categoryNames = {
  movies: 'Películas', series: 'Series', animation: 'Animación e infantil',
  entertainment: 'Entretenimiento', documentary: 'Documentales', sports: 'Deportes',
  news: 'Noticias', general: 'General'
};
const countryNames = {
  AR: 'Argentina', BO: 'Bolivia', BR: 'Brasil', CL: 'Chile', CO: 'Colombia',
  CR: 'Costa Rica', CU: 'Cuba', DO: 'República Dominicana', EC: 'Ecuador',
  ES: 'España', GT: 'Guatemala', HN: 'Honduras', MX: 'México', NI: 'Nicaragua',
  PA: 'Panamá', PE: 'Perú', PR: 'Puerto Rico', PY: 'Paraguay', SV: 'El Salvador',
  UY: 'Uruguay', VE: 'Venezuela'
};
const categoryPriority = ['movies', 'series', 'animation', 'entertainment', 'documentary', 'sports', 'news', 'general'];
const explicitlyNonSpanishMexico = /^(bloomberg tv\+|new kpop|glory kickboxing|failarmy|red bull tv)$/i;
const sourceStats = [];
const channels = [];
const byId = Object.create(null);
const byName = Object.create(null);
const byUrl = Object.create(null);
let filteredGeo = 0;
let filteredRegion = 0;
let filteredOther = 0;

const normalizeText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isGeoBlocked = channel => {
  const text = `${channel.name || ''} ${channel.description || ''} ${(channel.labels || []).join(' ')}`;
  return /geo[- ]?blocked|geobloq|restricci[oó]n geogr[aá]fica/i.test(text) ||
    (channel.labels || []).some(label => /^geo$/i.test(String(label).trim()));
};
const isSpanishLatam = (channel, source) => {
  if (source.id === 'lg-mexico-m3u' && explicitlyNonSpanishMexico.test(String(channel.name || '').trim())) return false;
  const code = String(channel.countryCode || '').toUpperCase();
  if (allowedCountries.has(code)) return true;
  if (source.id === 'runtime-m3u') {
    const text = normalizeText(`${channel.name || ''} ${channel.description || ''}`);
    // Runtime does not publish a country/language field; retain only entries whose
    // title/group gives a clear Spanish or Latin American signal.
    return /\b(espanol|latino|latina|latinoamerica|colombia|mexico|argentina|chile|peru|ecuador|peliculas|pelicula|cine|series|infantil|ninos|animacion|telenovela)\b/.test(text);
  }
  return false;
};
const clean = value => String(value || '').replace(/[\r\n]/g, ' ').replace(/"/g, "'").trim();
const logicalGroup = channel => {
  const text = normalizeText([
    channel.name || '', channel.description || '',
    ...(channel.categories || []), ...(channel.labels || [])
  ].join(' '));
  const inferred = /\b(kids?|children|infantil|ninos|cartoon|animation|animacion|anime|dibujos)\b/.test(text) ? 'animation'
    : /\b(movie|movies|film|films|cine|pelicula|peliculas|cinema)\b/.test(text) ? 'movies'
      : /\b(series|serie|novela|novelas|telenovela|drama|soap)\b/.test(text) ? 'series'
        : /\b(sport|sports|deporte|deportes|futbol|football|soccer|basket|tennis|tenis)\b/.test(text) ? 'sports'
          : /\b(news|noticias|noticia|informativo|noticiero)\b/.test(text) ? 'news'
            : /\b(documentary|documental|documentales|nature|naturaleza|history|historia|wildlife)\b/.test(text) ? 'documentary'
              : /\b(entertainment|entretenimiento|comedy|comedia|variedades|music|musica|lifestyle)\b/.test(text) ? 'entertainment'
                : 'general';
  const declared = categoryPriority.find(value => value !== 'general' && (channel.categories || []).includes(value));
  const category = declared || (inferred !== 'general' ? inferred : 'general');
  const country = countryNames[channel.countryCode] || channel.countryCode || 'Hispano-latino';
  return { category, country, label: `${categoryNames[category]} | ${country}` };
};

const outcomes = await Promise.all(config.sources.map(async source => {
  try {
    return { source, channels: await api.loadSource(source), error: '' };
  } catch (error) {
    return { source, channels: [], error: error.message || String(error) };
  }
}));

for (const outcome of outcomes) {
  let accepted = 0;
  let geoSkipped = 0;
  let regionSkipped = 0;
  for (const channel of outcome.channels) {
    if (isGeoBlocked(channel)) {
      filteredGeo += 1;
      geoSkipped += 1;
      continue;
    }
    if (!isSpanishLatam(channel, outcome.source)) {
      filteredRegion += 1;
      regionSkipped += 1;
      continue;
    }
    if (!/^https?:\/\//i.test(channel.streamUrl || '') || /\[[A-Z0-9_]+\]/i.test(channel.streamUrl || '')) {
      filteredOther += 1;
      continue;
    }

    const idKey = api.canonicalId(channel.canonicalId);
    const nameKey = api.canonicalName(channel.dedupeName || channel.name);
    const urlKey = api.canonicalUrl(channel.streamUrl);
    const target = (idKey && byId[idKey]) || (nameKey && byName[`name:${nameKey}`]) || byUrl[urlKey];
    const record = target || Object.assign({}, channel, {
      streamCandidates: [], sourceNames: [], countryCodes: [], categories: [], labels: []
    });
    if (!target) channels.push(record);

    if (!record.streamCandidates.some(item =>
      api.canonicalUrl(item.streamUrl) === urlKey && (item.userAgent || '') === (channel.userAgent || ''))) {
      record.streamCandidates.push({
        streamUrl: channel.streamUrl,
        userAgent: channel.userAgent || '',
        source: channel.source || outcome.source.label,
        countryCode: channel.countryCode || ''
      });
    }
    if (target) {
      if (!record.logoUrl && channel.logoUrl) record.logoUrl = channel.logoUrl;
      if (!record.description && channel.description) record.description = channel.description;
      if (!record.countryCode && channel.countryCode) record.countryCode = channel.countryCode;
      if (idKey) byId[idKey] = record;
      if (nameKey) byName[`name:${nameKey}`] = record;
      byUrl[urlKey] = record;
    } else {
      record.sourceNames.push(channel.source || outcome.source.label);
      record.countryCodes.push(channel.countryCode || '');
    }
    (channel.categories || []).forEach(value => {
      if (!record.categories.includes(value)) record.categories.push(value);
    });
    (channel.labels || []).forEach(value => {
      if (!record.labels.includes(value)) record.labels.push(value);
    });
    if (idKey) byId[idKey] = record;
    if (nameKey) byName[`name:${nameKey}`] = record;
    byUrl[urlKey] = record;
    accepted += 1;
  }
  sourceStats.push({
    source: outcome.source.label,
    received: outcome.channels.length,
    accepted,
    geoSkipped,
    regionSkipped,
    error: outcome.error
  });
}

const playable = channels.map(channel => {
  // Keep only deduplicated, non-placeholder alternatives. A normal VLC M3U does
  // not perform automatic failover, so alternates are exported in a separate group.
  const candidates = channel.streamCandidates.filter(candidate =>
    /^https?:\/\//i.test(candidate.streamUrl || '') && !/\[[A-Z0-9_]+\]/i.test(candidate.streamUrl || ''));
  return { channel, candidates, ...logicalGroup(channel) };
}).filter(item => item.candidates.length);
const categoryOrder = new Map(categoryPriority.map((value, index) => [value, index]));
playable.sort((left, right) =>
  categoryOrder.get(left.category) - categoryOrder.get(right.category) ||
  left.country.localeCompare(right.country, 'es') ||
  String(left.channel.name || '').localeCompare(String(right.channel.name || ''), 'es'));

const lines = [
  '#EXTM3U',
  '# Playlist snapshot from the public catalogs configured in TizenApp.',
  `# Generated: ${new Date().toISOString()}`,
  '# Includes Spanish-speaking countries and Latin America; geo-blocked and unresolved template links are omitted.',
  '# Main entry per channel comes first. Alternative links are listed under "Respaldos manuales" for manual testing.',
  '# Attribution: https://github.com/iptv-org/iptv | https://github.com/iptv-org/api | https://github.com/LaQuay/TDTChannels',
  '# Also reads: https://github.com/Llorchico/LG and https://llorchico.github.io/Runtime/runtime.m3u'
];

function addEntry(item, candidate, displayName, groupTitle) {
  const channel = item.channel;
  const rawId = channel.canonicalId || channel.id;
  const id = clean(/^https?:\/\//i.test(rawId || '')
    ? normalizeText(channel.name || 'canal').replace(/[^a-z0-9]+/g, '.')
    : rawId);
  const logo = clean(channel.logoUrl);
  lines.push(`#EXTINF:-1 tvg-id="${id}" tvg-logo="${logo}" group-title="${clean(groupTitle)}",${clean(displayName)}`);
  if (candidate.userAgent) lines.push(`#EXTVLCOPT:http-user-agent=${clean(candidate.userAgent)}`);
  lines.push(candidate.streamUrl);
}

for (const item of playable) {
  const channel = item.channel;
  const baseName = clean(channel.name || channel.canonicalId || 'Canal');
  addEntry(item, item.candidates[0], baseName, item.label);
}

for (const item of playable) {
  const channel = item.channel;
  const baseName = clean(channel.name || channel.canonicalId || 'Canal');
  for (let index = 1; index < item.candidates.length; index += 1) {
    const candidate = item.candidates[index];
    const country = countryNames[candidate.countryCode] || candidate.countryCode || item.country;
    const backupLabel = `Respaldos manuales | ${categoryNames[item.category]} | ${country}`;
    addEntry(item, candidate, `${baseName} [respaldo ${index + 1}]`, backupLabel);
  }
}

if (!playable.length) {
  throw new Error(`No quedaron canales tras los filtros. Fuentes: ${JSON.stringify(sourceStats)}`);
}

const output = path.join(directory, 'canales-hispano-latino-vlc.m3u');
await writeFile(output, `${lines.join('\r\n')}\r\n`, 'utf8');
console.log(JSON.stringify({
  output,
  uniqueChannels: playable.length,
  primaryEntries: playable.length,
  manualFallbackEntries: playable.reduce((sum, item) => sum + item.candidates.length - 1, 0),
  entriesWritten: lines.filter(line => line.startsWith('#EXTINF:')).length,
  filteredGeo,
  filteredRegion,
  filteredOther,
  sources: sourceStats
}, null, 2));
