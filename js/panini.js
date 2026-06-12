/* ============================================================
   PRODE MUNDIAL 2026 · js/panini.js
   - Pronósticos guardados en localStorage
   - Sistema de puntuación: 3 exacto / 1 ganador / 0 fallo
   - Tabla de posiciones desde API ESPN
   - Modo amigos: exportar/importar JSON, tabla local
   ============================================================ */

/* --- Endpoints ESPN --- */
const API_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=950&dates=20260601-20260720';
const API_STANDINGS  = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/standings';

/* --- Zona horaria del fixture (Madrid como referencia para agrupar días) --- */
const TZ_REF = localStorage.getItem('fixture_tz') || 'Europe/Madrid';

/* --- Estado global --- */
let allMatches = [];

/* ============================================================
   PERSISTENCIA (localStorage)
   ============================================================ */
const KEYS = {
  USER:        'panini_user',
  PREDICTIONS: 'panini_predictions',
  FRIENDS:     'panini_friends',
};

function getUser()        { try { return JSON.parse(localStorage.getItem(KEYS.USER))        || {}; } catch { return {}; } }
function getPredictions() { try { return JSON.parse(localStorage.getItem(KEYS.PREDICTIONS)) || {}; } catch { return {}; } }
function getFriends()     { try { return JSON.parse(localStorage.getItem(KEYS.FRIENDS))     || []; } catch { return []; } }

function saveUser(data)        { localStorage.setItem(KEYS.USER,        JSON.stringify(data)); }
function savePredictions(data) { localStorage.setItem(KEYS.PREDICTIONS, JSON.stringify(data)); }
function saveFriends(data)     { localStorage.setItem(KEYS.FRIENDS,     JSON.stringify(data)); }

/* ============================================================
   GUARDAR / BLOQUEAR PRONÓSTICO POR PARTIDO
   ============================================================ */

/* Devuelve true si los inputs del partido deben estar deshabilitados */
function isLocked(matchId, state) {
  if (state === 'post') return true;
  return !!localStorage.getItem('prode_guardado_' + matchId);
}

/* Bloquea inputs + botón y persiste en localStorage */
function lockMatch(matchId) {
  localStorage.setItem('prode_guardado_' + matchId, '1');
  document.querySelectorAll(`.pred-input[data-match="${matchId}"]`).forEach(inp => {
    inp.disabled = true;
  });
  const btn = document.querySelector(`.btn-save-pred[data-match="${matchId}"]`);
  if (btn) {
    btn.textContent = '✓ Guardado';
    btn.classList.add('saved');
    btn.disabled = true;
  }
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  setupUserInputs();
  setupFriendMode();
  Promise.all([loadMatches(), loadStandings()]);
}

/* ============================================================
   CONFIGURACIÓN DE USUARIO
   ============================================================ */
function setupUserInputs() {
  const user = getUser();
  const $name  = document.getElementById('inputName');
  const $prize = document.getElementById('inputPrize');

  if ($name)  $name.value  = user.name  || '';
  if ($prize) $prize.value = user.prize || '';

  /* Asignar código de grupo si no existe */
  if (!user.groupCode) {
    user.groupCode = genCode();
    saveUser(user);
  }
  renderGroupCode(user.groupCode);
  renderPrizeBanner(user.prize);

  let saveTimer;
  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const updated = getUser();
      updated.name  = $name?.value.trim()  || '';
      updated.prize = $prize?.value.trim() || '';
      saveUser(updated);
      renderPrizeBanner(updated.prize);
      /* Actualizar tabla de clasificación con nuevo nombre */
      renderRanking();
    }, 400);
  }

  $name?.addEventListener('input',  debounceSave);
  $prize?.addEventListener('input', debounceSave);
}

/* ============================================================
   MODO AMIGOS
   ============================================================ */
function setupFriendMode() {
  document.getElementById('btnGenCode')?.addEventListener('click', () => {
    const user = getUser();
    user.groupCode = genCode();
    saveUser(user);
    renderGroupCode(user.groupCode);
  });

  document.getElementById('btnExport')?.addEventListener('click', exportJSON);

  document.getElementById('importFile')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) importJSON(file);
    e.target.value = ''; /* resetear para permitir reimportar el mismo archivo */
  });
}

function genCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function renderGroupCode(code) {
  const $el = document.getElementById('groupCode');
  if ($el) $el.textContent = code || '——';
}

