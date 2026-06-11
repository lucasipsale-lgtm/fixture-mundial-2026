/* ============================================================
   FIXTURE MUNDIAL 2026 · js/main.js
   API pública de ESPN (sin API key) — no modificar conexión
   Características: timezone dinámico, GSAP, Vanilla Tilt,
   vista lista/grilla, modal formaciones, export PNG
   ============================================================ */

/* --- Endpoints ESPN --- */
const API_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=950&dates=20260601-20260720';
const API_SUMMARY    = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';

/* --- Constantes --- */
const REFRESH_MS  = 60000;
const PRIME_START = 15 * 60; // 15:00 en minutos
const PRIME_END   = 23 * 60; // 23:00 en minutos

/* Nombres legibles por timezone */
const TZ_NAMES = {
  'Europe/Madrid':                  'España',
  'America/Argentina/Buenos_Aires': 'Argentina',
  'America/Mexico_City':            'México',
  'America/Bogota':                 'Colombia',
  'America/Santiago':               'Chile',
  'America/Montevideo':             'Uruguay',
  'Europe/Paris':                   'Francia',
  'Europe/London':                  'Reino Unido',
  'America/New_York':               'EE.UU. Este',
  'America/Los_Angeles':            'EE.UU. Oeste',
};

/* --- Estado global --- */
let allMatches  = [];
let selectedDay = null;
let currentTZ   = localStorage.getItem('fixture_tz') || detectTZ();
let viewMode    = localStorage.getItem('fixture_view') || 'list';

/* --- Referencias DOM --- */
const $matches   = document.getElementById('matches');
const $dayNav    = document.getElementById('dayNav');
const $status    = document.getElementById('status');
const $primeOnly = document.getElementById('primeOnly');
const $btnImagen = document.getElementById('btnImagen');
const $tzSelect  = document.getElementById('tzSelect');
const $btnList   = document.getElementById('btnList');
const $btnGrid   = document.getElementById('btnGrid');
const $cursor    = document.getElementById('cursor');
const $modal     = document.getElementById('formationModal');
const $modalContent = document.getElementById('modalContent');
const $modalClose   = document.getElementById('modalClose');
const $tzLabel   = document.getElementById('tzLabel');
const $tzFooter  = document.getElementById('tzFooter');

/* ============================================================
   INIT
   ============================================================ */
function init() {
  setupCursor();
  setupTZ();
  setupViewToggle();
  setupHeroAnimations();
  setupModal();
  $primeOnly.addEventListener('change', render);
  $btnImagen.addEventListener('click', exportPNG);
  loadData();
  setInterval(loadData, REFRESH_MS);
}

/* ============================================================
   CURSOR PERSONALIZADO (punto dorado que sigue el mouse)
   Solo activo en dispositivos con puntero fino (no táctil)
   ============================================================ */
function setupCursor() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('mousemove', e => {
    $cursor.style.left = e.clientX + 'px';
    $cursor.style.top  = e.clientY + 'px';
  });
}

/* ============================================================
   ZONA HORARIA
   ============================================================ */
function detectTZ() {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TZ_NAMES[local] ? local : 'Europe/Madrid';
}

function setupTZ() {
  $tzSelect.value = currentTZ;
  if (!$tzSelect.value) $tzSelect.value = 'Europe/Madrid';
  currentTZ = $tzSelect.value;
  updateTZLabels();

  $tzSelect.addEventListener('change', () => {
    currentTZ = $tzSelect.value;
    localStorage.setItem('fixture_tz', currentTZ);
    updateTZLabels();
    if (allMatches.length) { buildDayNav(); render(); }
  });
}

function updateTZLabels() {
  const name = TZ_NAMES[currentTZ] || currentTZ;
  if ($tzLabel)  $tzLabel.textContent  = `Hora de ${name}`;
  if ($tzFooter) $tzFooter.textContent = `Horarios en ${currentTZ}`;
}

/* ============================================================
   TOGGLE LISTA / GRILLA
   ============================================================ */
function setupViewToggle() {
  applyViewMode();
  $btnList.addEventListener('click', () => setView('list'));
  $btnGrid.addEventListener('click', () => setView('grid'));
}

function setView(mode) {
  viewMode = mode;
  localStorage.setItem('fixture_view', mode);
  applyViewMode();
  render();
}

function applyViewMode() {
  const isList = viewMode === 'list';
  $btnList.classList.toggle('active', isList);
  $btnGrid.classList.toggle('active', !isList);
  $btnList.setAttribute('aria-pressed', isList ? 'true' : 'false');
  $btnGrid.setAttribute('aria-pressed', isList ? 'false' : 'true');
}

/* ============================================================
   ANIMACIONES GSAP — hero + chips de días
   ============================================================ */
function setupHeroAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('heroTitle').style.opacity = '1';
    document.getElementById('heroSub').style.opacity   = '1';
    return;
  }
  waitForGSAP(() => {
    gsap.timeline()
      .from('#heroTitle', { y: -80, opacity: 0, duration: 1.2, ease: 'power4.out' })
      .from('#heroSub',   { y:  40, opacity: 0, duration: 1.0, ease: 'power3.out' }, '-=0.55');
  });
}

/* Poll liviano hasta que GSAP cargue desde CDN */
function waitForGSAP(cb, tries = 0) {
  if (typeof gsap !== 'undefined') { cb(); return; }
  if (tries > 40) return;
  setTimeout(() => waitForGSAP(cb, tries + 1), 100);
}

function animateDayChips() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof gsap === 'undefined') return;
  gsap.from('.day-chip', {
    opacity: 0, y: -8, stagger: 0.035, duration: 0.35, ease: 'power2.out',
  });
}

/* ============================================================
   MODAL DE FORMACIONES
   ============================================================ */
function setupModal() {
  $modalClose.addEventListener('click', closeModal);
  $modal.addEventListener('click', e => { if (e.target === $modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$modal.hidden) closeModal();
  });
}

function openModal(matchId) {
  $modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  $modalContent.innerHTML = `<div class="loading"><div class="spinner"></div><p>Cargando formación…</p></div>`;
  fetchFormation(matchId);
}

function closeModal() {
  $modal.setAttribute('hidden', '');
  document.body.style.overflow = '';
}

async function fetchFormation(matchId) {
  try {
    const res = await fetch(API_SUMMARY + matchId);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const rosters = data.rosters || [];
    const homeR = rosters.find(r => r.homeAway === 'home');
    const awayR = rosters.find(r => r.homeAway === 'away');

    if (!homeR || !awayR) { showModalUnavailable(); return; }

    const homePlayers = (homeR.roster || []).filter(p => p.starter).slice(0, 11);
    const awayPlayers = (awayR.roster || []).filter(p => p.starter).slice(0, 11);

    if (!homePlayers.length && !awayPlayers.length) { showModalUnavailable(); return; }

    $modalContent.innerHTML = `
      <h3>Formaciones confirmadas</h3>
      <div class="modal-teams">
        ${rosterHTML(homeR.team?.displayName || 'Local',     homePlayers)}
        ${rosterHTML(awayR.team?.displayName || 'Visitante', awayPlayers)}
      </div>`;
  } catch (err) {
    console.error('Error al cargar formación:', err);
    showModalUnavailable();
  }
}

function rosterHTML(teamName, players) {
  const rows = players.length
    ? players.map(p => {
        const num  = p.athlete?.jersey      || '—';
        const name = p.athlete?.shortName   || p.athlete?.displayName || 'Jugador';
        return `<li><span class="jersey">${num}</span>${name}</li>`;
      }).join('')
    : '<li>Sin datos disponibles</li>';
  return `<div class="modal-team"><h4>${teamName}</h4><ul>${rows}</ul></div>`;
}

function showModalUnavailable() {
  $modalContent.innerHTML = `
    <div class="modal-unavailable">
      <p>⏳ Formación disponible 1 h antes del partido</p>
    </div>`;
}

/* ============================================================
   CARGA DE DATOS — API ESPN
   ============================================================ */
async function loadData() {
  try {
    const res = await fetch(API_SCOREBOARD);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const events = (data.events || []).filter(ev =>
      new Date(ev.date) >= new Date('2026-06-01T00:00:00Z')
    );

    allMatches = events.map(parseEvent).sort((a, b) => a.date - b.date);

    if (!allMatches.length) {
      showStatus('La API aún no publicó los partidos de 2026. Reintento en 60 s.');
      $matches.innerHTML = '<div class="empty">Sin partidos disponibles por ahora.</div>';
      return;
    }

    hideStatus();
    buildDayNav();
    render();
  } catch (err) {
    console.error(err);
    showStatus(
      '<strong>No se pudieron cargar los datos.</strong> ' +
      'Abrí <strong>index.html</strong> directamente en el navegador o desplegá el sitio. ' +
      'Reintento automático en 60 s.'
    );
  }
}

/* --- Parseo de evento ESPN --- */
function parseEvent(ev) {
  const comp        = ev.competitions?.[0] ?? {};
  const competitors = comp.competitors || [];
  const home        = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
  const away        = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
  const status      = comp.status?.type ?? {};
  const note        = comp.notes?.[0]?.headline || '';

  return {
    id:     ev.id,
    date:   new Date(ev.date),
    state:  status.state       || 'pre',
    detail: status.shortDetail || '',
    clock:  comp.status?.displayClock || '',
    group:  note,
    venue:  comp.venue
      ? [comp.venue.fullName, comp.venue.address?.city].filter(Boolean).join(' · ')
      : '',
    home: parseTeam(home),
    away: parseTeam(away),
  };
}

