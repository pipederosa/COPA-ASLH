// ============================================================
//  REGATAS NÁUTICAS — Lógica principal
// ============================================================

const PENALTIES = ['DNS','DNF','OCS','DSQ','RET'];
let currentUser = null;
let currentChampId = null;
let currentChampData = null;
let allPilots = [];
let allRaces = [];
let allResults = [];
let allAdjustments = [];
let activeMedalSeries = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) handleSession(session);

  db.auth.onAuthStateChange((_event, session) => {
    if (session) handleSession(session);
    else handleLogout();
  });

  loadChampionships();
  loadHomeExtras();
});

function handleSession(session) {
  currentUser = session.user;
  document.getElementById('btn-login').style.display = 'none';
  document.getElementById('btn-logout').style.display = '';
  document.getElementById('btn-new-champ').style.display = '';
  document.getElementById('champ-admin-btns').style.display = 'flex';
  document.getElementById('btn-annual-admin').style.display = '';
  document.getElementById('btn-manage-dates').style.display = '';
}

function handleLogout() {
  currentUser = null;
  document.getElementById('btn-login').style.display = '';
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('btn-new-champ').style.display = 'none';
  document.getElementById('champ-admin-btns').style.display = 'none';
  document.getElementById('btn-annual-admin').style.display = 'none';
  document.getElementById('btn-manage-dates').style.display = 'none';
}

// ===== AUTH =====
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!email || !pass) { showError(errEl, 'Completá email y contraseña.'); return; }
  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) { showError(errEl, 'Credenciales incorrectas.'); return; }
  closeModal('modal-login');
  showToast('Sesión iniciada correctamente', 'success');
}

async function logout() {
  await db.auth.signOut();
  showToast('Sesión cerrada');
}

// ===== VIEWS =====
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (name === 'home') { loadChampionships(); loadHomeExtras(); }
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'results') renderResultsTable();
  if (tab === 'detail') renderDetailView();
  if (tab === 'toa') renderToaTab();
  if (tab === 'protests') renderProtestsTab();
}

// ===== CHAMPIONSHIPS =====
async function loadChampionships() {
  const grid = document.getElementById('champ-grid');
  grid.innerHTML = '<div class="loading-state">Cargando campeonatos...</div>';
  const { data, error } = await db
    .from('championships')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { grid.innerHTML = '<div class="loading-state">Error al cargar.</div>'; return; }
  if (!data.length) {
    grid.innerHTML = '<div class="empty-state"><p>No hay campeonatos aún.</p></div>';
    return;
  }

  // Fetch top 3 for each championship
  const champCards = await Promise.all(data.map(async c => {
    const top3 = await getTop3ForChamp(c);
    return { champ: c, top3 };
  }));

  const medals = ['🥇','🥈','🥉'];
  grid.innerHTML = champCards.map(({ champ: c, top3 }) => `
    <div class="champ-card" onclick="openChampionship('${c.id}')">
      <div class="champ-card-name">${esc(c.name)}</div>
      ${c.event_date ? `<div style="font-size:12px;color:var(--accent-dark);font-weight:500;margin-bottom:2px">${new Date(c.event_date+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'})}</div>` : ''}
      ${c.description ? `<div class="champ-card-desc">${esc(c.description)}</div>` : ''}
      <div class="champ-card-meta">
        <span class="meta-chip">${c.total_races} regatas</span>
        ${c.total_discards > 0 ? `<span class="meta-chip">${c.total_discards} descarte(s)</span>` : ''}
      </div>
      ${top3.length ? `<div style="margin-top:10px;border-top:1px solid rgba(26,107,138,0.12);padding-top:8px">
        ${top3.map((p,i) => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px">
          <span>${medals[i]}</span>
          <span style="font-weight:500;color:#1A2B3C">${esc(p.name)}</span>
          <span style="color:#7A9AB8;margin-left:auto">${p.net}pts</span>
        </div>`).join('')}
      </div>` : ''}
      ${currentUser ? `<div style="margin-top:10px;display:flex;justify-content:flex-end" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-danger" onclick="deleteChampionship('${c.id}','${esc(c.name)}')">Eliminar campeonato</button>
      </div>` : ''}
    </div>
  `).join('');
}

async function getTop3ForChamp(champ) {
  try {
    const [pilotsRes, racesRes, resultsRes, adjRes] = await Promise.all([
      db.from('pilots').select('id,name').eq('championship_id', champ.id),
      db.from('races').select('*').eq('championship_id', champ.id),
      db.from('results').select('*, races!inner(championship_id)').eq('races.championship_id', champ.id),
      db.from('point_adjustments').select('*').eq('championship_id', champ.id)
    ]);
    const pilots = pilotsRes.data || [];
    const races = racesRes.data || [];
    const results = resultsRes.data || [];
    const adjs = adjRes.data || [];
    if (!pilots.length || !races.length) return [];

    const maxRace = Math.max(...races.map(r => r.race_number));
    const activeD = champ.total_discards >= 2 && maxRace >= champ.discard2_from ? 2
      : champ.total_discards >= 1 && maxRace >= champ.discard1_from ? 1 : 0;

    const medalRace = races.find(r => r.is_medal_race);
    const scores = pilots.map(pilot => {
      const pts = races.map(race => {
        const res = results.find(r => r.race_id === race.id && r.pilot_id === pilot.id);
        return res ? { race, pts: res.points } : null;
      }).filter(Boolean);
      const gross = pts.reduce((a,p) => a + (p.race.is_double ? p.pts*2 : p.pts), 0);
      const discardable = pts.filter(p => !p.race.no_discard);
      let discarded = [];
      if (activeD > 0 && discardable.length) {
        [...discardable].sort((a,b)=>(b.race.is_double?b.pts*2:b.pts)-(a.race.is_double?a.pts*2:a.pts))
          .slice(0, activeD).forEach(p => discarded.push(p.race.id));
      }
      const raceNet = pts.filter(p=>!discarded.includes(p.race.id)).reduce((a,p)=>a+(p.race.is_double?p.pts*2:p.pts),0);
      const adjTotal = adjs.filter(a=>a.pilot_id===pilot.id).reduce((a,adj)=>a+adj.points,0);
      let medalPos = 9999;
      if (medalRace) {
        const mr = results.find(r => r.race_id === medalRace.id && r.pilot_id === pilot.id);
        if (mr && !PENALTIES.includes(mr.status)) medalPos = mr.position;
      }
      return { name: pilot.name, net: raceNet + adjTotal, gross, medalPos };
    });
    return scores.sort((a,b)=>a.net-b.net || a.medalPos-b.medalPos || a.gross-b.gross).slice(0,3);
  } catch(e) { return []; }
}

async function openChampionship(id) {
  currentChampId = id;
  const { data, error } = await db.from('championships').select('*').eq('id', id).single();
  if (error) { showToast('Error al cargar campeonato', 'error'); return; }
  currentChampData = data;
  document.getElementById('champ-title').textContent = data.name;
  const dateStr = data.event_date ? new Date(data.event_date+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'}) : '';
  document.getElementById('champ-desc').textContent = dateStr && data.description ? dateStr + ' · ' + data.description : (dateStr || data.description || '');
  showView('champ');
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i===0));
  document.querySelectorAll('.tab-panel').forEach((p,i) => p.classList.toggle('active', i===0));
  await loadChampData();
  renderResultsTable();
}

async function loadChampData() {
  const [pilotsRes, racesRes, resultsRes, adjRes, msRes] = await Promise.all([
    db.from('pilots').select('*').eq('championship_id', currentChampId).order('sort_order'),
    db.from('races').select('*').eq('championship_id', currentChampId).order('race_number'),
    db.from('results').select('*, races!inner(championship_id)').eq('races.championship_id', currentChampId),
    db.from('point_adjustments').select('*').eq('championship_id', currentChampId),
    db.from('medal_series').select('*').eq('championship_id', currentChampId).eq('active', true).maybeSingle()
  ]);
  allPilots = pilotsRes.data || [];
  allRaces = racesRes.data || [];
  allResults = resultsRes.data || [];
  allAdjustments = adjRes.data || [];
  activeMedalSeries = msRes.data || null;
}

// ===== CHAMPIONSHIP FORM =====
function updateChampDiscardUI() {
  const d = parseInt(document.getElementById('cf-discards').value) || 0;
  document.getElementById('cf-d2-wrap').style.display = d >= 2 ? '' : 'none';
  updateChampDiscardInfo();
}

function updateChampDiscardInfo() {
  const d = parseInt(document.getElementById('cf-discards').value) || 0;
  const d1 = parseInt(document.getElementById('cf-d1').value) || 0;
  const d2 = parseInt(document.getElementById('cf-d2').value) || 0;
  const el = document.getElementById('cf-discard-info');
  if (d === 0) { el.style.display = 'none'; return; }
  el.style.display = '';
  let msg = d1 ? `Desde la regata ${d1}: se descarta el peor resultado acumulado.` : 'Indicá desde qué regata se aplica el 1er descarte.';
  if (d >= 2) msg += d2 ? ` Desde la regata ${d2}: 2 descartes activos.` : ' Indicá desde qué regata el 2do descarte.';
  el.textContent = msg;
}

let editingChampId = null;

function showModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOutside(e, id) { if (e.target.id === id) closeModal(id); }

async function saveChampionship() {
  const name = document.getElementById('cf-name').value.trim();
  const desc = document.getElementById('cf-desc').value.trim();
  const races = parseInt(document.getElementById('cf-races').value) || 0;
  const discards = parseInt(document.getElementById('cf-discards').value) || 0;
  const d1 = parseInt(document.getElementById('cf-d1').value) || 0;
  const d2 = parseInt(document.getElementById('cf-d2').value) || 0;
  if (!name || !races) { showToast('Completá nombre y cantidad de regatas', 'error'); return; }
  if (discards >= 1 && !d1) { showToast('Indicá desde qué regata aplica el 1er descarte', 'error'); return; }
  if (discards >= 2 && !d2) { showToast('Indicá desde qué regata aplica el 2do descarte', 'error'); return; }

  const eventDate = document.getElementById('cf-event-date').value || null;
  const payload = { name, description: desc, total_races: races, total_discards: discards, discard1_from: d1, discard2_from: d2, event_date: eventDate };
  let error;
  if (editingChampId) {
    ({ error } = await db.from('championships').update(payload).eq('id', editingChampId));
  } else {
    ({ error } = await db.from('championships').insert(payload));
  }
  if (error) { showToast('Error al guardar', 'error'); return; }
  closeModal('modal-champ');
  showToast('Campeonato guardado', 'success');
  loadChampionships();
  clearChampForm();
}