function renderPrizeBanner(prize) {
  const $banner = document.getElementById('prizeBanner');
  const $text   = document.getElementById('prizeText');
  if (!$banner || !$text) return;
  if (prize && prize.trim()) {
    $text.textContent = prize.trim();
    $banner.removeAttribute('hidden');
  } else {
    $banner.setAttribute('hidden', '');
  }
}

/* --- Exportar pronósticos como JSON --- */
function exportJSON() {
  const user    = getUser();
  const preds   = getPredictions();
  const { totalPoints, exactScores, correctWinners } = calcTotalScore(preds);

  const data = {
    version:        '2026.1',
    name:           user.name      || 'Anónimo',
    groupCode:      user.groupCode || '',
    exportedAt:     new Date().toISOString(),
    totalPoints,
    exactScores,
    correctWinners,
    predictions:    preds,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `prode-mundial-${(user.name || 'usuario').replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* --- Importar JSON de un amigo --- */
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.name || !data.predictions) throw new Error('Formato inválido');

      /* Recalcular puntuación con los resultados actuales */
      const { totalPoints, exactScores, correctWinners } = calcTotalScore(data.predictions);

      const friend = {
        name:           data.name,
        importedAt:     new Date().toISOString(),
        totalPoints,
        exactScores,
        correctWinners,
        predictions:    data.predictions,
      };

      const friends = getFriends();
      const idx = friends.findIndex(f => f.name === friend.name);
      if (idx >= 0) friends[idx] = friend;
      else friends.push(friend);

      saveFriends(friends);
      renderRanking();
      alert(`✅ Pronóstico de ${friend.name} importado: ${totalPoints} pts`);
    } catch {
      alert('❌ Archivo inválido. Importá un JSON generado por este Prode.');
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   SISTEMA DE PUNTUACIÓN
   ============================================================ */

/* Calcula puntos para una predicción vs resultado real */
function calcPoints(pred, match) {
  if (pred?.home === '' || pred?.home == null) return null; /* sin predicción */
  if (pred?.away === '' || pred?.away == null) return null;
  if (match.state !== 'post') return null; /* partido no finalizado */

  const actualHome = parseInt(match.home.score, 10);
  const actualAway = parseInt(match.away.score, 10);
  const predHome   = parseInt(pred.home, 10);
  const predAway   = parseInt(pred.away, 10);

  if (isNaN(actualHome) || isNaN(actualAway)) return null;

  /* Resultado exacto: 3 puntos */
  if (predHome === actualHome && predAway === actualAway) return 3;

  /* Ganador correcto: 1 punto */
  const predWinner   = predHome > predAway   ? 'h' : predHome < predAway   ? 'a' : 'd';
  const actualWinner = actualHome > actualAway ? 'h' : actualHome < actualAway ? 'a' : 'd';
  if (predWinner === actualWinner) return 1;

  return 0;
}

/* Calcula el puntaje total del usuario o de un amigo */
function calcTotalScore(predictions) {
  let totalPoints    = 0;
  let exactScores    = 0;
  let correctWinners = 0;

  allMatches.forEach(match => {
    const pred = predictions[match.id];
    if (!pred) return;
    const pts = calcPoints(pred, match);
    if (pts === 3) { totalPoints += 3; exactScores++; }
    else if (pts === 1) { totalPoints += 1; correctWinners++; }
  });

  return { totalPoints, exactScores, correctWinners };
}

/* Actualiza el marcador de puntos en el header */
function updateScoreDisplay() {
  const { totalPoints, exactScores, correctWinners } = calcTotalScore(getPredictions());
  const $pts    = document.getElementById('totalPts');
  const $detail = document.getElementById('scoreDetail');
  if ($pts)    $pts.textContent    = totalPoints;
  if ($detail) $detail.textContent = `${exactScores} exacto${exactScores !== 1 ? 's' : ''} · ${correctWinners} ganador${correctWinners !== 1 ? 'es' : ''}`;
}

/* ============================================================
   CARGA DE PARTIDOS — ESPN Scoreboard
   ============================================================ */
async function loadMatches() {
  try {
    const res = await fetch(API_SCOREBOARD);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    allMatches = (data.events || [])
      .filter(ev => new Date(ev.date) >= new Date('2026-06-01T00:00:00Z'))
      .map(parseEvent)
      .sort((a, b) => a.date - b.date);

    renderPredMatches();
    updateScoreDisplay();
    renderRanking(); /* recalcular con resultados frescos */
  } catch (err) {
    console.error('Error partidos panini:', err);
    const $el = document.getElementById('predMatches');
    if ($el) $el.innerHTML = `<p class="ranking-empty">No se pudieron cargar los partidos. Verificá tu conexión.</p>`;
  }
}

function parseEvent(ev) {
  const comp        = ev.competitions?.[0] ?? {};
  const competitors = comp.competitors || [];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
  const status = comp.status?.type ?? {};
  const note   = comp.notes?.[0]?.headline || '';

  return {
    id:     ev.id,
    date:   new Date(ev.date),
    state:  status.state || 'pre',
    group:  note,
    home: {
      name:   (home.team?.displayName || home.team?.name || 'Por definir'),
      logo:   home.team?.logo  || '',
      score:  home.score != null ? home.score : '',
      winner: !!home.winner,
    },
    away: {
      name:   (away.team?.displayName || away.team?.name || 'Por definir'),
      logo:   away.team?.logo  || '',
      score:  away.score != null ? away.score : '',
      winner: !!away.winner,
    },
  };
}

/* ============================================================
   RENDER — FIGURITAS DE PRONÓSTICO
   ============================================================ */
function renderPredMatches() {
  const $el = document.getElementById('predMatches');
  if (!$el || !allMatches.length) return;

  const preds = getPredictions();

  /* Agrupar partidos por día (usando TZ de referencia) */
  const byDay = {};
  allMatches.forEach(m => {
    const key = dayKeyTZ(m.date, TZ_REF);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(m);
  });

  $el.innerHTML = Object.entries(byDay)
    .map(([key, matches]) => {
      const sample = matches[0];
      const label  = dayLabelTZ(sample.date, TZ_REF);
      const cards  = matches.map(m => figuritaHTML(m, preds[m.id])).join('');
      return `
        <div class="pred-day">
          <h3 class="pred-day-title">${label}</h3>
          <div class="pred-grid">${cards}</div>
        </div>`;
    }).join('');

  /* Listeners de inputs de pronóstico */
  document.querySelectorAll('.pred-input').forEach(input => {
    input.addEventListener('input', onPredInput);
  });

  /* Listeners de botones de guardar */
  document.querySelectorAll('.btn-save-pred:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => lockMatch(btn.dataset.match));
  });
}

/* HTML de una figurita */
function figuritaHTML(m, pred) {
  const pts    = calcPoints(pred, m);
  const time   = localTimeTZ(m.date, TZ_REF);
  const locked = isLocked(m.id, m.state);

  /* Resultado real */
  let resultHTML = '<span class="fig-result">— : —</span>';
  if (m.state === 'post' && m.home.score !== '' && m.away.score !== '') {
    resultHTML = `<span class="fig-result">${m.home.score} : ${m.away.score}</span>`;
  } else if (m.state === 'in') {
    resultHTML = `<span class="fig-live-badge">● En vivo</span>`;
  }

  /* Badge de puntos */
  let ptsHTML = '<span class="fig-points fig-pts-nd">sin jugar</span>';
  if (pts === 3) ptsHTML = '<span class="fig-points fig-pts-3">+3 exacto</span>';
  if (pts === 1) ptsHTML = '<span class="fig-points fig-pts-1">+1 ganador</span>';
  if (pts === 0) ptsHTML = '<span class="fig-points fig-pts-0">0 pts</span>';
  if (pts === null && m.state !== 'pre' && pred?.home != null) ptsHTML = '<span class="fig-points fig-pts-nd">pendiente</span>';

  const homeLogoHTML = m.home.logo
    ? `<img src="${m.home.logo}" alt="${m.home.name}" class="fig-logo" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="fig-logo-placeholder">🏳</div>`;

  const awayLogoHTML = m.away.logo
    ? `<img src="${m.away.logo}" alt="${m.away.name}" class="fig-logo" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="fig-logo-placeholder">🏳</div>`;

  /* Botón guardar: bloqueado si ya se guardó o el partido finalizó */
  const saveBtn = locked
    ? `<button class="btn-save-pred saved" disabled aria-label="Pronóstico guardado">✓ Guardado</button>`
    : `<button class="btn-save-pred" data-match="${m.id}" aria-label="Guardar pronóstico de ${m.home.name} vs ${m.away.name}">Guardar pronóstico</button>`;

  return `
  <div class="figurita" data-id="${m.id}">
    <div class="fig-inner">
      <div class="fig-header">
        <span class="fig-badge">⚽ MUNDIAL 2026</span>
        <span class="fig-group-tag">${m.group || ''}</span>
      </div>
      <div class="fig-body">
        <div class="fig-team">
          ${homeLogoHTML}
          <span class="fig-name">${m.home.name}</span>
          <input type="number" class="pred-input"
            data-match="${m.id}" data-team="home"
            min="0" max="99"
            value="${pred?.home ?? ''}"
            placeholder="—"
            aria-label="Goles de ${m.home.name}"
            ${locked ? 'disabled' : ''}
          />
        </div>
        <div class="fig-vs">
          <span class="fig-vs-text">VS</span>
        </div>
        <div class="fig-team">
          ${awayLogoHTML}
          <span class="fig-name">${m.away.name}</span>
          <input type="number" class="pred-input"
            data-match="${m.id}" data-team="away"
            min="0" max="99"
            value="${pred?.away ?? ''}"
            placeholder="—"
            aria-label="Goles de ${m.away.name}"
            ${locked ? 'disabled' : ''}
          />
        </div>
      </div>
      <div class="fig-footer">
        <span class="fig-time">${time} h</span>
        <div class="fig-result-wrap">
          <span class="fig-result-label">Real:</span>
          ${resultHTML}
        </div>
        ${ptsHTML}
      </div>
      <div class="fig-save">${saveBtn}</div>
    </div>
  </div>`;
}

/* Listener de input de pronóstico — guardado inmediato en localStorage */
function onPredInput(e) {
  const input   = e.target;
  if (input.disabled) return; /* partido bloqueado, no procesar */
  const matchId = input.dataset.match;
  const team    = input.dataset.team; /* 'home' | 'away' */
  const val     = input.value.trim();

  const preds = getPredictions();
  if (!preds[matchId]) preds[matchId] = { home: '', away: '' };
  preds[matchId][team] = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);
  savePredictions(preds);

  /* Actualizar badge de puntos y marcador sin re-renderizar todo */
  updateFigBadge(matchId, preds[matchId]);
  updateScoreDisplay();
}

/* Actualiza solo el badge de puntos de una figurita */
function updateFigBadge(matchId, pred) {
  const match = allMatches.find(m => m.id === matchId);
  if (!match) return;

  const pts    = calcPoints(pred, match);
  const fig    = document.querySelector(`.figurita[data-id="${matchId}"] .fig-footer`);
  if (!fig) return;

  let ptsHTML = '<span class="fig-points fig-pts-nd">sin jugar</span>';
  if (pts === 3) ptsHTML = '<span class="fig-points fig-pts-3">+3 exacto</span>';
  if (pts === 1) ptsHTML = '<span class="fig-points fig-pts-1">+1 ganador</span>';
  if (pts === 0) ptsHTML = '<span class="fig-points fig-pts-0">0 pts</span>';

  /* Reemplazar el último hijo (badge de puntos) */
  const last = fig.querySelector('.fig-points, .fig-points-nd, [class^="fig-pts"]');
  if (last) last.outerHTML = ptsHTML;
  else fig.insertAdjacentHTML('beforeend', ptsHTML);
}

/* ============================================================
   TABLA DE CLASIFICACIÓN DEL GRUPO DE AMIGOS
   ============================================================ */
function renderRanking() {
  const $wrap = document.getElementById('rankingWrap');
  if (!$wrap) return;

  const user    = getUser();
  const preds   = getPredictions();
  const friends = getFriends();
  const { totalPoints: myPts, exactScores: myExact, correctWinners: myWins } = calcTotalScore(preds);

  /* Combinar usuario propio + amigos */
  const entries = [
    { name: user.name || 'Yo', totalPoints: myPts, exactScores: myExact, correctWinners: myWins, isMe: true },
    ...friends,
  ].sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores);

  if (entries.length <= 1 && friends.length === 0) {
    $wrap.innerHTML = '<p class="ranking-empty">Importá pronósticos de amigos para ver la tabla.</p>';
    return;
  }

  const rows = entries.map((e, i) => `
    <tr class="${e.isMe ? 'rank-me' : ''} ${i === 0 ? 'rank-1' : ''}">
      <td>${i + 1}º</td>
      <td class="rank-name">${e.name || 'Anónimo'}${e.isMe ? ' <em>(vos)</em>' : ''}</td>
      <td class="rank-pts">${e.totalPoints}</td>
      <td>${e.exactScores}</td>
      <td>${e.correctWinners}</td>
    </tr>`).join('');

  $wrap.innerHTML = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th>#</th><th>Nombre</th><th>Pts</th><th>Exactos</th><th>Ganadores</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ============================================================
   CARGA DE STANDINGS — ESPN
   ============================================================ */
async function loadStandings() {
  try {
    const res = await fetch(API_STANDINGS);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderStandings(data);
  } catch (err) {
    console.error('Error standings:', err);
    const $el = document.getElementById('groupsGrid');
    if ($el) $el.innerHTML = `<p class="ranking-empty">Tabla de posiciones no disponible aún.</p>`;
  }
}

function renderStandings(data) {
  const $el = document.getElementById('groupsGrid');
  if (!$el) return;

  /* Intentar obtener grupos desde distintas estructuras de la API */
  const groups = extractGroups(data);

  if (!groups.length) {
    $el.innerHTML = `<p class="ranking-empty">Los standings se actualizarán cuando avance la fase de grupos.</p>`;
    return;
  }

  $el.innerHTML = groups.map(g => groupCardHTML(g)).join('');
}

/* Extrae grupos de la respuesta de ESPN (estructura puede variar) */
function extractGroups(data) {
  /* Formato 1: data.children[] con standings.entries */
  if (data.children?.length) {
    return data.children.map(child => ({
      name:    child.name || child.abbreviation || 'Grupo',
      entries: (child.standings?.entries || []).map(parseStandingEntry),
    })).filter(g => g.entries.length);
  }

  /* Formato 2: data.standings.entries directos */
  if (data.standings?.entries?.length) {
    return [{ name: 'Fase de Grupos', entries: data.standings.entries.map(parseStandingEntry) }];
  }

  return [];
}

function parseStandingEntry(entry) {
  const s = (name) => {
    const stat = (entry.stats || []).find(st => st.name === name || st.abbreviation === name);
    return stat ? (stat.value ?? 0) : 0;
  };
  return {
    name:   entry.team?.displayName || entry.team?.name || 'Equipo',
    logo:   entry.team?.logo || '',
    pj:     s('gamesPlayed') || s('GP'),
    pg:     s('wins')        || s('W'),
    pe:     s('ties')        || s('T'),
    pp:     s('losses')      || s('L'),
    gf:     s('pointsFor')   || s('PF')  || s('GF'),
    gc:     s('pointsAgainst') || s('PA') || s('GC'),
    pts:    s('points')      || s('PTS'),
  };
}

function groupCardHTML(group) {
  const sorted = [...group.entries].sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc));
  const rows = sorted.map(e => `
    <tr>
      <td>
        <div class="team-cell">
          ${e.logo ? `<img src="${e.logo}" alt="${e.name}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span>${e.name}</span>
        </div>
      </td>
      <td>${e.pj}</td>
      <td>${e.pg}</td>
      <td>${e.pe}</td>
      <td>${e.pp}</td>
      <td>${e.gf}</td>
      <td>${e.gc}</td>
      <td class="pts-cell">${e.pts}</td>
    </tr>`).join('');

  return `
  <div class="group-card">
    <div class="group-card-header">${group.name}</div>
    <table class="group-table">
      <thead>
        <tr>
          <th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/* ============================================================
   UTILIDADES DE FECHA (mismo patrón que main.js)
   ============================================================ */
function getTimeParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long',
  });
  const parts = {};
  fmt.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return parts;
}

function dayKeyTZ(date, tz) {
  const p = getTimeParts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

function dayLabelTZ(date, tz) {
  const p = getTimeParts(date, tz);
  const months = { '06':'junio', '07':'julio' };
  const mon = months[p.month] || p.month;
  const cap = p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1);
  return `${cap}, ${parseInt(p.day, 10)} de ${mon}`;
}

function localTimeTZ(date, tz) {
  const p = getTimeParts(date, tz);
  return `${p.hour}:${p.minute}`;
}

/* ============================================================
   HAMBURGUESA NAV
   ============================================================ */
const hamburger = document.getElementById('hamburger');
const navMenu   = document.getElementById('navMenu');
if (hamburger && navMenu) {
  hamburger.addEventListener('click', () => navMenu.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
      navMenu.classList.remove('open');
    }
  });
}

/* ============================================================
   ARRANQUE
   ============================================================ */
init();