function parseTeam(c) {
  const t = c.team ?? {};
  return {
    name:   t.displayName || t.name || 'Por definir',
    logo:   t.logo  || '',
    color:  t.color || '',
    score:  c.score != null ? c.score : '',
    winner: !!c.winner,
  };
}

/* ============================================================
   UTILIDADES DE FECHA EN ZONA HORARIA SELECCIONADA
   ============================================================ */
function timeParts(date) {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: currentTZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'long',
  });
  const parts = {};
  fmt.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return parts;
}

function dayKey(date) {
  const p = timeParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function dayLabel(date) {
  const p = timeParts(date);
  const months = { '06':'junio', '07':'julio' };
  return {
    weekday:  p.weekday,
    dayMonth: `${parseInt(p.day, 10)} ${months[p.month] || p.month}`,
  };
}

function localTime(date) {
  const p = timeParts(date);
  return `${p.hour}:${p.minute}`;
}

function localMinutes(date) {
  const p = timeParts(date);
  return parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
}

function isPrime(date) {
  const m = localMinutes(date);
  return m >= PRIME_START && m <= PRIME_END;
}

/* ============================================================
   NAVEGACIÓN POR DÍAS
   ============================================================ */
function buildDayNav() {
  const days = [...new Set(allMatches.map(m => dayKey(m.date)))];

  if (!selectedDay || !days.includes(selectedDay)) {
    const todayKey = dayKey(new Date());
    selectedDay = days.includes(todayKey) ? todayKey : days[0];
  }

  $dayNav.innerHTML = '';
  days.forEach(key => {
    const sample = allMatches.find(m => dayKey(m.date) === key);
    const lbl    = dayLabel(sample.date);
    const btn    = document.createElement('button');
    btn.className = 'day-chip' + (key === selectedDay ? ' active' : '');
    btn.innerHTML = `${lbl.weekday.slice(0,3)} ${lbl.dayMonth.split(' ')[0]}<small>${lbl.dayMonth.split(' ')[1]}</small>`;
    btn.setAttribute('aria-label', `${lbl.weekday} ${lbl.dayMonth}`);
    btn.addEventListener('click', () => { selectedDay = key; buildDayNav(); render(); });
    $dayNav.appendChild(btn);
  });

  const active = $dayNav.querySelector('.day-chip.active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });

  animateDayChips();
}

/* ============================================================
   RENDER — tarjetas del día seleccionado
   ============================================================ */
function render() {
  let matches = allMatches.filter(m => dayKey(m.date) === selectedDay);
  if ($primeOnly.checked) matches = matches.filter(m => isPrime(m.date));

  const sample = allMatches.find(m => dayKey(m.date) === selectedDay);
  const lbl    = sample ? dayLabel(sample.date) : null;

  if (!matches.length) {
    $matches.innerHTML = `
      ${lbl ? `<h2 class="day-title">${lbl.weekday} ${lbl.dayMonth}</h2>` : ''}
      <div class="empty">No hay partidos${$primeOnly.checked ? ' en horario prime' : ''} este día.</div>`;
    return;
  }

  const isGrid = viewMode === 'grid';
  $matches.innerHTML = `
    <h2 class="day-title">
      ${lbl.weekday} ${lbl.dayMonth}
      <span class="count">${matches.length} partido${matches.length !== 1 ? 's' : ''}</span>
    </h2>
    <div class="match-grid${isGrid ? ' grid-mode' : ''}">
      ${matches.map(m => cardHTML(m)).join('')}
    </div>`;

  /* Vanilla Tilt — solo en dispositivos con puntero fino y sin reduced motion */
  if (
    typeof VanillaTilt !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !window.matchMedia('(pointer: coarse)').matches
  ) {
    VanillaTilt.init(document.querySelectorAll('.match'), {
      max: 8, perspective: 1000, scale: 1.03, speed: 400, glare: false,
    });
  }

  /* Listeners del botón de formación */
  document.querySelectorAll('.btn-formation').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.matchId));
  });
}