function clearChampForm() {
  ['cf-name','cf-desc','cf-races','cf-d1','cf-d2','cf-event-date'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cf-discards').value = '0';
  document.getElementById('cf-d2-wrap').style.display = 'none';
  document.getElementById('cf-discard-info').style.display = 'none';
  editingChampId = null;
}

// ===== PILOTS =====
async function showPilotsModal() {
  await loadChampData();
  renderPilotsList();
  showModal('modal-pilots');
}

function renderPilotsList() {
  const el = document.getElementById('pilots-list');
  if (!allPilots.length) { el.innerHTML = '<div class="loading-state" style="padding:.5rem 0">Sin participantes aún.</div>'; return; }
  el.innerHTML = allPilots.map((p, i) => `
    <div class="pilot-list-row">
      <div class="pilot-avatar">${initials(p.name)}</div>
      <span style="flex:1;font-size:14px">${esc(p.name)}</span>
      ${p.sail_number ? `<span class="badge badge-sea">${esc(p.sail_number)}</span>` : ''}
      ${currentUser ? `<button class="btn btn-sm btn-danger" onclick="deletePilot('${p.id}')">✕</button>` : ''}
    </div>
  `).join('');
}

async function addPilot() {
  const name = document.getElementById('pilot-name-input').value.trim();
  const sail = document.getElementById('pilot-sail-input').value.trim();
  if (!name) return;
  const sort = allPilots.length;
  const { error } = await db.from('pilots').insert({
    championship_id: currentChampId, name, sail_number: sail || null, sort_order: sort
  });
  if (error) { showToast('Error al agregar piloto', 'error'); return; }
  document.getElementById('pilot-name-input').value = '';
  document.getElementById('pilot-sail-input').value = '';
  await loadChampData();
  renderPilotsList();
  showToast(`${name} agregado`, 'success');
}

async function deletePilot(id) {
  if (!confirm('¿Eliminar este participante?')) return;
  const { error } = await db.from('pilots').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  await loadChampData();
  renderPilotsList();
}

// ===== RACE LOADING =====
async function showLoadRaceModal() {
  await loadChampData();
  const sel = document.getElementById('race-num-select');
  sel.innerHTML = '';
  for (let i = 1; i <= currentChampData.total_races; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `Regata ${i}`;
    sel.appendChild(opt);
  }
  onRaceSelectChange();
  showModal('modal-race');
}

function onMedalRaceToggle() {
  const isMedal = document.getElementById('race-medal').checked;
  if (isMedal) {
    document.getElementById('race-double').checked = true;
    document.getElementById('race-nodiscard').checked = true;
  }
}

function onRaceSelectChange() {
  const n = parseInt(document.getElementById('race-num-select').value);
  const existing = allRaces.find(r => r.race_number === n);
  document.getElementById('race-double').checked = existing ? existing.is_double : false;
  document.getElementById('race-nodiscard').checked = existing ? existing.no_discard : false;
  document.getElementById('race-medal').checked = existing ? (existing.is_medal_race || false) : false;
  

  const cd = currentChampData;
  const activeD = getActiveDiscards(n, cd);
  const alertEl = document.getElementById('race-alert');
  if (activeD > 0 && !(existing && existing.no_discard)) {
    alertEl.style.display = '';
    alertEl.textContent = `En esta regata están activos ${activeD} descarte(s). La(s) peor(es) puntuación(es) se restarán del total neto.`;
  } else { alertEl.style.display = 'none'; }

  renderRaceForm(n, existing);
}

function renderRaceForm(raceNum, existingRace) {
  const pCount = allPilots.length;
  const penaltyPts = pCount + 1;
  const body = document.getElementById('race-form-body');

  if (!pCount) {
    body.innerHTML = '<div class="loading-state" style="padding:.5rem 0">Agregá participantes primero.</div>';
    return;
  }

  // Build lookup: pilotId -> { position, status } from existing results
  const existingResults = existingRace ? allResults.filter(r => r.race_id === existingRace.id) : [];
  // For each finish slot (1..pCount), find who was there and their penalty
  // existingResults have position (finish slot) and status
  // Build rows: one per position slot
  const pilotOptions = allPilots.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  body.innerHTML = Array.from({length: pCount}, (_, i) => {
    const slot = i + 1;
    // Find saved entry for this finish slot
    const saved = existingResults.find(r => r.position === slot);
    const savedPilotId = saved ? saved.pilot_id : '';
    const savedPen = saved ? (PENALTIES.includes(saved.status) ? saved.status : '') : '';
    const medal = slot === 1 ? '🥇' : slot === 2 ? '🥈' : slot === 3 ? '🥉' : '';
    return `<div class="race-form-row" id="rrow-${i}" style="grid-template-columns:42px 1fr 110px">
      <div style="font-size:13px;font-weight:600;color:var(--text-mid);display:flex;align-items:center;gap:4px">
        ${medal}<span style="font-size:${slot<=3?'14':'13'}px">${slot}°</span>
      </div>
      <select id="rpilot-${i}" style="font-size:13px" onchange="onRaceFormChange()">
        <option value="">— elegir —</option>
        ${pilotOptions}
      </select>
      <select id="rpen-${i}" onchange="onRaceFormChange()" style="font-size:12px">
        <option value="">Normal</option>
        <option value="DNS">DNS (${penaltyPts}p)</option>
        <option value="DNF">DNF (${penaltyPts}p)</option>
        <option value="OCS">OCS (${penaltyPts}p)</option>
        <option value="DSQ">DSQ (${penaltyPts}p)</option>
        <option value="RET">RET (${penaltyPts}p)</option>
      </select>
    </div>`;
  }).join('');

  // Restore saved values
  Array.from({length: pCount}, (_, i) => {
    const slot = i + 1;
    const saved = existingResults.find(r => r.position === slot);
    if (saved) {
      const pilotSel = document.getElementById('rpilot-'+i);
      const penSel = document.getElementById('rpen-'+i);
      if (pilotSel) pilotSel.value = saved.pilot_id;
      if (penSel && PENALTIES.includes(saved.status)) penSel.value = saved.status;
    }
  });

  updateAvailablePilots();
  updateRowHighlights();
}

function onRaceFormChange() {
  updateAvailablePilots();
  updateRowHighlights();
}

// Remove already-selected pilots from all other dropdowns
function updateAvailablePilots() {
  const pCount = allPilots.length;

  // Get currently selected pilotId per slot
  const selected = Array.from({length: pCount}, (_, i) => {
    const sel = document.getElementById('rpilot-'+i);
    return sel ? sel.value : '';
  });

  for (let i = 0; i < pCount; i++) {
    const sel = document.getElementById('rpilot-'+i);
    if (!sel) continue;
    const currentVal = sel.value;

    // Rebuild options: blank + pilots not chosen in OTHER slots
    const takenElsewhere = new Set(selected.filter((v, j) => j !== i && v));

    // Clear and rebuild
    sel.innerHTML = '<option value="">— elegir —</option>';
    allPilots.forEach(p => {
      if (!takenElsewhere.has(p.id)) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = esc(p.name);
        sel.appendChild(opt);
      }
    });

    // Restore the selected value for this slot
    if (currentVal) sel.value = currentVal;
  }
}

function updateRowHighlights() {
  const pCount = allPilots.length;
  for (let i = 0; i < pCount; i++) {
    const pen = document.getElementById('rpen-'+i) ? document.getElementById('rpen-'+i).value : '';
    const row = document.getElementById('rrow-'+i);
    if (!row) continue;
    if (pen === 'OCS' || pen === 'DSQ') {
      row.style.background = 'rgba(184,48,48,0.06)';
    } else if (pen === 'DNS') {
      row.style.background = 'rgba(100,100,100,0.05)';
    } else if (pen === 'DNF' || pen === 'RET') {
      row.style.background = 'rgba(184,96,16,0.06)';
    } else {
      row.style.background = '';
    }
  }
}

async function saveRaceResults() {
  const n = parseInt(document.getElementById('race-num-select').value);
  const isDouble = document.getElementById('race-double').checked;
  const noDiscard = document.getElementById('race-nodiscard').checked;
  const isMedal = document.getElementById('race-medal').checked;
  const pCount = allPilots.length;
  const penaltyPts = pCount + 1;

  // Collect rows: each slot has a pilot and optional penalty
  const slots = [];
  const usedPilots = new Set();
  for (let i = 0; i < pCount; i++) {
    const pilotId = document.getElementById('rpilot-'+i).value;
    const pen = document.getElementById('rpen-'+i).value;
    if (!pilotId) { showToast(`Falta el participante en la posición ${i+1}°`, 'error'); return; }
    if (usedPilots.has(pilotId)) {
      const name = allPilots.find(p => p.id === pilotId)?.name || pilotId;
      showToast(`${name} aparece más de una vez`, 'error'); return;
    }
    usedPilots.add(pilotId);
    slots.push({ slot: i + 1, pilotId, pen });
  }

  // Compute effective points:
  // Penalized pilots get penaltyPts regardless of slot.
  // Clean finishers get points = their slot minus the number of penalized pilots whose slot is ABOVE theirs.
  // e.g. if slot 1 has OCS and slot 3 is clean -> effective = 3 - 1 = 2 points (they finish 2nd effectively).
  const penalizedSlots = slots.filter(s => s.pen).map(s => s.slot);
  const entries = slots.map(s => {
    if (s.pen) {
      return { pilotId: s.pilotId, status: s.pen, position: s.slot, points: penaltyPts };
    } else {
      const penAbove = penalizedSlots.filter(ps => ps < s.slot).length;
      const effectivePos = s.slot - penAbove;
      return { pilotId: s.pilotId, status: 'normal', position: s.slot, points: effectivePos };
    }
  });

  // Upsert race config
  let raceId;
  const existingRace = allRaces.find(r => r.race_number === n);
  if (existingRace) {
    const { error } = await db.from('races').update({ is_double: isDouble, no_discard: noDiscard, is_medal_race: isMedal }).eq('id', existingRace.id);
    if (error) { showToast('Error al guardar configuración de regata', 'error'); return; }
    raceId = existingRace.id;
  } else {
    const { data, error } = await db.from('races').insert({
      championship_id: currentChampId, race_number: n, is_double: isDouble, no_discard: noDiscard, is_medal_race: isMedal
    }).select().single();
    if (error) { showToast('Error al guardar regata', 'error'); return; }
    raceId = data.id;
  }

  // Upsert results
  const toUpsert = entries.map(e => ({
    race_id: raceId, pilot_id: e.pilotId, status: e.status, position: e.position, points: e.points
  }));
  const { error: resErr } = await db.from('results').upsert(toUpsert, { onConflict: 'race_id,pilot_id' });
  if (resErr) { showToast('Error al guardar resultados', 'error'); return; }

  closeModal('modal-race');
  showToast(`Regata ${n} guardada`, 'success');
  await loadChampData();
  renderResultsTable();
}

// ===== SCORING =====
function getActiveDiscards(raceNum, champ) {
  if (champ.total_discards >= 2 && raceNum >= champ.discard2_from) return 2;
  if (champ.total_discards >= 1 && raceNum >= champ.discard1_from) return 1;
  return 0;
}

function computeScores() {
  const cd = currentChampData;
  const loadedRaceNums = allRaces.map(r => r.race_number).sort((a,b) => a-b);
  const maxRace = loadedRaceNums.length ? Math.max(...loadedRaceNums) : 0;
  const activeDiscards = getActiveDiscards(maxRace, cd);

  const pilotData = allPilots.map(pilot => {
    const pts = [];
    for (const race of allRaces) {
      const result = allResults.find(r => r.race_id === race.id && r.pilot_id === pilot.id);
      if (result) pts.push({ race, result, pts: result.points });
    }
    const gross = pts.reduce((a, p) => a + (p.race.is_double ? p.pts * 2 : p.pts), 0);

    const discardable = pts.filter(p => !p.race.no_discard);
    let discarded = [];
    if (activeDiscards > 0 && discardable.length > 0) {
      const sorted = [...discardable].sort((a, b) => {
        return (b.race.is_double ? b.pts*2 : b.pts) - (a.race.is_double ? a.pts*2 : a.pts);
      });
      for (let d = 0; d < Math.min(activeDiscards, sorted.length); d++) {
        discarded.push(sorted[d].race.id);
      }
    }
    const raceNet = pts
      .filter(p => !discarded.includes(p.race.id))
      .reduce((a, p) => a + (p.race.is_double ? p.pts*2 : p.pts), 0);
    const adjTotal = allAdjustments
      .filter(a => a.pilot_id === pilot.id)
      .reduce((a, adj) => a + adj.points, 0);
    const net = raceNet + adjTotal;

    return { pilot, pts, gross, net, discarded, adjTotal };
  });

  // Medal Race para desempate: obtener la posición de cada piloto en la Medal Race
  const medalRace = allRaces.find(r => r.is_medal_race);
  pilotData.forEach(pd => {
    if (medalRace) {
      const medalResult = allResults.find(r => r.race_id === medalRace.id && r.pilot_id === pd.pilot.id);
      if (medalResult && !PENALTIES.includes(medalResult.status)) {
        pd.medalPos = medalResult.position;
      } else {
        // No corrió o penalizado = cuenta como último
        pd.medalPos = 9999;
      }
    } else {
      pd.medalPos = 9999;
    }
  });

  return { pilotData, loadedRaceNums, activeDiscards, hasMedalRace: !!medalRace };
}

// ===== RENDER RESULTS TABLE =====
let resultsViewMode = 'normal'; // 'normal' o 'medal'

function renderResultsTable() {
  const container = document.getElementById('results-container');
  if (!allPilots.length || !allRaces.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay datos aún para mostrar.</p></div>';
    return;
  }

  // Si hay medal series activa, mostrar toggle
  if (activeMedalSeries) {
    const toggle = `
      <div style="display:flex;gap:0;margin-bottom:1rem;border:1px solid var(--border-mid);border-radius:var(--radius);overflow:hidden;width:fit-content">
        <button onclick="setResultsView('normal')" style="padding:7px 16px;font-size:13px;border:none;cursor:pointer;background:${resultsViewMode==='normal'?'var(--navy)':'var(--white)'};color:${resultsViewMode==='normal'?'white':'var(--text)'}">Clasificación</button>
        <button onclick="setResultsView('medal')" style="padding:7px 16px;font-size:13px;border:none;cursor:pointer;background:${resultsViewMode==='medal'?'#C8880A':'var(--white)'};color:${resultsViewMode==='medal'?'white':'var(--text)'};font-weight:600">Medal Series</button>
      </div>`;

    if (resultsViewMode === 'medal') {
      container.innerHTML = toggle + renderMedalSeriesTableHTML();
      return;
    } else {
      // Mostrar clasificación congelada (solo hasta qualifier_until)
      container.innerHTML = toggle + renderNormalTableHTML(activeMedalSeries.qualifier_until);
      return;
    }
  }

  container.innerHTML = renderNormalTableHTML(null);
}

