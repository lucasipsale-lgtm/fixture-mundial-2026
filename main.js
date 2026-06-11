/* ============================================================
   FIXTURE MUNDIAL 2026 · js/main.js
   - Datos en vivo: API pública de ESPN (sin API key)
   - Horarios convertidos a Europa/Madrid
   - Resalta partidos de 15:00 a 23:00 (hora España)
   - Botón de resumen en YouTube al finalizar cada partido
   - Refresco automático cada 60 segundos
   ============================================================ */

const API_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=950&dates=20260601-20260720';

const TZ = 'Europe/Madrid';
const REFRESH_MS = 60000; // 60 segundos
const PRIME_START = 15 * 60; // 15:00 en minutos
const PRIME_END = 23 * 60;   // 23:00 en minutos

let allMatches = [];
let selectedDay = null; // clave 'YYYY-MM-DD' en hora de Madrid

const $matches = document.getElementById('matches');
const $dayNav = document.getElementById('dayNav');
const $status = document.getElementById('status');
const $primeOnly = document.getElementById('primeOnly');
const $btnImagen = document.getElementById('btnImagen');

/* ---------- Utilidades de fecha en zona Madrid ---------- */

function madridParts(date) {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'long',
  });
  const parts = {};
  fmt.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return parts;
}

function dayKey(date) {
  const p = madridParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function dayLabel(date) {
  const p = madridParts(date);
  return { weekday: p.weekday, dayMonth: `${parseInt(p.day, 10)} jun-jul`.replace('jun-jul', monthName(p.month)) };
}

function monthName(mm) {
  return { '06': 'junio', '07': 'julio' }[mm] || mm;
}

function madridTime(date) {
  const p = madridParts(date);
  return `${p.hour}:${p.minute}`;
}

function madridMinutes(date) {
  const p = madridParts(date);
  return parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
}

function isPrime(date) {
  const m = madridMinutes(date);
  return m >= PRIME_START && m <= PRIME_END;
}

/* ---------- Carga de datos ---------- */

async function loadData() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const events = (data.events || []).filter(ev => {
      const d = new Date(ev.date);
      return d >= new Date('2026-06-01T00:00:00Z'); // descartar ediciones anteriores
    });

    allMatches = events.map(parseEvent).sort((a, b) => a.date - b.date);

    if (!allMatches.length) {
      showStatus('La API respondió pero todavía no publica los partidos de 2026. Reintento automático en 60 segundos.');
      $matches.innerHTML = '<div class="empty">Sin partidos disponibles por ahora.</div>';
      return;
    }

    hideStatus();
    buildDayNav();
    render();
  } catch (err) {
    console.error(err);
    showStatus(
      '<strong>No se pudieron cargar los datos en vivo.</strong> ' +
      'Si estás viendo esto dentro de una vista previa, abrí el archivo <strong>index.html</strong> ' +
      'directamente en tu navegador o desplegalo en Vercel: ahí la conexión con la API funciona sin problema. ' +
      'Reintento automático en 60 segundos.'
    );
  }
}

function parseEvent(ev) {
  const comp = ev.competitions && ev.competitions[0] ? ev.competitions[0] : {};
  const competitors = comp.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
  const status = (comp.status && comp.status.type) || {};
  const note = (comp.notes && comp.notes[0] && comp.notes[0].headline) || '';

  return {
    id: ev.id,
    date: new Date(ev.date),
    state: status.state || 'pre',            // pre | in | post
    detail: status.shortDetail || '',         // FT, 45', etc.
    clock: (comp.status && comp.status.displayClock) || '',
    group: note,
    venue: comp.venue
      ? [comp.venue.fullName, comp.venue.address && comp.venue.address.city].filter(Boolean).join(' · ')
      : '',
    home: parseTeam(home),
    away: parseTeam(away),
  };
}

function parseTeam(c) {
  const t = c.team || {};
  return {
    name: t.displayName || t.name || 'Por definir',
    logo: t.logo || '',
    score: c.score != null ? c.score : '',
    winner: !!c.winner,
  };
}

/* ---------- Navegación por días ---------- */

