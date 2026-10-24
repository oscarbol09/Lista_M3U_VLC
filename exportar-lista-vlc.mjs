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
  movies: 'Películas',
  series: 'Series',
  animation: 'Anime / Animaciones',
  news: 'Noticias',
  sports: 'Deportes',
  music: 'Música',
  documentary: 'Documentales',
  entertainment: 'Entretenimiento',
  religious: 'Religión',
  general: 'General'
};

const countryNames = {
  AR: 'Argentina', BO: 'Bolivia', BR: 'Brasil', CL: 'Chile', CO: 'Colombia',
  CR: 'Costa Rica', CU: 'Cuba', DO: 'República Dominicana', EC: 'Ecuador',
  ES: 'España', GT: 'Guatemala', HN: 'Honduras', MX: 'México', NI: 'Nicaragua',
  PA: 'Panamá', PE: 'Perú', PR: 'Puerto Rico', PY: 'Paraguay', SV: 'El Salvador',
  UY: 'Uruguay', VE: 'Venezuela'
};

const categoryPriority = [
  'movies', 'series', 'animation', 'news', 'sports',
  'music', 'documentary', 'entertainment', 'religious', 'general'
];

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
  const declared = (channel.categories || []).filter(c => c !== 'general');
  let cleanName = (channel.name || '').replace(/\[not 24\/7\]/gi, '').replace(/\(not 24\/7\)/gi, '');
  const text = normalizeText([
    cleanName, channel.description || '', (channel.labels || []).join(' '), channel.canonicalId || ''
  ].join(' '));

  let category = 'general';

  // 1. ANIME & ANIMACIONES
  if (
    declared.includes('animation') ||
    /\b(anime|manga|otaku|crunchyroll|toonami|animax)\b/.test(text) ||
    /\b(cartoon|cartoons|tooncast|toons?|dibujos|animacion|animaciones)\b/.test(text) ||
    /\b(disney|nickelodeon|nick\s*jr|boing|clan|pakapaka|discovery\s*kids|baby\s*tv|nat\s*geo\s*kids|cbeebies|xabarin|chikitoonz|dreamworks|infantil|infantiles|ninos|pequeradio)\b/.test(text)
  ) {
    category = 'animation';
  }
  // 2. PELÍCULAS
  else if (
    declared.includes('movies') ||
    /\b(pelicula|peliculas|movies?|films?|cinema|cine|cinemax|cinecanal|paramount|hbo|cinelatino|multipremier|golden|de\s*pelicula|somos\s*cine|star\s*channel|film\s*&?\s*arts|amc|space|hollywood|eurochannel|studio\s*universal)\b/.test(text)
  ) {
    category = 'movies';
  }
  // 3. SERIES
  else if (
    declared.includes('series') ||
    /\b(series?|telenovela|telenovelas|novelas?|tnt\s*series|tnt\s*novelas|rcn\s*novelas|caracol\s*novelas|pasiones|drama)\b/.test(text)
  ) {
    category = 'series';
  }
  // 4. DEPORTES
  else if (
    declared.includes('sports') ||
    /\b(deportes?|sports?|futbol|football|soccer|basket|baloncesto|tenis|tennis|golf|motor|f1|formula\s*1|motogp|racing|nba|liga)\b/.test(text) ||
    /\b(espn|fox\s*sports?|tyc\s*sports?|win\s*sports?|win\+|dsports|teledeporte|esport3|real\s*madrid\s*tv|barca\s*tv|gol\s*play|gol\s*tv|claro\s*sports?|tigo\s*sports?|deportv|showsport)\b/.test(text)
  ) {
    category = 'sports';
  }
  // 5. RELIGIÓN & ESPIRITUALIDAD
  else if (
    declared.includes('religious') ||
    /\b(religion|religioso|religiosa|iglesia|cristo|cristianos?|cristiana|jesus|catolic[oa]s?|evangel(io|ic[oa])|bethel|enlace|ewtn|vida\s*nueva|maria\s*vision|cristovision|canal\s*luz|red\s*advenir|oracion|avivamiento|pastor|ministerio|fe\s+(viviente|catolica|cristiana|viva))\b/.test(text)
  ) {
    category = 'religious';
  }
  // 6. NOTICIAS
  else if (
    declared.includes('news') ||
    /\b(noticias?|noticiero|noticioso|news|informativos?|24\s*horas|24h|cnn|c5n|tn\b|telesur|euronews|rt\s*en\s*espanol|dw\s*espanol|ntn24|milenio|forotv|adn40|cablenoticias)\b/.test(text)
  ) {
    category = 'news';
  }
  // 7. MÚSICA
  else if (
    declared.includes('music') ||
    /\b(musica|music|musical|musicales|hits|videoclips?|radiovisual|radio\s*tv)\b/.test(text) ||
    /\b(mtv|htv|los40|los\s*40|kiss\s*tv|qmusic|tropicana|la\s*kalle|ritmoson|telehit|allegro|beats\s*radio)\b/.test(text)
  ) {
    category = 'music';
  }
  // 8. DOCUMENTALES & CULTURA
  else if (
    declared.includes('documentary') ||
    /\b(documental|documentales|documentary|historia|history|discovery|national\s*geographic|nat\s*geo|animal\s*planet|naturaleza|nature|wildlife|ciencia|science|cultura|cultural|encuentro|canal\s*\(?a\)?)\b/.test(text)
  ) {
    category = 'documentary';
  }
  // 9. ENTRETENIMIENTO & VARIEDADES
  else if (
    declared.includes('entertainment') ||
    /\b(entretenimiento|entertainment|variedades|comedia|comedy|humor|talk\s*show|magazine|reality|lifestyle|estilo\s*de\s*vida|gourmet|cocina|cooking|glamour|hola\s*tv|fashion)\b/.test(text)
  ) {
    category = 'entertainment';
  }

  const country = countryNames[channel.countryCode] || channel.countryCode || 'Hispano-latino';
  return { category, country, label: categoryNames[category] };
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

function formatDisplayName(baseName, countryCode, backupSuffix = '') {
  const code = String(countryCode || '').toUpperCase().trim();
  const cleanBase = baseName.replace(/^\[[A-Z]{2}\]\s*/, '').trim();
  const prefix = code && code !== 'HISPANO-LATINO' ? `[${code}] ` : '';
  const suffix = backupSuffix ? ` ${backupSuffix}` : '';
  return `${prefix}${cleanBase}${suffix}`.trim();
}

// 1. Main primary channels (grouped by clean category names)
for (const item of playable) {
  const channel = item.channel;
  const baseName = clean(channel.name || channel.canonicalId || 'Canal');
  const displayName = formatDisplayName(baseName, channel.countryCode);
  addEntry(item, item.candidates[0], displayName, item.label);
}

// 2. Fallback alternatives (cleanly grouped under "Respaldos manuales" at the end)
for (const item of playable) {
  const channel = item.channel;
  const baseName = clean(channel.name || channel.canonicalId || 'Canal');
  for (let index = 1; index < item.candidates.length; index += 1) {
    const candidate = item.candidates[index];
    const countryCode = candidate.countryCode || channel.countryCode || '';
    const displayName = formatDisplayName(baseName, countryCode, `[respaldo ${index + 1}]`);
    addEntry(item, candidate, displayName, 'Respaldos manuales');
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