function setResultsView(mode) {
  resultsViewMode = mode;
  renderResultsTable();
}

function renderNormalTableHTML(maxRaceLimit) {
  const { pilotData, loadedRaceNums, activeDiscards, hasMedalRace } = computeScores();
  const sorted = [...pilotData].sort((a,b) => a.net - b.net || a.medalPos - b.medalPos || a.gross - b.gross);

  // Filtrar regatas si hay límite (medal series congela hasta cierta regata)
  const shownRaceNums = maxRaceLimit
    ? loadedRaceNums.filter(n => {
        const race = allRaces.find(r => r.race_number === n);
        return n <= maxRaceLimit && !race.is_medal_series;
      })
    : loadedRaceNums.filter(n => {
        const race = allRaces.find(r => r.race_number === n);
        return !race.is_medal_series;
      });

  const raceHeaders = shownRaceNums.map(n => {
    const race = allRaces.find(r => r.race_number === n);
    const cls = (race.is_double ? 'th-double ' : '') + (race.no_discard ? 'th-nodiscard' : '');
    const teamTag = race.is_team_race ? '<sup style="font-size:9px;color:#E8A020;margin-left:1px">EQ</sup>' : '';
    const medalTag = race.is_medal_race ? '<div style="font-size:12px;font-weight:700;color:#C8880A;letter-spacing:.5px;margin-top:1px">MR</div>' : '';
    return `<th class="${cls}">R${n}${teamTag}${medalTag}</th>`;
  }).join('');

  const rows = sorted.map((p, rank) => {
    const posLabel = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank+1}°`;
    const posClass = rank === 0 ? 'pos-1' : rank === 1 ? 'pos-2' : rank === 2 ? 'pos-3' : '';

    const cells = shownRaceNums.map(n => {
      const race = allRaces.find(r => r.race_number === n);
      const raceData = p.pts.find(pt => pt.race.race_number === n);
      if (!raceData) return `<td style="color:var(--text-light)">—</td>`;
      const isDiscard = p.discarded.includes(race.id);
      const st = raceData.result.status;
      let content;
      if (st === 'DNS') content = `<span class="cell-dns">DNS</span>`;
      else if (st === 'DNF') content = `<span class="cell-dnf">DNF</span>`;
      else if (st === 'OCS') content = `<span class="cell-ocs">OCS</span>`;
      else if (st === 'DSQ') content = `<span class="cell-dns">DSQ</span>`;
      else if (st === 'RET') content = `<span class="cell-dnf">RET</span>`;
      else if (race.is_team_race) {
        const team = raceData.result.team || '';
        const pts = raceData.result.points;
        const winPts = race.team_win_points != null ? race.team_win_points : 1;
        const won = pts === winPts;
        const teamColor = team === 'A' ? '#1A6B8A' : '#C8880A';
        const ptsLabel = pts >= 0 ? '+' + pts : '' + pts;
        if (team) {
          content = `<span style="font-size:11px;font-weight:600;color:${teamColor}">Eq.${team}</span> <span style="font-size:11px;color:${won?'#166534':'#991B1B'}">${ptsLabel}</span>`;
        } else {
          content = `<span style="font-size:11px;font-weight:600;color:#7A9AB8">Ind.</span> <span style="font-size:11px;color:${pts>=0?'#166534':'#991B1B'}">${ptsLabel}</span>`;
        }
      }
      else content = raceData.result.position + (race.is_double ? '<sup style="font-size:9px;color:var(--accent)">×2</sup>' : '');
      return `<td class="${isDiscard ? 'cell-discard' : ''}">${content}</td>`;
    }).join('');

    // Recalcular gross/net solo con las regatas mostradas
    let showGross = 0, showNet = 0;
    const shownPts = p.pts.filter(pt => shownRaceNums.includes(pt.race.race_number));
    showGross = shownPts.reduce((a,pt)=>a+(pt.race.is_double?pt.pts*2:pt.pts),0);
    showNet = shownPts.filter(pt=>!p.discarded.includes(pt.race.id)).reduce((a,pt)=>a+(pt.race.is_double?pt.pts*2:pt.pts),0) + (p.adjTotal||0);

    return `<tr>
      <td><span class="pos-medal ${posClass}">${posLabel}</span></td>
      <td>${esc(p.pilot.name)}${p.pilot.sail_number ? ` <span class="badge badge-sea" style="font-size:10px">${esc(p.pilot.sail_number)}</span>` : ''}</td>
      ${cells}
      <td class="pts-gross">${showGross}</td>
      <td style="text-align:center;font-size:12px;cursor:${(p.adjTotal||0)!==0?'help':'default'};color:${(p.adjTotal||0)>0?'#991B1B':(p.adjTotal||0)<0?'#166534':'var(--text-light)'}" title="${allAdjustments.filter(a=>a.pilot_id===p.pilot.id && !a.is_medal_series).map(a=>(a.points>0?'+':'')+a.points+' '+a.reason).join(' | ')||'Sin ajustes'}">
        ${p.adjTotal ? (p.adjTotal>0?'+':'')+p.adjTotal : '—'}</td>
      <td class="pts-net">${showNet}</td>
    </tr>`;
  }).join('');

  return `
    <div class="results-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Participante</th>
            ${raceHeaders}
            <th><span style="color:#9BB8D0">BRU</span></th>
            <th style="color:#B07A17;cursor:pointer" onclick="showAdjustmentsSummary()" title="Ver detalle de ajustes">ADJ ↗</th>
            <th>NET</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="table-legend">
      Referencias:
      <span style="color:var(--danger);text-decoration:line-through">X</span> descarte aplicado ·
      <span class="cell-dns">DNS</span> no largó ·
      <span class="cell-dnf">DNF</span> no finalizó ·
      <span class="cell-ocs">OCS</span> salida anticipada ·
      <span class="cell-dns">DSQ</span> descalificado ·
      <span class="cell-dnf">RET</span> retirado ·
      <strong style="color:var(--accent)">×2</strong> regata doble ·
      <strong>⊘</strong> no descartable
      ${activeDiscards > 0 ? `· <em>(${activeDiscards} descarte(s) activo(s))</em>` : ''}
      ${hasMedalRace ? `· <strong style="color:#C8880A">MR</strong> los empates se definen por la Medal Race` : ''}
    </div>
    <div style="margin-top:1rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="exportExcel()">⬇ Exportar Excel</button>
      ${allAdjustments.length ? '<span style="font-size:12px;color:var(--text-light)">* Incluye ajustes de puntos</span>' : ''}
    </div>`;
}

// ===== RENDER DETAIL VIEW =====
function renderDetailView() {
  const container = document.getElementById('detail-container');
  if (!allRaces.length) { container.innerHTML = '<div class="empty-state"><p>No hay regatas cargadas aún.</p></div>'; return; }

  const html = allRaces.sort((a,b) => a.race_number - b.race_number).map(race => {
    const raceResults = allResults
      .filter(r => r.race_id === race.id)
      .sort((a, b) => {
        if (PENALTIES.includes(a.status) && !PENALTIES.includes(b.status)) return 1;
        if (!PENALTIES.includes(a.status) && PENALTIES.includes(b.status)) return -1;
        return (a.position||99) - (b.position||99);
      });

    const badges = [
      race.is_double ? `<span class="badge badge-gold">x2</span>` : '',
      race.no_discard ? `<span class="badge badge-danger">No desc.</span>` : '',
      race.is_team_race ? `<span class="badge" style="background:#E8F4F8;color:#1A6B8A">Equipos</span>` : ''
    ].filter(Boolean).join('');

    const rows = raceResults.map((res, i) => {
      const pilot = allPilots.find(p => p.id === res.pilot_id);
      const st = res.status;
      let pts = PENALTIES.includes(st) ? `<span class="cell-${st.toLowerCase()}">${st}</span>` : res.position;
      if (race.is_double && !PENALTIES.includes(st)) pts = `${res.position}<sup style="font-size:9px;color:var(--accent)">×2</sup>`;
      return `<div class="detail-row">
        <div class="detail-pos">${PENALTIES.includes(st) ? '–' : i+1}</div>
        <div class="detail-name">${pilot ? esc(pilot.name) : '?'}</div>
        <div class="detail-pts">${pts}</div>
      </div>`;
    }).join('') || '<div class="detail-row" style="color:var(--text-light);font-size:13px">Sin resultados</div>';

    return `<div class="detail-card">
      <div class="detail-card-head">
        <span class="race-num">Regata ${race.race_number}</span>
        <div class="race-badges">${badges}</div>
      </div>
      <div class="detail-card-body">${rows}</div>
      ${currentUser ? `<div style="padding:8px 12px;border-top:1px solid var(--border);display:flex;gap:6px">
        <button class="btn btn-sm" onclick="editRace(${race.race_number})" style="font-size:11px">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRace('${race.id}',${race.race_number})" style="font-size:11px">Eliminar</button>
      </div>` : ''}
    </div>`;
  }).join('');

  container.innerHTML = `<div class="detail-grid">${html}</div>`;
}

async function editRace(raceNum) {
  const sel = document.getElementById('race-num-select');
  if (!sel.querySelector(`option[value="${raceNum}"]`)) await showLoadRaceModal();
  sel.value = raceNum;
  onRaceSelectChange();
  showModal('modal-race');
}

// ===== EXPORT CSV =====
function exportCSV() {
  const { pilotData, loadedRaceNums } = computeScores();
  const sorted = [...pilotData].sort((a,b) => a.net - b.net || a.medalPos - b.medalPos || a.gross - b.gross);

  const header = ['Pos', 'Participante', 'Vela',
    ...loadedRaceNums.map(n => {
      const r = allRaces.find(x => x.race_number === n);
      return `R${n}${r.is_double?'(x2)':''}${r.no_discard?'(ND)':''}`;
    }),
    'Brutos', 'Netos'];

  const rows = sorted.map((p, rank) => {
    const cells = loadedRaceNums.map(n => {
      const race = allRaces.find(r => r.race_number === n);
      const rData = p.pts.find(pt => pt.race.race_number === n);
      if (!rData) return '-';
      const isDiscard = p.discarded.includes(race.id);
      const st = rData.result.status;
      const val = PENALTIES.includes(st) ? st : rData.result.position;
      return isDiscard ? `[${val}]` : val;
    });
    return [rank + 1, p.pilot.name, p.pilot.sail_number || '', ...cells, p.gross, p.net];
  });

  const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentChampData.name || 'campeonato').replace(/\s+/g,'_') + '_resultados.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ===== HELPERS =====
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showError(el, msg) { el.textContent = msg; el.style.display = ''; }
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 3000);
}

// ===== TEAM RACE =====

// Assignment pattern: A,B,B,A,A,B,B,A,A,B,B,...
// Position 1->A, 2->B, 3->B, 4->A, 5->A, 6->B, 7->B, 8->A ...
function getTeamForRank(rank) {
  // rank is 0-based
  const pattern = ['A','B','B','A'];
  return pattern[rank % 4];
}

// Compute current ranking up to (but not including) a given race number
function getRankingBeforeRace(raceNum) {
  const racesBeforeThis = allRaces.filter(r => r.race_number < raceNum);
  if (!racesBeforeThis.length) return allPilots.map((p, i) => ({ pilot: p, net: 0, i }));

  const maxRaceBefore = Math.max(...racesBeforeThis.map(r => r.race_number));
  const activeDiscards = getActiveDiscards(maxRaceBefore, currentChampData);

  const pilotScores = allPilots.map(pilot => {
    const pts = [];
    for (const race of racesBeforeThis) {
      const result = allResults.find(r => r.race_id === race.id && r.pilot_id === pilot.id);
      if (result) pts.push({ race, result, pts: result.points });
    }
    const discardable = pts.filter(p => !p.race.no_discard);
    let discarded = [];
    if (activeDiscards > 0 && discardable.length > 0) {
      const sorted = [...discardable].sort((a,b) =>
        (b.race.is_double ? b.pts*2 : b.pts) - (a.race.is_double ? a.pts*2 : a.pts)
      );
      for (let d = 0; d < Math.min(activeDiscards, sorted.length); d++) discarded.push(sorted[d].race.id);
    }
    const raceNet = pts.filter(p => !discarded.includes(p.race.id))
      .reduce((a, p) => a + (p.race.is_double ? p.pts*2 : p.pts), 0);
    const adjTotal = allAdjustments
      .filter(a => a.pilot_id === pilot.id)
      .reduce((a, adj) => a + adj.points, 0);
    return { pilot, net: raceNet + adjTotal };
  });

  return pilotScores.sort((a, b) => a.net - b.net);
}

async function showTeamRaceModal() {
  await loadChampData();
  const sel = document.getElementById('team-race-num-select');
  sel.innerHTML = '';
  for (let i = 1; i <= currentChampData.total_races; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Regata ${i}`;
    // Mark already-loaded team races
    const existing = allRaces.find(r => r.race_number === i && r.is_team_race);
    if (existing) opt.textContent += ' (equip. cargada)';
    sel.appendChild(opt);
  }
  onTeamRaceSelectChange();
  showModal('modal-team');
}