function buildDayNav() {
  const days = [...new Set(allMatches.map(m => dayKey(m.date)))];

  if (!selectedDay || !days.includes(selectedDay)) {
    const todayKey = dayKey(new Date());
    selectedDay = days.includes(todayKey) ? todayKey : days[0];
  }

  $dayNav.innerHTML = '';
  days.forEach(key => {
    const sample = allMatches.find(m => dayKey(m.date) === key);
    const lbl = dayLabel(sample.date);
    const btn = document.createElement('button');
    btn.className = 'day-chip' + (key === selectedDay ? ' active' : '');
    btn.innerHTML = `${lbl.weekday.slice(0, 3)} ${lbl.dayMonth.split(' ')[0]}<small>${lbl.dayMonth.split(' ')[1]}</small>`;
    btn.setAttribute('aria-label', `${lbl.weekday} ${lbl.dayMonth}`);
    btn.addEventListener('click', () => {
      selectedDay = key;
      buildDayNav();
      render();
    });
    $dayNav.appendChild(btn);
  });

  const active = $dayNav.querySelector('.day-chip.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
}

/* ---------- Render ---------- */

function render() {
  let matches = allMatches.filter(m => dayKey(m.date) === selectedDay);
  if ($primeOnly.checked) matches = matches.filter(m => isPrime(m.date));

  const sample = allMatches.find(m => dayKey(m.date) === selectedDay);
  const lbl = sample ? dayLabel(sample.date) : null;

  if (!matches.length) {
    $matches.innerHTML = `
      ${lbl ? `<h2 class="day-title">${lbl.weekday} ${lbl.dayMonth}</h2>` : ''}
      <div class="empty">No hay partidos${$primeOnly.checked ? ' en el horario de 15 a 23h' : ''} este día.</div>`;
    return;
  }

  const cards = matches.map(renderCard).join('');
  $matches.innerHTML = `
    <h2 class="day-title">${lbl.weekday} ${lbl.dayMonth}
      <span class="count">${matches.length} partido${matches.length !== 1 ? 's' : ''}</span>
    </h2>
    <div class="match-grid">${cards}</div>`;
}

function renderCard(m) {
  const prime = isPrime(m.date);
  const time = madridTime(m.date);

  let badge = `<span class="badge badge-pre">${time} h</span>`;
  if (m.state === 'in') badge = `<span class="badge badge-live">● En vivo ${m.clock || ''}</span>`;
  if (m.state === 'post') badge = `<span class="badge badge-final">Final ${m.detail || ''}</span>`;

  const showScore = m.state !== 'pre';

  const ytQuery = encodeURIComponent(`resumen ${m.home.name} vs ${m.away.name} Mundial 2026`);
  const ytBtn = m.state === 'post'
    ? `<a class="btn-yt" href="https://www.youtube.com/results?search_query=${ytQuery}" target="_blank" rel="noopener">▶ Resumen en YouTube</a>`
    : '';

  return `
  <article class="match${prime ? ' prime' : ''}" data-id="${m.id}">
    ${prime ? '<span class="prime-tag">★ Horario de oro · 15–23h</span>' : ''}
    <div class="match-meta">
      <span class="group">${m.group || 'Mundial 2026'}</span>
      <span class="kickoff">${time} h</span>
    </div>
    <div class="teams">
      ${teamRow(m.home, showScore)}
      ${teamRow(m.away, showScore)}
    </div>
    <div class="match-foot">
      <span class="venue">${m.venue}</span>
      <span class="foot-actions">${badge} ${ytBtn}</span>
    </div>
  </article>`;
}

function teamRow(team, showScore) {
  const img = team.logo
    ? `<img src="${team.logo}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  return `
    <div class="team-row${team.winner ? ' winner' : ''}">
      ${img}
      <span class="team-name">${team.name}</span>
      ${showScore ? `<span class="score">${team.score}</span>` : ''}
    </div>`;
}

/* ---------- Estado / avisos ---------- */

function showStatus(html) {
  $status.innerHTML = html;
  $status.hidden = false;
}
function hideStatus() {
  $status.hidden = true;
}

/* ---------- Exportar el día como imagen PNG ---------- */

$btnImagen.addEventListener('click', async () => {
  if (typeof html2canvas === 'undefined') {
    alert('La librería de captura no cargó. Probá con conexión a internet o desde el sitio desplegado.');
    return;
  }
  $btnImagen.disabled = true;
  $btnImagen.textContent = 'Generando…';
  try {
    const canvas = await html2canvas(document.getElementById('capture'), {
      backgroundColor: '#0b0f17',
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement('a');
    link.download = `fixture-mundial-${selectedDay}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.error(e);
    alert('No se pudo generar la imagen.');
  } finally {
    $btnImagen.disabled = false;
    $btnImagen.textContent = '⬇ Imagen del día';
  }
});

/* ---------- Init ---------- */

$primeOnly.addEventListener('change', render);

loadData();
setInterval(loadData, REFRESH_MS);