/* --- HTML de una tarjeta de partido --- */
function cardHTML(m) {
  const prime = isPrime(m.date);
  const time  = localTime(m.date);

  /* Badge de estado */
  let badge = `<span class="badge badge-pre">${time} h</span>`;
  if (m.state === 'in')   badge = `<span class="badge badge-live">● En vivo ${m.clock || ''}</span>`;
  if (m.state === 'post') badge = `<span class="badge badge-final">✓ Final</span>`;

  const showScore = m.state !== 'pre';

  /* Botón YouTube solo cuando el partido finalizó */
  const ytQ  = encodeURIComponent(`${m.home.name} vs ${m.away.name} highlights 2026 FIFA World Cup`);
  const ytBtn = m.state === 'post'
    ? `<a class="btn-yt" href="https://www.youtube.com/results?search_query=${ytQ}" target="_blank" rel="noopener"
         aria-label="Resumen de ${m.home.name} vs ${m.away.name} en YouTube">
        <svg width="13" height="9" viewBox="0 0 13 9" fill="none" aria-hidden="true">
          <path d="M12.73 1.4A1.63 1.63 0 0 0 11.59.27C10.57 0 6.5 0 6.5 0S2.43 0 1.41.27A1.63 1.63 0 0 0 .27 1.4C0 2.43 0 4.5 0 4.5s0 2.07.27 3.1a1.63 1.63 0 0 0 1.14 1.13C2.43 9 6.5 9 6.5 9s4.07 0 5.09-.27a1.63 1.63 0 0 0 1.14-1.14C13 6.57 13 4.5 13 4.5s0-2.07-.27-3.1Z" fill="#c4302b"/>
          <path d="M5.2 6.43 8.58 4.5 5.2 2.57v3.86Z" fill="#fff"/>
        </svg>
        Resumen
      </a>`
    : '';

  /* Fondos de color de cada equipo (mitades de la card) */
  const hColor = m.home.color ? `rgba(${hexToRgb(m.home.color)},0.15)` : 'transparent';
  const aColor = m.away.color ? `rgba(${hexToRgb(m.away.color)},0.15)` : 'transparent';

  return `
  <article class="match${prime ? ' prime' : ''}" data-id="${m.id}">
    <div class="match-team-bg" aria-hidden="true">
      <div class="match-bg-half" style="background:${hColor}">
        ${m.home.logo ? `<div class="match-bg-logo" style="background-image:url(${m.home.logo})"></div>` : ''}
      </div>
      <div class="match-bg-half" style="background:${aColor}">
        ${m.away.logo ? `<div class="match-bg-logo" style="background-image:url(${m.away.logo})"></div>` : ''}
      </div>
    </div>

    <div class="match-inner">
      ${prime ? '<span class="prime-tag">★ Horario de oro</span>' : ''}
      <div class="match-meta">
        <span class="group">${m.group || 'Mundial 2026'}</span>
        <span class="kickoff">${time} h</span>
      </div>
      <div class="teams">
        ${teamRowHTML(m.home, showScore)}
        ${teamRowHTML(m.away, showScore)}
      </div>
      <div class="match-foot">
        <span class="venue">${m.venue}</span>
        <span class="foot-actions">
          ${badge}
          <button class="btn-formation" data-match-id="${m.id}"
            aria-label="Ver formación de ${m.home.name} vs ${m.away.name}">
            ⚽ Formación
          </button>
          ${ytBtn}
        </span>
      </div>
    </div>
  </article>`;
}

function teamRowHTML(team, showScore) {
  const img = team.logo
    ? `<img src="${team.logo}" alt="${team.name}" loading="lazy" onerror="this.style.display='none'">`
    : '';
  return `
    <div class="team-row${team.winner ? ' winner' : ''}">
      ${img}
      <span class="team-name">${team.name}</span>
      ${showScore ? `<span class="score">${team.score}</span>` : ''}
    </div>`;
}

/* --- Convierte hex a "r, g, b" para rgba() --- */
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  if (isNaN(n)) return '255,255,255';
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/* ============================================================
   BARRA DE ESTADO
   ============================================================ */
function showStatus(html) { $status.innerHTML = html; $status.hidden = false; }
function hideStatus()     { $status.hidden = true; }

/* ============================================================
   EXPORTAR IMAGEN PNG
   ============================================================ */
async function exportPNG() {
  if (typeof html2canvas === 'undefined') {
    alert('La librería de captura no cargó. Necesitás conexión a internet.');
    return;
  }
  $btnImagen.disabled = true;
  $btnImagen.querySelector('.btn-label').textContent = 'Generando…';
  try {
    const canvas = await html2canvas(document.getElementById('capture'), {
      backgroundColor: '#080C14', scale: 2, useCORS: true,
    });
    const a = document.createElement('a');
    a.download = `fixture-mundial-${selectedDay}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  } catch (e) {
    console.error(e);
    alert('No se pudo generar la imagen.');
  } finally {
    $btnImagen.disabled = false;
    $btnImagen.querySelector('.btn-label').textContent = 'PNG';
  }
}

/* ============================================================
   ARRANQUE — llamado directo ya que el script está al final del body
   ============================================================ */
init();