function onTeamRaceSelectChange() {
  const n = parseInt(document.getElementById('team-race-num-select').value);
  const existing = allRaces.find(r => r.race_number === n);
  document.getElementById('team-race-double').checked = existing ? existing.is_double : false;
  document.getElementById('team-race-nodiscard').checked = existing ? existing.no_discard : true;
  document.getElementById('team-win-points').value = existing && existing.team_win_points != null ? existing.team_win_points : 1;
  document.getElementById('team-lose-points').value = existing && existing.team_lose_points != null ? existing.team_lose_points : 3;
  renderTeamRaceForm(n, existing);
}

function renderTeamRaceForm(raceNum, existingRace) {
  if (!allPilots.length) {
    document.getElementById('team-a-list').innerHTML = '<div style="font-size:12px;color:#888">Sin participantes</div>';
    document.getElementById('team-b-list').innerHTML = '';
    document.getElementById('team-race-form-body').innerHTML = '';
    return;
  }

  const ranking = getRankingBeforeRace(raceNum);
  let teams = ranking.map((p, i) => ({ pilot: p.pilot, team: getTeamForRank(i), rank: i + 1, net: p.net }));

  const existingResults = existingRace ? allResults.filter(r => r.race_id === existingRace.id) : [];

  // Detectar si hay cantidad impar
  const teamACount = teams.filter(t => t.team === 'A').length;
  const teamBCount = teams.filter(t => t.team === 'B').length;
  const isOdd = teamACount !== teamBCount;
  const biggerTeam = teamACount > teamBCount ? 'A' : 'B';

  const oddSection = document.getElementById('odd-pilot-section');
  const oddSelect = document.getElementById('odd-pilot-select');

  if (isOdd) {
    oddSection.style.display = '';
    // Poblar selector solo con los del equipo mayor
    const biggerTeamPilots = teams.filter(t => t.team === biggerTeam);
    const currentOdd = oddSelect.value || (existingRace ? existingRace.odd_pilot_id : '');
    oddSelect.innerHTML = '<option value="">— elegir —</option>' +
      biggerTeamPilots.map(t => `<option value="${t.pilot.id}">${esc(t.pilot.name)} (Eq.${biggerTeam})</option>`).join('');
    if (currentOdd) oddSelect.value = currentOdd;
    // Restaurar puntos guardados
    if (existingRace && existingRace.odd_pilot_points != null) {
      document.getElementById('odd-pilot-points').value = existingRace.odd_pilot_points;
    }
  } else {
    oddSection.style.display = 'none';
    oddSelect.value = '';
  }

  const oddPilotId = isOdd ? oddSelect.value : '';

  // Quitar al piloto impar de los equipos para el formulario
  const activeTeams = teams.filter(t => t.pilot.id !== oddPilotId);

  // Mostrar listas de equipos (marcando quién no compite)
  const teamA = teams.filter(t => t.team === 'A');
  const teamB = teams.filter(t => t.team === 'B');

  const renderTeamList = (list, color) => list.map(t => {
    const isOddP = t.pilot.id === oddPilotId;
    return `<div style="font-size:12px;padding:3px 0;display:flex;gap:6px;align-items:center;${isOddP?'opacity:.5':''}">
      <span style="color:${color};font-weight:600;min-width:16px">${t.rank}°</span>
      <span>${esc(t.pilot.name)}${isOddP?' <em style="color:#991B1B">(no compite)</em>':''}</span>
      <span style="color:#7A9AB8;font-size:11px">(${t.net}pts)</span>
    </div>`;
  }).join('');

  document.getElementById('team-a-list').innerHTML = renderTeamList(teamA, '#1A6B8A');
  document.getElementById('team-b-list').innerHTML = renderTeamList(teamB, '#C8880A');

  // Formulario de posiciones: solo los que compiten
  const pCount = activeTeams.length;

  const makeOpts = () => {
    const optsA = activeTeams.filter(t=>t.team==='A').map(t =>
      `<option value="${t.pilot.id}">[A] ${esc(t.pilot.name)}</option>`).join('');
    const optsB = activeTeams.filter(t=>t.team==='B').map(t =>
      `<option value="${t.pilot.id}">[B] ${esc(t.pilot.name)}</option>`).join('');
    return `<optgroup label="Equipo A">${optsA}</optgroup><optgroup label="Equipo B">${optsB}</optgroup>`;
  };

  document.getElementById('team-race-form-body').innerHTML = Array.from({length: pCount}, (_, i) => {
    const slot = i + 1;
    const medal = slot===1?'🥇':slot===2?'🥈':slot===3?'🥉':'';
    return `<div style="display:grid;grid-template-columns:42px 1fr;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(26,107,138,0.1)" id="trow-${i}">
      <div style="font-size:13px;font-weight:600;color:#4A6080;display:flex;align-items:center;gap:3px">
        ${medal}<span style="font-size:${slot<=3?'14':'13'}px">${slot}°</span>
      </div>
      <select id="tpilot-${i}" style="font-size:13px" onchange="previewTeamResult()">
        <option value="">— elegir —</option>
        ${makeOpts()}
      </select>
    </div>`;
  }).join('');

  // Restaurar valores guardados (solo los que compiten)
  Array.from({length: pCount}, (_, i) => {
    const slot = i + 1;
    const savedPilotId = existingResults.find(r => r.position === slot && r.pilot_id !== oddPilotId)?.pilot_id || '';
    const sel = document.getElementById('tpilot-'+i);
    if (sel && savedPilotId) sel.value = savedPilotId;
  });

  window._teamRaceOrder = teams;
  window._teamActivePilots = activeTeams;
  window._oddPilotId = oddPilotId;
  document.getElementById('team-result-preview').style.display = 'none';
  updateAvailableTeamPilots();
  previewTeamResult();
}

function updateAvailableTeamPilots() {
  const activeTeams = window._teamActivePilots;
  if (!activeTeams) return;
  const pCount = activeTeams.length;

  const selected = Array.from({length: pCount}, (_, i) => {
    const sel = document.getElementById('tpilot-'+i);
    return sel ? sel.value : '';
  });

  const makeOpts = (takenElsewhere) => {
    const optsA = activeTeams.filter(t => t.team==='A' && !takenElsewhere.has(t.pilot.id))
      .map(t => `<option value="${t.pilot.id}">[A] ${esc(t.pilot.name)}</option>`).join('');
    const optsB = activeTeams.filter(t => t.team==='B' && !takenElsewhere.has(t.pilot.id))
      .map(t => `<option value="${t.pilot.id}">[B] ${esc(t.pilot.name)}</option>`).join('');
    return `<optgroup label="Equipo A">${optsA}</optgroup><optgroup label="Equipo B">${optsB}</optgroup>`;
  };

  for (let i = 0; i < pCount; i++) {
    const sel = document.getElementById('tpilot-'+i);
    if (!sel) continue;
    const currentVal = sel.value;
    const takenElsewhere = new Set(selected.filter((v, j) => j !== i && v));
    sel.innerHTML = '<option value="">— elegir —</option>' + makeOpts(takenElsewhere);
    if (currentVal) sel.value = currentVal;
  }
}

function previewTeamResult() {
  updateAvailableTeamPilots();
  const activeTeams = window._teamActivePilots;
  if (!activeTeams) return;
  const pCount = activeTeams.length;

  const slots = Array.from({length: pCount}, (_, i) => {
    const pilotId = document.getElementById('tpilot-'+i)?.value || '';
    const pilot = activeTeams.find(t => t.pilot.id === pilotId);
    return { slot: i+1, pilotId, team: pilot ? pilot.team : null };
  });

  const allFilled = slots.every(s => s.pilotId && s.team);
  if (!allFilled) { document.getElementById('team-result-preview').style.display = 'none'; return; }

  const seen = new Set();
  let hasDupe = false;
  slots.forEach((s, i) => {
    const row = document.getElementById('trow-'+i);
    if (seen.has(s.pilotId)) { hasDupe = true; if(row) row.style.background='rgba(184,48,48,0.08)'; }
    else { seen.add(s.pilotId); if(row) row.style.background=''; }
  });
  if (hasDupe) { document.getElementById('team-result-preview').style.display = 'none'; return; }

  const scoreA = slots.filter(s => s.team === 'A').reduce((sum, s) => sum + s.slot, 0);
  const scoreB = slots.filter(s => s.team === 'B').reduce((sum, s) => sum + s.slot, 0);

  let winner;
  if (scoreA < scoreB) winner = 'A';
  else if (scoreB < scoreA) winner = 'B';
  else {
    const bestA = Math.min(...slots.filter(s => s.team === 'A').map(s => s.slot));
    const bestB = Math.min(...slots.filter(s => s.team === 'B').map(s => s.slot));
    winner = bestA < bestB ? 'B' : 'A';
  }

  const wPts = parseFloat(document.getElementById('team-win-points').value);
  const lPts = parseFloat(document.getElementById('team-lose-points').value);
  const ptsA = winner === 'A' ? wPts : lPts;
  const ptsB = winner === 'B' ? wPts : lPts;
  const preview = document.getElementById('team-result-preview');
  preview.style.display = '';
  preview.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:.5rem">
      <div style="background:${winner==='A'?'#F0FDF4':'#FEF9EC'};border-radius:6px;padding:.75rem;border:1px solid ${winner==='A'?'#86EFAC':'rgba(232,160,32,0.3)'}">
        <div style="font-size:11px;font-weight:600;color:${winner==='A'?'#166534':'#C8880A'};margin-bottom:4px">EQUIPO A — ${winner==='A'?'GANADOR':'PERDEDOR'} (${isNaN(ptsA)?'?':ptsA}pts c/u)</div>
        <div style="font-size:12px;color:#666">Suma posiciones: ${scoreA}</div>
      </div>
      <div style="background:${winner==='B'?'#F0FDF4':'#FEF9EC'};border-radius:6px;padding:.75rem;border:1px solid ${winner==='B'?'#86EFAC':'rgba(232,160,32,0.3)'}">
        <div style="font-size:11px;font-weight:600;color:${winner==='B'?'#166534':'#C8880A'};margin-bottom:4px">EQUIPO B — ${winner==='B'?'GANADOR':'PERDEDOR'} (${isNaN(ptsB)?'?':ptsB}pts c/u)</div>
        <div style="font-size:12px;color:#666">Suma posiciones: ${scoreB}</div>
      </div>
    </div>
    ${scoreA === scoreB ? '<div style="font-size:12px;color:#B86010;margin-top:6px">Empate — desempate por 1° llegado: el equipo con mejor individual pierde.</div>' : ''}
  `;
}

async function saveTeamRaceResults() {
  const n = parseInt(document.getElementById('team-race-num-select').value);
  const isDouble = document.getElementById('team-race-double').checked;
  const noDiscard = document.getElementById('team-race-nodiscard').checked;
  const winPts = parseFloat(document.getElementById('team-win-points').value);
  const losePts = parseFloat(document.getElementById('team-lose-points').value);
  if (isNaN(winPts) || isNaN(losePts)) { showToast('Completá los puntos de ganador y perdedor', 'error'); return; }

  const activeTeams = window._teamActivePilots;
  const oddPilotId = window._oddPilotId || null;
  if (!activeTeams) return;

  const pCount = activeTeams.length;

  // Validar piloto impar si corresponde
  const oddSection = document.getElementById('odd-pilot-section');
  const hasOdd = oddSection.style.display !== 'none';
  let oddPoints = null;
  if (hasOdd) {
    if (!oddPilotId) { showToast('Elegí quién no compite', 'error'); return; }
    oddPoints = parseFloat(document.getElementById('odd-pilot-points').value);
    if (isNaN(oddPoints)) { showToast('Ingresá los puntos del participante que no compite', 'error'); return; }
  }

  // Leer posiciones de los que compiten
  const slots = Array.from({length: pCount}, (_, i) => {
    const pilotId = document.getElementById('tpilot-'+i)?.value || '';
    const teamEntry = activeTeams.find(t => t.pilot.id === pilotId);
    return { slot: i+1, pilotId, team: teamEntry ? teamEntry.team : null };
  });

  if (slots.some(s => !s.pilotId)) { showToast('Completá todas las posiciones de llegada', 'error'); return; }
  const usedPilots = new Set();
  for (const s of slots) {
    if (usedPilots.has(s.pilotId)) {
      const name = allPilots.find(p => p.id === s.pilotId)?.name || '';
      showToast(`${name} aparece más de una vez`, 'error'); return;
    }
    usedPilots.add(s.pilotId);
  }

  const scoreA = slots.filter(s => s.team === 'A').reduce((sum, s) => sum + s.slot, 0);
  const scoreB = slots.filter(s => s.team === 'B').reduce((sum, s) => sum + s.slot, 0);
  let winner;
  if (scoreA < scoreB) winner = 'A';
  else if (scoreB < scoreA) winner = 'B';
  else {
    const bestA = Math.min(...slots.filter(s => s.team === 'A').map(s => s.slot));
    const bestB = Math.min(...slots.filter(s => s.team === 'B').map(s => s.slot));
    winner = bestA < bestB ? 'B' : 'A';
  }

  // Entradas de los que compiten
  const entries = slots.map(s => ({
    pilotId: s.pilotId,
    status: 'normal',
    position: s.slot,
    points: s.team === winner ? winPts : losePts,
    team: s.team
  }));

  // Agregar al piloto impar con sus puntos manuales
  if (hasOdd && oddPilotId) {
    entries.push({
      pilotId: oddPilotId,
      status: 'normal',
      position: pCount + 1,
      points: oddPoints,
      team: null
    });
  }

  // Guardar config de la regata
  let raceId;
  const existingRace = allRaces.find(r => r.race_number === n);
  if (existingRace) {
    const { error } = await db.from('races').update({
      is_double: isDouble, no_discard: noDiscard, is_team_race: true,
      team_win_points: winPts, team_lose_points: losePts,
      odd_pilot_id: hasOdd ? oddPilotId : null,
      odd_pilot_points: hasOdd ? oddPoints : null
    }).eq('id', existingRace.id);
    if (error) { showToast('Error al guardar configuración', 'error'); return; }
    raceId = existingRace.id;
  } else {
    const { data, error } = await db.from('races').insert({
      championship_id: currentChampId, race_number: n,
      is_double: isDouble, no_discard: noDiscard, is_team_race: true,
      team_win_points: winPts, team_lose_points: losePts,
      odd_pilot_id: hasOdd ? oddPilotId : null,
      odd_pilot_points: hasOdd ? oddPoints : null
    }).select().single();
    if (error) { showToast('Error al guardar regata', 'error'); return; }
    raceId = data.id;
  }

  const toUpsert = entries.map(e => ({
    race_id: raceId, pilot_id: e.pilotId,
    status: e.status, position: e.position, points: e.points, team: e.team
  }));
  const { error: resErr } = await db.from('results').upsert(toUpsert, { onConflict: 'race_id,pilot_id' });
  if (resErr) { showToast('Error al guardar resultados', 'error'); return; }

  closeModal('modal-team');
  showToast(`Regata por equipos ${n} guardada — Equipo ${winner} ganador`, 'success');
  await loadChampData();
  renderResultsTable();
}

// ===== DELETE FUNCTIONS =====

async function deleteChampionship(id, name) {
  if (!confirm(`¿Eliminar el campeonato "${name}"?\n\nEsto borrará todas las regatas, resultados y participantes. Esta acción no se puede deshacer.`)) return;
  const { error } = await db.from('championships').delete().eq('id', id);
  if (error) { showToast('Error al eliminar campeonato', 'error'); return; }
  showToast(`Campeonato "${name}" eliminado`, 'success');
  loadChampionships();
}

async function deleteCurrentChampionship() {
  if (!currentChampData) return;
  await deleteChampionship(currentChampId, currentChampData.name);
  showView('home');
}

async function deleteRace(raceId, raceNum) {
  if (!confirm(`¿Eliminar la Regata ${raceNum} y todos sus resultados?`)) return;
  const { error } = await db.from('races').delete().eq('id', raceId);
  if (error) { showToast('Error al eliminar regata', 'error'); return; }
  showToast(`Regata ${raceNum} eliminada`, 'success');
  await loadChampData();
  renderDetailView();
  renderResultsTable();
}

// ===== EDIT CHAMPIONSHIP CONFIG =====
function showEditChampModal() {
  if (!currentChampData) return;
  const c = currentChampData;
  document.getElementById('cf-name').value = c.name;
  document.getElementById('cf-desc').value = c.description || '';
  document.getElementById('cf-event-date').value = c.event_date || '';
  document.getElementById('cf-races').value = c.total_races;
  document.getElementById('cf-discards').value = c.total_discards;
  document.getElementById('cf-d1').value = c.discard1_from || '';
  document.getElementById('cf-d2').value = c.discard2_from || '';
  document.getElementById('modal-champ-title').textContent = 'Editar campeonato';
  updateChampDiscardUI();
  editingChampId = c.id;
  showModal('modal-champ');
}

// Override saveChampionship to also update currentChampData
const _origSaveChamp = saveChampionship;
saveChampionship = async function() {
  await _origSaveChamp();
  if (currentChampId) {
    const { data } = await db.from('championships').select('*').eq('id', currentChampId).single();
    if (data) {
      currentChampData = data;
      document.getElementById('champ-title').textContent = data.name;
      const ds = data.event_date ? new Date(data.event_date+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'}) : '';
      document.getElementById('champ-desc').textContent = ds && data.description ? ds + ' · ' + data.description : (ds || data.description || '');
    }
  }
  document.getElementById('modal-champ-title').textContent = 'Nuevo campeonato';
};

// ===== POINT ADJUSTMENTS =====
async function showAdjustmentsModal() {
  await loadChampData();
  const sel = document.getElementById('adj-pilot');
  sel.innerHTML = allPilots.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  document.getElementById('adj-points').value = '';
  document.getElementById('adj-reason').value = '';
  renderAdjustmentsList();
  showModal('modal-adjustments');
}

function renderAdjustmentsList() {
  const el = document.getElementById('adj-list');
  if (!allAdjustments.length) { el.innerHTML = '<div style="color:var(--text-light);font-size:13px">Sin ajustes aún.</div>'; return; }
  el.innerHTML = `
    <div style="font-size:12px;font-weight:500;color:var(--text-mid);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Ajustes cargados</div>
    ${allAdjustments.map(a => {
      const pilot = allPilots.find(p => p.id === a.pilot_id);
      const isPos = a.points > 0;
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="flex:1;font-weight:500">${pilot ? esc(pilot.name) : '?'}</span>
        <span style="font-size:13px;color:#555">${esc(a.reason)}</span>
        <span style="font-weight:600;color:${isPos?'#991B1B':'#166534'};min-width:36px;text-align:right">${isPos?'+':''}${a.points}</span>
        <button class="btn btn-sm btn-danger" onclick="deleteAdjustment('${a.id}')">x</button>
      </div>`;
    }).join('')}`;
}

async function addAdjustment() {
  const pilotId = document.getElementById('adj-pilot').value;
  const points = parseFloat(document.getElementById('adj-points').value);
  const reason = document.getElementById('adj-reason').value.trim();
  if (!pilotId || isNaN(points) || !reason) { showToast('Completá todos los campos', 'error'); return; }
  const { error } = await db.from('point_adjustments').insert({
    championship_id: currentChampId, pilot_id: pilotId, points, reason
  });
  if (error) { showToast('Error al guardar ajuste', 'error'); return; }
  document.getElementById('adj-points').value = '';
  document.getElementById('adj-reason').value = '';
  await loadChampData();
  renderAdjustmentsList();
  renderResultsTable();
  showToast('Ajuste guardado', 'success');
}

async function deleteAdjustment(id) {
  if (!confirm('¿Eliminar este ajuste?')) return;
  const { error } = await db.from('point_adjustments').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  await loadChampData();
  renderAdjustmentsList();
  renderResultsTable();
  showToast('Ajuste eliminado', 'success');
}

// ===== TOA (Archivos PDF) =====
async function renderToaTab() {
  const container = document.getElementById('toa-container');
  container.innerHTML = '<div class="loading-state">Cargando archivos...</div>';

  const { data: files, error } = await db.from('toa_files')
    .select('*').eq('championship_id', currentChampId).order('created_at', { ascending: false });
  if (error) { container.innerHTML = '<div class="loading-state">Error al cargar.</div>'; return; }

  const uploadSection = currentUser ? `
    <div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1rem">
      <div style="font-size:15px;font-weight:500;margin-bottom:.75rem;color:var(--navy)">Subir archivo TOA</div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="margin:0;flex:1;min-width:200px">
          <label>Nombre del documento</label>
          <input type="text" id="toa-name" placeholder="Ej: Aviso a los navegantes #1">
        </div>
        <div class="field" style="margin:0">
          <label>Archivo PDF</label>
          <input type="file" id="toa-file" accept=".pdf" style="font-size:13px;padding:6px">
        </div>
        <button class="btn btn-accent" onclick="uploadToaFile()">Subir PDF</button>
      </div>
      <div id="toa-upload-progress" style="display:none;margin-top:.5rem;font-size:13px;color:var(--sea)"></div>
    </div>` : '';

  const filesList = files && files.length ? files.map(f => {
    const date = new Date(f.created_at).toLocaleDateString('es-AR');
    const size = f.file_size ? `${(f.file_size/1024).toFixed(0)} KB` : '';
    return `<div style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem 1.25rem;display:flex;align-items:center;gap:12px;margin-bottom:.75rem">
      <div style="width:40px;height:40px;background:#FEE2E2;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📄</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:500;font-size:14px;color:var(--navy)">${esc(f.name)}</div>
        <div style="font-size:12px;color:var(--text-light)">${date}${size?' · '+size:''}</div>
      </div>
      <a href="${getToaFileUrl(f.file_path)}" target="_blank" download="${esc(f.name)}.pdf" class="btn btn-sm" style="text-decoration:none">⬇ Descargar</a>
      ${currentUser ? `<button class="btn btn-sm btn-danger" onclick="deleteToaFile('${f.id}','${f.file_path}')">Eliminar</button>` : ''}
    </div>`;
  }).join('') : '<div class="empty-state" style="padding:2rem 0"><p>No hay archivos TOA aún.</p></div>';

  container.innerHTML = uploadSection + filesList;
}

function getToaFileUrl(path) {
  const { data } = db.storage.from('toa').getPublicUrl(path);
  return data.publicUrl;
}

async function uploadToaFile() {
  const name = document.getElementById('toa-name').value.trim();
  const fileInput = document.getElementById('toa-file');
  const file = fileInput.files[0];
  if (!name) { showToast('Ingresá un nombre para el documento', 'error'); return; }
  if (!file) { showToast('Seleccioná un archivo PDF', 'error'); return; }
  if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Solo se permiten archivos PDF', 'error'); return; }

  const progress = document.getElementById('toa-upload-progress');
  progress.style.display = '';
  progress.textContent = 'Subiendo archivo...';

  const path = `${currentChampId}/${Date.now()}_${file.name.replace(/\s/g,'_')}`;
  const { error: uploadErr } = await db.storage.from('toa').upload(path, file, { contentType: 'application/pdf' });
  if (uploadErr) { progress.textContent = 'Error al subir: ' + uploadErr.message; return; }

  const { error: dbErr } = await db.from('toa_files').insert({
    championship_id: currentChampId, name, file_path: path, file_size: file.size
  });
  if (dbErr) { progress.textContent = 'Error al registrar archivo.'; return; }

  progress.style.display = 'none';
  document.getElementById('toa-name').value = '';
  fileInput.value = '';
  showToast('Archivo subido correctamente', 'success');
  renderToaTab();
}

async function deleteToaFile(id, path) {
  if (!confirm('¿Eliminar este archivo TOA?')) return;
  await db.storage.from('toa').remove([path]);
  const { error } = await db.from('toa_files').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Archivo eliminado', 'success');
  renderToaTab();
}

// ===== EXPORT EXCEL =====
function exportExcel() {
  const { pilotData, loadedRaceNums } = computeScores();
  const sorted = [...pilotData].sort((a,b) => a.net - b.net || a.medalPos - b.medalPos || a.gross - b.gross);

  // Build header row
  const headers = ['Pos', 'Participante', 'Vela',
    ...loadedRaceNums.map(n => {
      const r = allRaces.find(x => x.race_number === n);
      return `R${n}${r.is_double?'(x2)':''}${r.no_discard?'(ND)':''}${r.is_team_race?'(EQ)':''}`;
    }),
    'Brutos', 'Ajustes', 'Netos'];

  const rows = sorted.map((p, rank) => {
    const cells = loadedRaceNums.map(n => {
      const race = allRaces.find(r => r.race_number === n);
      const rData = p.pts.find(pt => pt.race.race_number === n);
      if (!rData) return '-';
      const isDiscard = p.discarded.includes(race.id);
      const st = rData.result.status;
      const val = PENALTIES.includes(st) ? st : rData.result.position;
      return isDiscard ? `[${val}]` : val;
    });
    return [rank+1, p.pilot.name, p.pilot.sail_number||'', ...cells, p.gross, p.adjTotal||0, p.net];
  });

  // Simple XLSX via CSV-in-Excel trick with proper XML
  const allRows = [headers, ...rows];
  let xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Resultados">
    <Table>`;

  allRows.forEach((row, ri) => {
    xml += '<Row>';
    row.forEach(cell => {
      const isNum = typeof cell === 'number' || (!isNaN(cell) && cell !== '' && cell !== '-');
      const type = isNum ? 'Number' : 'String';
      const val = String(cell).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      xml += `<Cell><Data ss:Type="${type}">${val}</Data></Cell>`;
    });
    xml += '</Row>';
  });

  xml += `</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentChampData.name||'campeonato').replace(/\s+/g,'_') + '_resultados.xls';
  a.click();
  URL.revokeObjectURL(url);
}

// ===== ADJUSTMENTS SUMMARY POPUP =====
function showAdjustmentsSummary() {
  const container = document.getElementById('results-container');
  const existing = document.getElementById('adj-summary-popup');
  if (existing) { existing.remove(); return; }

  if (!allAdjustments.length) { showToast('No hay ajustes de puntos cargados', ''); return; }

  const grouped = {};
  allAdjustments.forEach(a => {
    const pilot = allPilots.find(p => p.id === a.pilot_id);
    const name = pilot ? pilot.name : '?';
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(a);
  });

  const rows = Object.entries(grouped).map(([name, adjs]) => {
    const total = adjs.reduce((s,a) => s+a.points, 0);
    const details = adjs.map(a =>
      `<div style="font-size:12px;color:var(--text-mid);padding:2px 0 2px 8px;border-left:2px solid ${a.points>0?'#FECACA':'#BBF7D0'}">
        <span style="font-weight:500;color:${a.points>0?'#991B1B':'#166534'}">${a.points>0?'+':''}${a.points}</span>
        — ${esc(a.reason)}</div>`
    ).join('');
    return `<div style="padding:.5rem 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-weight:500;font-size:13px">${esc(name)}</span>
        <span style="margin-left:auto;font-weight:600;font-size:13px;color:${total>0?'#991B1B':'#166534'}">${total>0?'+':''}${total} pts</span>
      </div>
      ${details}
    </div>`;
  }).join('');

  const popup = document.createElement('div');
  popup.id = 'adj-summary-popup';
  popup.className = 'adj-popup';
  popup.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
      <span style="font-size:14px;font-weight:500;color:var(--navy)">Detalle de ajustes de puntos</span>
      <button class="btn btn-sm" onclick="document.getElementById('adj-summary-popup').remove()">Cerrar</button>
    </div>
    ${rows}`;

  container.insertBefore(popup, container.firstChild);
}

// ===== PROTESTS / AUDIENCIAS =====
let currentEditProtestId = null;
const PROTEST_PARTIES_EXTRA = ['Comisión de Regatas (CR)'];

async function renderProtestsTab() {
  const container = document.getElementById('protests-container');
  container.innerHTML = '<div class="loading-state">Cargando audiencias...</div>';

  const { data: protests, error } = await db.from('protests')
    .select('*').eq('championship_id', currentChampId)
    .order('created_at', { ascending: false });
  if (error) { container.innerHTML = '<div class="loading-state">Error al cargar.</div>'; return; }

  const statusLabel = { PENDIENTE: 'Pendiente de revisión', DESESTIMADO: 'Desestimado', RESUELTO: 'Resuelto' };

  const newBtn = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
      <button class="btn btn-accent" onclick="showNewProtestModal()">+ Nuevo pedido de audiencia</button>
    </div>`;

  if (!protests || !protests.length) {
    container.innerHTML = newBtn + '<div class="empty-state"><p>No hay pedidos de audiencia aún.</p></div>';
    return;
  }

  const cards = protests.map(p => {
    const date = new Date(p.created_at).toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit',year:'numeric'});
    const crSection = (p.cr_response || p.cr_result) ? `
      ${p.cr_response ? `<div class="protest-cr-box">
        <div class="protest-cr-label">Respuesta de la CR</div>
        <div class="protest-cr-text">${esc(p.cr_response)}</div>
      </div>` : ''}
      ${p.cr_result ? `<div class="protest-result-box">
        <div class="protest-cr-label" style="color:var(--accent-dark)">Resultado</div>
        <div class="protest-cr-text">${esc(p.cr_result)}</div>
      </div>` : ''}` : '';

    const editBtn = currentUser
      ? `<button class="btn btn-sm" onclick="showProtestEditModal('${p.id}')" style="margin-top:.75rem;font-size:11px">Editar resolución</button>`
      : '';

    return `<div class="protest-card status-${p.status}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span class="protest-status">${statusLabel[p.status]||p.status}</span>
        <span style="font-size:11px;color:var(--text-light)">${date}</span>
      </div>
      <div class="protest-parties">
        <span style="color:var(--navy)">${esc(p.protestor)}</span>
        <span class="protest-arrow">→</span>
        <span style="color:var(--danger)">${esc(p.protestee)}</span>
      </div>
      <div class="protest-desc">${esc(p.description)}</div>
      ${crSection}
      ${editBtn}
    </div>`;
  }).join('');

  container.innerHTML = newBtn + cards;
}

function showNewProtestModal() {
  const partyOptions = [
    ...allPilots.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`),
    ...PROTEST_PARTIES_EXTRA.map(e => `<option value="${esc(e)}">${esc(e)}</option>`)
  ].join('');

  document.getElementById('prot-protestor').innerHTML = '<option value="">— Seleccionar —</option>' + partyOptions;
  document.getElementById('prot-protestee').innerHTML = '<option value="">— Seleccionar —</option>' + partyOptions;
  document.getElementById('prot-description').value = '';
  showModal('modal-protest-new');
}

async function submitProtest() {
  const protestor = document.getElementById('prot-protestor').value;
  const protestee = document.getElementById('prot-protestee').value;
  const description = document.getElementById('prot-description').value.trim();

  if (!protestor) { showToast('Seleccioná el protestante', 'error'); return; }
  if (!protestee) { showToast('Seleccioná el protestado', 'error'); return; }
  if (protestor === protestee) { showToast('El protestante y el protestado no pueden ser el mismo', 'error'); return; }
  if (!description) { showToast('Ingresá la descripción de los hechos', 'error'); return; }

  const { error } = await db.from('protests').insert({
    championship_id: currentChampId, protestor, protestee, description, status: 'PENDIENTE'
  });
  if (error) { showToast('Error al enviar el pedido', 'error'); return; }

  closeModal('modal-protest-new');
  showToast('Pedido de audiencia enviado a la CR', 'success');
  renderProtestsTab();
}

async function showProtestEditModal(protestId) {
  const { data: p, error } = await db.from('protests').select('*').eq('id', protestId).single();
  if (error || !p) { showToast('Error al cargar', 'error'); return; }

  currentEditProtestId = protestId;
  document.getElementById('protest-edit-summary').innerHTML =
    `<strong>${esc(p.protestor)}</strong> → <strong>${esc(p.protestee)}</strong><br>
    <span style="color:var(--text-mid);font-size:12px">${esc(p.description)}</span>`;
  document.getElementById('protest-edit-status').value = p.status;
  document.getElementById('protest-edit-response').value = p.cr_response || '';
  document.getElementById('protest-edit-result').value = p.cr_result || '';
  showModal('modal-protest-edit');
}

async function saveProtestEdit() {
  if (!currentEditProtestId) return;
  const status = document.getElementById('protest-edit-status').value;
  const cr_response = document.getElementById('protest-edit-response').value.trim();
  const cr_result = document.getElementById('protest-edit-result').value.trim();

  const { error } = await db.from('protests').update({
    status, cr_response: cr_response || null, cr_result: cr_result || null,
    updated_at: new Date().toISOString()
  }).eq('id', currentEditProtestId);

  if (error) { showToast('Error al guardar', 'error'); return; }
  closeModal('modal-protest-edit');
  showToast('Resolución guardada', 'success');
  renderProtestsTab();
}

async function deleteProtest() {
  if (!currentEditProtestId) return;
  if (!confirm('¿Eliminar este pedido de audiencia?')) return;
  const { error } = await db.from('protests').delete().eq('id', currentEditProtestId);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  closeModal('modal-protest-edit');
  showToast('Pedido eliminado', 'success');
  renderProtestsTab();
}

// ===== HOME EXTRAS: COUNTDOWN + ANNUAL =====

let countdownInterval = null;

async function loadHomeExtras() {
  await Promise.all([loadCountdownBanner(), loadAnnualStandings()]);
}

// ===== COUNTDOWN BANNER =====
async function loadCountdownBanner() {
  const banner = document.getElementById('countdown-banner');
  // Fetch all upcoming dates across all championships
  const { data: dates } = await db.from('championship_dates')
    .select('*, championships(name)')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(1);

  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

  if (!dates || !dates.length) { banner.style.display = 'none'; return; }

  const next = dates[0];
  const targetDate = new Date(next.event_date);
  const champName = next.championships?.name || '';

  function updateBanner() {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) {
      banner.style.display = 'none';
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }
    const days = Math.floor(diff / (1000*60*60*24));
    const hours = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
    const mins = Math.floor((diff % (1000*60*60)) / (1000*60));
    const secs = Math.floor((diff % (1000*60)) / 1000);

  banner.style.display = '';
    banner.innerHTML = `
      <div class="banner-main-inner">
        <span class="banner-round-tag">Próxima edición</span>
        <div class="banner-countdown-divider"></div>
        <div style="display:flex;flex-direction:column;gap:1px">
          <span class="banner-event-name">${esc(next.name)}</span>
          <span style="font-size:11px;color:rgba(255,255,255,0.4)">${new Date(next.event_date).toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'})}</span>
        </div>
        <div class="banner-countdown-divider" style="margin-left:auto"></div>
        <span class="banner-countdown-label">Cuenta regresiva</span>
        <div class="banner-countdown">
          <div class="countdown-block">
            <span class="countdown-lbl">Días</span>
            <span class="countdown-num">${String(days).padStart(2,'0')}</span>
          </div>
          <div class="countdown-block">
            <span class="countdown-lbl">Horas</span>
            <span class="countdown-num">${String(hours).padStart(2,'0')}</span>
          </div>
          <div class="countdown-block">
            <span class="countdown-lbl">Minutos</span>
            <span class="countdown-num">${String(mins).padStart(2,'0')}</span>
          </div>
          <div class="countdown-block">
            <span class="countdown-lbl">Segundos</span>
            <span class="countdown-num">${String(secs).padStart(2,'0')}</span>
          </div>
        </div>
      </div>`;
  }
  
  updateBanner();
  countdownInterval = setInterval(updateBanner, 1000);
}

// ===== DATES MANAGEMENT =====
async function showDatesModal() {
  document.getElementById('date-name').value = '';
  document.getElementById('date-datetime').value = '';
  await renderDatesList();
  showModal('modal-dates');
}

async function renderDatesList() {
  const el = document.getElementById('dates-list');
  const { data: dates } = await db.from('championship_dates')
    .select('*').eq('championship_id', currentChampId)
    .order('event_date', { ascending: true });

  if (!dates || !dates.length) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px">Sin fechas cargadas.</div>';
    return;
  }
  el.innerHTML = `
    <div style="font-size:11px;font-weight:500;color:var(--text-mid);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Fechas cargadas</div>
    ${dates.map(d => {
      const dt = new Date(d.event_date);
      const isPast = dt < new Date();
      const fmt = dt.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' +
        dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="flex:1;font-weight:500;color:${isPast?'var(--text-light)':'var(--text)'}">${esc(d.name)}</span>
        <span style="color:${isPast?'var(--text-light)':'var(--sea)'};">${fmt}</span>
        ${isPast?'<span style="font-size:11px;color:var(--text-light)">(pasada)</span>':''}
        <button class="btn btn-sm btn-danger" onclick="deleteChampDate('${d.id}')">x</button>
      </div>`;
    }).join('')}`;
}

async function addChampDate() {
  const name = document.getElementById('date-name').value.trim();
  const dt = document.getElementById('date-datetime').value;
  if (!name || !dt) { showToast('Completá nombre y fecha', 'error'); return; }
  const { error } = await db.from('championship_dates').insert({
    championship_id: currentChampId, name, event_date: new Date(dt).toISOString()
  });
  if (error) { showToast('Error al guardar fecha', 'error'); return; }
  document.getElementById('date-name').value = '';
  document.getElementById('date-datetime').value = '';
  await renderDatesList();
  loadCountdownBanner();
  showToast('Fecha agregada', 'success');
}

async function deleteChampDate(id) {
  if (!confirm('¿Eliminar esta fecha?')) return;
  await db.from('championship_dates').delete().eq('id', id);
  await renderDatesList();
  loadCountdownBanner();
}

// ===== ANNUAL CHAMPIONSHIP =====

async function loadAnnualStandings() {
  const section = document.getElementById('annual-section');
  // Get active annual config
  const { data: configs } = await db.from('annual_config').select('*').eq('active', true).limit(1);
  if (!configs || !configs.length) { section.style.display = 'none'; return; }

  const annual = configs[0];
  document.getElementById('annual-title').textContent = annual.title;

  // Get championships in this annual
  const { data: annualChamps } = await db.from('annual_championships')
    .select('championship_id').eq('annual_id', annual.id);
  if (!annualChamps || !annualChamps.length) { section.style.display = 'none'; return; }

  const champIds = annualChamps.map(a => a.championship_id);

  // Fetch all data for included championships
  const { data: allChamps } = await db.from('championships').select('*').in('id', champIds);
  if (!allChamps || !allChamps.length) { section.style.display = 'none'; return; }

  // Compute standings for each championship
  const champStandings = await Promise.all(allChamps.map(async c => {
    const [pilotsRes, racesRes, resultsRes, adjRes] = await Promise.all([
      db.from('pilots').select('id,name').eq('championship_id', c.id),
      db.from('races').select('*').eq('championship_id', c.id),
      db.from('results').select('*, races!inner(championship_id)').eq('races.championship_id', c.id),
      db.from('point_adjustments').select('*').eq('championship_id', c.id)
    ]);
    const pilots = pilotsRes.data || [];
    const races = racesRes.data || [];
    const results = resultsRes.data || [];
    const adjs = adjRes.data || [];
    if (!pilots.length || !races.length) return { champ: c, pilots, ranked: [] };

    const maxRace = Math.max(...races.map(r => r.race_number));
    const activeD = c.total_discards >= 2 && maxRace >= c.discard2_from ? 2
      : c.total_discards >= 1 && maxRace >= c.discard1_from ? 1 : 0;

    const medalRace = races.find(r => r.is_medal_race);
    const scores = pilots.map(pilot => {
      const pts = races.map(race => {
        const res = results.find(r => r.race_id === race.id && r.pilot_id === pilot.id);
        return res ? { race, pts: res.points } : null;
      }).filter(Boolean);
      const gross = pts.reduce((a,p) => a + (p.race.is_double ? p.pts*2 : p.pts), 0);
      const discardable = pts.filter(p => !p.race.no_discard);
      let discarded = [];
      if (activeD > 0 && discardable.length) {
        [...discardable].sort((a,b)=>(b.race.is_double?b.pts*2:b.pts)-(a.race.is_double?a.pts*2:a.pts))
          .slice(0, activeD).forEach(p => discarded.push(p.race.id));
      }
      const raceNet = pts.filter(p=>!discarded.includes(p.race.id))
        .reduce((a,p)=>a+(p.race.is_double?p.pts*2:p.pts),0);
      const adjTotal = adjs.filter(a=>a.pilot_id===pilot.id).reduce((a,adj)=>a+adj.points,0);
      // Posición en Medal Race para desempate
      let medalPos = 9999;
      if (medalRace) {
        const mr = results.find(r => r.race_id === medalRace.id && r.pilot_id === pilot.id);
        if (mr && !PENALTIES.includes(mr.status)) medalPos = mr.position;
      }
      return { name: pilot.name, net: raceNet + adjTotal, gross, medalPos };
    }).sort((a,b)=>a.net-b.net || a.medalPos-b.medalPos || a.gross-b.gross);

    // Assign finish positions (1-based)
    const ranked = scores.map((s, i) => ({ ...s, position: i + 1 }));
    return { champ: c, pilots, ranked };
  }));

  // Collect all unique pilot names across all included championships
  const allPilotNames = new Set();
  champStandings.forEach(cs => cs.pilots.forEach(p => allPilotNames.add(p.name)));
  const totalUniquePilots = allPilotNames.size;

  // Penalty for not participating = totalUniquePilots
  const absentPenalty = totalUniquePilots;

  // Build annual scores per pilot name
  const annualScores = {};
  allPilotNames.forEach(name => {
    annualScores[name] = { name, total: 0, perChamp: {} };
    champStandings.forEach(cs => {
      const entry = cs.ranked.find(r => r.name === name);
      if (entry) {
        annualScores[name].total += entry.position;
        annualScores[name].perChamp[cs.champ.id] = { pos: entry.position, absent: false };
      } else if (cs.ranked.length > 0) {
        // Only penalize if that champ has results
        annualScores[name].total += absentPenalty;
        annualScores[name].perChamp[cs.champ.id] = { pos: absentPenalty, absent: true };
      } else {
        annualScores[name].perChamp[cs.champ.id] = { pos: null, absent: false };
      }
    });
  });

  const annualRanked = Object.values(annualScores)
    .filter(p => champStandings.some(cs => cs.ranked.find(r => r.name === p.name)))
    .sort((a,b) => a.total - b.total);

  if (!annualRanked.length) { section.style.display = 'none'; return; }

  const medals = ['🥇','🥈','🥉'];
  const champHeaders = allChamps.map(c =>
    `<th title="${esc(c.name)}">${esc(c.name.length > 12 ? c.name.slice(0,12)+'…' : c.name)}</th>`
  ).join('');

  const rows = annualRanked.map((p, i) => {
    const pos = i+1;
    const posLabel = medals[i] || `${pos}°`;
    const posClass = pos===1?'pos-1':pos===2?'pos-2':pos===3?'pos-3':'';
    const champCells = allChamps.map(c => {
      const entry = p.perChamp[c.id];
      if (!entry || entry.pos === null) return `<td style="color:var(--text-light)">—</td>`;
      if (entry.absent) return `<td class="annual-pts-absent" title="No participó — penalidad ${absentPenalty}">${absentPenalty}*</td>`;
      return `<td>${entry.pos}°</td>`;
    }).join('');
    return `<tr>
      <td><span class="pos-medal ${posClass}">${posLabel}</span></td>
      <td>${esc(p.name)}</td>
      ${champCells}
      <td style="font-weight:600;color:var(--sea)">${p.total}</td>
    </tr>`;
  }).join('');

  const table = `
    <div style="overflow-x:auto">
      <table class="annual-table">
        <thead><tr>
          <th>Pos</th><th>Participante</th>
          ${champHeaders}
          <th>Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--text-light);margin-top:.5rem">
      * No participó — penalidad: ${absentPenalty} (total inscriptos únicos)
    </div>`;

  document.getElementById('annual-standings').innerHTML = table;
  section.style.display = '';
}

// ===== ANNUAL ADMIN MODAL =====
async function showAnnualAdminModal() {
  const { data: configs } = await db.from('annual_config').select('*').eq('active', true).limit(1);
  const existing = configs && configs.length ? configs[0] : null;

  document.getElementById('annual-title-input').value = existing ? existing.title : 'Campeonato Anual';

  // Get all championships
  const { data: allChamps } = await db.from('championships').select('id,name').order('created_at', {ascending:false});

  // Get currently selected championship IDs
  let selectedIds = new Set();
  if (existing) {
    const { data: ac } = await db.from('annual_championships').select('championship_id').eq('annual_id', existing.id);
    if (ac) ac.forEach(a => selectedIds.add(a.championship_id));
  }

  document.getElementById('annual-champ-list').innerHTML = (allChamps||[]).map(c => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 0">
      <input type="checkbox" value="${c.id}" ${selectedIds.has(c.id)?'checked':''}>
      ${esc(c.name)}
    </label>`).join('');

  window._annualExistingId = existing ? existing.id : null;
  showModal('modal-annual');
}

async function saveAnnualConfig() {
  const title = document.getElementById('annual-title-input').value.trim();
  if (!title) { showToast('Ingresá un título', 'error'); return; }

  const checked = [...document.querySelectorAll('#annual-champ-list input[type=checkbox]:checked')]
    .map(cb => cb.value);

  let annualId = window._annualExistingId;

  if (annualId) {
    await db.from('annual_config').update({ title }).eq('id', annualId);
    await db.from('annual_championships').delete().eq('annual_id', annualId);
  } else {
    const { data } = await db.from('annual_config').insert({ title, active: true }).select().single();
    annualId = data.id;
  }

  if (checked.length) {
    await db.from('annual_championships').insert(
      checked.map(cid => ({ annual_id: annualId, championship_id: cid }))
    );
  }

  closeModal('modal-annual');
  showToast('Campeonato anual guardado', 'success');
  loadAnnualStandings();
}

// ===== GLOBAL DATES MANAGEMENT (home screen) =====

async function showManageDatesModal() {
  // Populate championship dropdown
  const { data: champs } = await db.from('championships').select('id,name').order('created_at', { ascending: false });
  const sel = document.getElementById('gd-champ-select');
  sel.innerHTML = '<option value="">— Sin campeonato vinculado / Campeonato futuro —</option>';
  (champs || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  document.getElementById('gd-name').value = '';
  document.getElementById('gd-datetime').value = '';
  document.getElementById('gd-champ-name-wrap').style.display = 'none';
  document.getElementById('gd-champ-name').value = '';
  await renderGlobalDatesList();
  showModal('modal-manage-dates');
}

function onGdChampChange() {
  const val = document.getElementById('gd-champ-select').value;
  // Show free-text name field only when no existing champ selected
  document.getElementById('gd-champ-name-wrap').style.display = val ? 'none' : '';
}

async function addGlobalDate() {
  const name = document.getElementById('gd-name').value.trim();
  const dt = document.getElementById('gd-datetime').value;
  const champId = document.getElementById('gd-champ-select').value || null;
  const champName = document.getElementById('gd-champ-name').value.trim() || null;

  if (!name) { showToast('Ingresá un nombre para el evento', 'error'); return; }
  if (!dt) { showToast('Ingresá la fecha y hora', 'error'); return; }

  const payload = {
    name,
    event_date: new Date(dt).toISOString(),
    championship_id: champId || null,
    label: !champId ? champName : null
  };

  // championship_id is NOT NULL in schema — if no champ, we need to handle it
  // Use a workaround: store label in name field with prefix if no champId
  if (!champId) {
    // Insert without championship_id — requires schema to allow null
    const { error } = await db.from('championship_dates').insert(payload);
    if (error) {
      // If null championship_id not allowed, show helpful message
      showToast('Error: necesitás seleccionar un campeonato existente, o crear uno primero', 'error');
      return;
    }
  } else {
    const { error } = await db.from('championship_dates').insert(payload);
    if (error) { showToast('Error al guardar fecha', 'error'); return; }
  }

  document.getElementById('gd-name').value = '';
  document.getElementById('gd-datetime').value = '';
  document.getElementById('gd-champ-name').value = '';
  await renderGlobalDatesList();
  loadCountdownBanner();
  showToast('Fecha agregada', 'success');
}

async function renderGlobalDatesList() {
  const el = document.getElementById('global-dates-list');
  el.innerHTML = '<div style="color:var(--text-light);font-size:13px">Cargando...</div>';

  const { data: dates } = await db.from('championship_dates')
    .select('*, championships(name)')
    .order('event_date', { ascending: true });

  if (!dates || !dates.length) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:.5rem 0">No hay fechas cargadas aún.</div>';
    return;
  }

  const now = new Date();
  el.innerHTML = `
    <div style="font-size:11px;font-weight:500;color:var(--text-mid);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Todas las fechas</div>
    ${dates.map(d => {
      const dt = new Date(d.event_date);
      const isPast = dt < now;
      const fmt = dt.toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' +
        dt.toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'});
      const champLabel = d.championships?.name || d.label || '—';
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <div style="font-weight:500;color:${isPast?'var(--text-light)':'var(--text)'}">${esc(d.name)}</div>
          <div style="font-size:11px;color:var(--text-light)">${esc(champLabel)}</div>
        </div>
        <span style="color:${isPast?'var(--text-light)':'var(--sea)'};white-space:nowrap">${fmt}</span>
        ${isPast ? '<span style="font-size:11px;color:var(--text-light)">(pasada)</span>' : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteGlobalDate('${d.id}')">Eliminar</button>
      </div>`;
    }).join('')}`;
}

async function deleteGlobalDate(id) {
  if (!confirm('¿Eliminar esta fecha?')) return;
  await db.from('championship_dates').delete().eq('id', id);
  await renderGlobalDatesList();
  loadCountdownBanner();
  showToast('Fecha eliminada', 'success');
}
// ===== MEDAL SERIES =====

let currentMedalSeries = null;

async function showMedalSeriesModal() {
  // Cargar config existente
  const { data: ms } = await db.from('medal_series')
    .select('*').eq('championship_id', currentChampId).eq('active', true).maybeSingle();
  currentMedalSeries = ms || null;

  // Poblar selector de "hasta qué regata"
  const sel = document.getElementById('ms-qualifier-until');
  sel.innerHTML = '';
  for (let i = 1; i <= currentChampData.total_races; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Regata ${i}`;
    sel.appendChild(opt);
  }

  const configBox = document.getElementById('ms-current-config');
  const deleteBtn = document.getElementById('ms-delete-btn');

  if (ms) {
    sel.value = ms.qualifier_until;
    document.getElementById('ms-num-races').value = ms.num_medal_races;
    configBox.style.display = '';
    configBox.innerHTML = `<strong>Medal Series activa:</strong> clasificación hasta regata ${ms.qualifier_until}, ${ms.num_medal_races} regata(s) medal.`;
    deleteBtn.style.display = '';
  } else {
    document.getElementById('ms-num-races').value = '';
    configBox.style.display = 'none';
    deleteBtn.style.display = 'none';
  }

  showModal('modal-medal-series');
}

async function saveMedalSeries() {
  const qualifierUntil = parseInt(document.getElementById('ms-qualifier-until').value);
  const numRaces = parseInt(document.getElementById('ms-num-races').value);

  if (!qualifierUntil || !numRaces) { showToast('Completá ambos campos', 'error'); return; }
  if (numRaces < 1) { showToast('La cantidad de regatas medal debe ser al menos 1', 'error'); return; }

  const payload = {
    championship_id: currentChampId,
    qualifier_until: qualifierUntil,
    num_medal_races: numRaces,
    active: true
  };

  let error;
  if (currentMedalSeries) {
    ({ error } = await db.from('medal_series').update(payload).eq('id', currentMedalSeries.id));
  } else {
    ({ error } = await db.from('medal_series').insert(payload));
  }

  if (error) { showToast('Error al guardar Medal Series', 'error'); return; }

  closeModal('modal-medal-series');
  showToast('Medal Series configurada', 'success');
  await loadChampData();
  renderResultsTable();
}

async function deleteMedalSeries() {
  if (!confirm('¿Desactivar la Medal Series? Las regatas cargadas no se borran, pero la tabla vuelve a la clasificación normal.')) return;
  if (currentMedalSeries) {
    await db.from('medal_series').update({ active: false }).eq('id', currentMedalSeries.id);
  }
  closeModal('modal-medal-series');
  showToast('Medal Series desactivada', 'success');
  await loadChampData();
  renderResultsTable();
}

// ===== MEDAL SERIES: cálculo de la tabla =====

// Calcula el puntaje inicial (carry-over) en cascada
function computeMedalStartPoints(qualifierRanking, n, k) {
  // qualifierRanking: array ordenado [{pilot, net}] con el neto hasta la regata clasificatoria
  // n = cantidad de participantes, k = cantidad de regatas medal
  const result = [];
  for (let i = 0; i < qualifierRanking.length; i++) {
    const orig = qualifierRanking[i].net;
    if (i === 0) {
      // 1ro: su puntaje tal cual
      result.push({ ...qualifierRanking[i], startNet: orig });
    } else if (i <= 2) {
      // 2do y 3ro: su puntaje, o el del anterior ajustado + (n-1) si está a más de (n-1)
      const prevStart = result[i-1].startNet;
      const cap = prevStart + (n - 1);
      result.push({ ...qualifierRanking[i], startNet: Math.min(orig, cap) });
    } else {
      // 4to en adelante: cascada respecto al anterior ajustado + (n-1),
      // pero con tope global: puntaje del 3ro ya procesado + (n-1)*k
      const prevStart = result[i-1].startNet;
      const cap = prevStart + (n - 1);
      const thirdStart = result[2] ? result[2].startNet : prevStart;
      const globalCap = thirdStart + (n - 1) * k;
      result.push({ ...qualifierRanking[i], startNet: Math.min(orig, cap, globalCap) });
    }
  }
  return result;
}

// Calcula la clasificación (neto) hasta una regata específica, con desempate por medal race
function computeRankingUntilRace(raceNumberMax) {
  const racesUpTo = allRaces.filter(r => r.race_number <= raceNumberMax && !r.is_medal_series);
  const maxRace = racesUpTo.length ? Math.max(...racesUpTo.map(r => r.race_number)) : 0;
  const activeD = getActiveDiscards(maxRace, currentChampData);
  const medalRace = racesUpTo.find(r => r.is_medal_race);

  const scores = allPilots.map(pilot => {
    const pts = racesUpTo.map(race => {
      const res = allResults.find(r => r.race_id === race.id && r.pilot_id === pilot.id);
      return res ? { race, pts: res.points } : null;
    }).filter(Boolean);
    const gross = pts.reduce((a,p) => a + (p.race.is_double ? p.pts*2 : p.pts), 0);
    const discardable = pts.filter(p => !p.race.no_discard);
    let discarded = [];
    if (activeD > 0 && discardable.length) {
      [...discardable].sort((a,b)=>(b.race.is_double?b.pts*2:b.pts)-(a.race.is_double?a.pts*2:a.pts))
        .slice(0, activeD).forEach(p => discarded.push(p.race.id));
    }
    const raceNet = pts.filter(p=>!discarded.includes(p.race.id)).reduce((a,p)=>a+(p.race.is_double?p.pts*2:p.pts),0);
    // Solo ajustes NO medal series (los de la clasificación)
    const adjTotal = allAdjustments.filter(a=>a.pilot_id===pilot.id && !a.is_medal_series).reduce((a,adj)=>a+adj.points,0);
    let medalPos = 9999;
    if (medalRace) {
      const mr = allResults.find(r => r.race_id === medalRace.id && r.pilot_id === pilot.id);
      if (mr && !PENALTIES.includes(mr.status)) medalPos = mr.position;
    }
    return { pilot, net: raceNet + adjTotal, gross, medalPos };
  });

  return scores.sort((a,b) => a.net - b.net || a.medalPos - b.medalPos || a.gross - b.gross);
}

// Calcula la tabla completa de la Medal Series
function computeMedalSeriesTable() {
  if (!activeMedalSeries) return null;

  const n = allPilots.length;
  const k = activeMedalSeries.num_medal_races;
  const qualifierUntil = activeMedalSeries.qualifier_until;

  // 1. Ranking clasificatorio (hasta la regata elegida)
  const qualifierRanking = computeRankingUntilRace(qualifierUntil);

  // 2. Puntaje inicial en cascada
  const withStart = computeMedalStartPoints(qualifierRanking, n, k);

  // 3. Regatas de la medal series (marcadas con is_medal_series)
  const medalRaces = allRaces.filter(r => r.is_medal_series).sort((a,b) => a.race_number - b.race_number);

  // 4. Sumar puntos de las regatas medal + ajustes medal series
  const lastMedalRace = medalRaces.length ? medalRaces[medalRaces.length - 1] : null;

  const table = withStart.map(entry => {
    const pilot = entry.pilot;
    const medalPts = medalRaces.map(race => {
      const res = allResults.find(r => r.race_id === race.id && r.pilot_id === pilot.id);
      return res ? { race, pts: res.points, status: res.status, position: res.position } : null;
    }).filter(Boolean);
    const medalSum = medalPts.reduce((a,p) => a + p.pts, 0);
    const adjMedal = allAdjustments.filter(a => a.pilot_id === pilot.id && a.is_medal_series).reduce((a,adj)=>a+adj.points,0);
    const total = entry.startNet + medalSum + adjMedal;

    // Posición en la última regata medal (para desempate)
    let lastPos = 9999;
    if (lastMedalRace) {
      const lr = allResults.find(r => r.race_id === lastMedalRace.id && r.pilot_id === pilot.id);
      if (lr && !PENALTIES.includes(lr.status)) lastPos = lr.position;
    }

    return { pilot, startNet: entry.startNet, medalPts, medalSum, adjMedal, total, lastPos };
  });

  table.sort((a,b) => a.total - b.total || a.lastPos - b.lastPos);

  return { table, medalRaces, n, k, qualifierUntil };
}

function renderMedalSeriesTableHTML() {
  const data = computeMedalSeriesTable();
  if (!data) return '<div class="empty-state"><p>Error al calcular la Medal Series.</p></div>';

  const { table, medalRaces, n, k, qualifierUntil } = data;

  const raceHeaders = medalRaces.map((race, i) => {
    return `<th style="color:#C8880A">M${i+1}</th>`;
  }).join('');

  const rows = table.map((p, rank) => {
    const posLabel = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank+1}°`;
    const posClass = rank === 0 ? 'pos-1' : rank === 1 ? 'pos-2' : rank === 2 ? 'pos-3' : '';

    const cells = medalRaces.map(race => {
      const raceData = p.medalPts.find(pt => pt.race.id === race.id);
      if (!raceData) return `<td style="color:var(--text-light)">—</td>`;
      const st = raceData.status;
      let content;
      if (st === 'DNS') content = `<span class="cell-dns">DNS</span>`;
      else if (st === 'DNF') content = `<span class="cell-dnf">DNF</span>`;
      else if (st === 'OCS') content = `<span class="cell-ocs">OCS</span>`;
      else if (st === 'DSQ') content = `<span class="cell-dns">DSQ</span>`;
      else if (st === 'RET') content = `<span class="cell-dnf">RET</span>`;
      else content = raceData.position;
      return `<td>${content}</td>`;
    }).join('');

    const adjLabel = p.adjMedal ? (p.adjMedal>0?'+':'')+p.adjMedal : '—';

    return `<tr>
      <td><span class="pos-medal ${posClass}">${posLabel}</span></td>
      <td>${esc(p.pilot.name)}${p.pilot.sail_number ? ` <span class="badge badge-sea" style="font-size:10px">${esc(p.pilot.sail_number)}</span>` : ''}</td>
      <td style="font-weight:600;color:#B07000">${p.startNet}</td>
      ${cells}
      <td style="text-align:center;font-size:12px;color:${(p.adjMedal||0)>0?'#991B1B':(p.adjMedal||0)<0?'#166534':'var(--text-light)'}">${adjLabel}</td>
      <td class="pts-net">${p.total}</td>
    </tr>`;
  }).join('');

  return `
    <div style="background:#FEF9EC;border-radius:var(--radius);padding:.6rem 1rem;margin-bottom:1rem;font-size:13px;color:#92400E">
      <strong>Medal Series</strong> — Clasificación congelada hasta la regata ${qualifierUntil} · ${k} regata(s) medal · ${n} participantes.
      La columna <strong>INI</strong> es el puntaje de arranque ajustado.
    </div>
    <div class="results-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Participante</th>
            <th style="color:#B07000">INI</th>
            ${raceHeaders}
            <th style="color:#B07A17">ADJ</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="table-legend">
      <strong style="color:#B07000">INI</strong> puntaje inicial (carry-over) ·
      <strong style="color:#C8880A">M1, M2...</strong> regatas medal ·
      <strong>ADJ</strong> ajustes medal series ·
      Los empates se definen por la última regata medal.
    </div>`;
}
