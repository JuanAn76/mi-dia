'use strict';
/* ============================================================
   Mi Día — formularios, eventos y arranque
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function render() {
  const gate = Cloud.enabled && !Cloud.user;            // con Firebase activo, primero hay que entrar
  document.body.classList.toggle('gate', gate);
  if (gate) {
    if ($('#f-auth') && !Cloud.loading && !Cloud.failed) return;   // no borrar lo que se está escribiendo
    $('#view').innerHTML = viewGate();
    return;
  }
  $('#view').innerHTML = VIEWS[ui.tab]();
  $('#tabs').innerHTML = renderTabs();
  const labels = { hoy: 'Añadir', tareas: 'Nueva tarea', habitos: 'Nuevo hábito', biblioteca: 'Añadir a la biblioteca', resumen: 'Añadir' };
  $('#fab').setAttribute('aria-label', labels[ui.tab]);
}

/* ---------- avisos breves ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- hoja (formulario deslizante) ---------- */
let lastFocus = null;
function openSheet({ title, body, formId, saveLabel = 'Guardar', cancelLabel = 'Cancelar', rightAction }) {
  if (!$('#sheet-root').innerHTML) lastFocus = document.activeElement;
  const right = formId ? `<button class="sheet-btn strong" type="submit" form="${formId}">${saveLabel}</button>`
    : rightAction ? `<button class="sheet-btn strong" data-action="${rightAction.action}" data-id="${rightAction.id || ''}">${rightAction.label}</button>`
    : '<span class="sheet-btn"></span>';
  $('#sheet-root').innerHTML = `
    <div class="backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head">
        <button class="sheet-btn" data-action="close-sheet">${cancelLabel}</button>
        <h3>${esc(title)}</h3>${right}
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.classList.add('sheet-open');
  const auto = $('#sheet-root [data-autofocus]');
  if (auto) auto.focus(); else $('#sheet-root .sheet').setAttribute('tabindex', '-1'), $('#sheet-root .sheet').focus();
}
function closeSheet() {
  $('#sheet-root').innerHTML = '';
  document.body.classList.remove('sheet-open');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}

/* ---------- piezas de formulario ---------- */
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
const options = (list, cur) => list.map(o => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
const areaPicker = cur => `<fieldset class="pick"><legend>Área</legend>${AREAS.map(a =>
  `<label class="pick-item" style="--c:${a.color}"><input type="radio" name="area" value="${a.id}" ${cur === a.id ? 'checked' : ''}><span>${a.icon} ${a.short}</span></label>`).join('')}</fieldset>`;
const deleteBtn = (action, id, label) => `<button type="button" class="btn danger full" data-action="${action}" data-id="${id}">${label}</button>`;
const subRow = (s = {}) => `<div class="sub" data-id="${s.id || ''}">
  <input type="checkbox" ${s.done ? 'checked' : ''} aria-label="Hecha">
  <input type="text" value="${esc(s.title || '')}" placeholder="Subtarea" aria-label="Subtarea">
  <button type="button" class="x" data-action="sub-del" aria-label="Quitar subtarea">✕</button></div>`;

/* ---------- tarea ---------- */
function taskSheet(id, preset = {}) {
  const t = id ? getTask(id) : Object.assign({
    title: '', area: ui.lastArea || 'casa', projectId: '', due: '', time: '', remind: 'none',
    priority: 'media', repeat: { type: 'none', every: 1 }, subtasks: [], notes: '',
  }, preset);
  const body = `<form id="f-task" data-id="${id || ''}" autocomplete="off">
    <input class="title-input" name="title" value="${esc(t.title)}" placeholder="¿Qué hay que hacer?" required ${id ? '' : 'data-autofocus'} aria-label="Título">
    ${areaPicker(t.area)}
    <div class="group">
      ${field('Proyecto', `<select name="projectId"><option value="">Ninguno</option>${state.projects.map(p => `<option value="${p.id}" data-area="${p.area}" ${p.id === t.projectId ? 'selected' : ''}>${area(p.area).icon} ${esc(p.name)}</option>`).join('')}</select>`)}
      ${field('Fecha', `<input type="date" name="due" value="${t.due || ''}">`)}
      ${field('Hora', `<input type="time" name="time" value="${t.time || ''}">`)}
      ${field('Aviso 🔔', `<select name="remind">${options(REMIND, t.remind || 'none')}</select>`)}
    </div>
    <div class="group">
      ${field('Prioridad', `<select name="priority">${options([{ id: 'alta', name: 'Alta' }, { id: 'media', name: 'Media' }, { id: 'baja', name: 'Baja' }], t.priority)}</select>`)}
      ${field('Repetir', `<select name="repeat">${options(REPEAT, t.repeat.type)}</select>`)}
      ${field('Cada cuántos', `<input type="number" name="every" min="1" max="99" inputmode="numeric" value="${t.repeat.every || 1}">`, `every ${t.repeat.type === 'none' ? 'hidden' : ''}`)}
    </div>
    <div class="group pad">
      <span class="group-title">Subtareas</span>
      <div id="subs">${(t.subtasks || []).map(subRow).join('')}</div>
      <button type="button" class="link" data-action="sub-add">+ Añadir subtarea</button>
    </div>
    <div class="group">${field('Notas', `<textarea name="notes" rows="3" placeholder="Detalles, enlaces…">${esc(t.notes || '')}</textarea>`, 'stack')}</div>
    ${id ? deleteBtn('delete-task', id, 'Eliminar tarea') : ''}
  </form>`;
  openSheet({ title: id ? 'Editar tarea' : 'Nueva tarea', body, formId: 'f-task' });
}

function saveTask(form) {
  const f = new FormData(form);
  const data = {
    id: form.dataset.id, title: f.get('title').trim(), area: f.get('area') || 'casa', projectId: f.get('projectId'),
    due: f.get('due'), time: f.get('time'), remind: f.get('remind'), priority: f.get('priority'),
    repeat: { type: f.get('repeat'), every: Math.max(1, parseInt(f.get('every'), 10) || 1) },
    subtasks: $$('.sub', form).map(r => ({ id: r.dataset.id || uid(), title: $('input[type=text]', r).value.trim(), done: $('input[type=checkbox]', r).checked })).filter(s => s.title),
    notes: f.get('notes').trim(),
  };
  if (!data.title) return;
  if (data.remind !== 'none') {              // un aviso necesita fecha y hora
    if (!data.due) data.due = today();
    if (!data.time) data.time = '09:00';
  }
  if (data.repeat.type !== 'none' && !data.due) data.due = today();
  ui.lastArea = data.area;
  upsertTask(data);
  closeSheet(); render();
}

/* ---------- proyecto ---------- */
function projectSheet(id) {
  const p = id ? getProject(id) : { name: '', area: ui.taskArea !== 'all' ? ui.taskArea : (ui.lastArea || 'casa') };
  const body = `<form id="f-project" data-id="${id || ''}" autocomplete="off">
    <input class="title-input" name="name" value="${esc(p.name)}" placeholder="Nombre del proyecto" required ${id ? '' : 'data-autofocus'} aria-label="Nombre">
    ${areaPicker(p.area)}
    ${id ? deleteBtn('delete-project', id, 'Eliminar proyecto (las tareas se conservan)') : ''}
  </form>`;
  openSheet({ title: id ? 'Editar proyecto' : 'Nuevo proyecto', body, formId: 'f-project' });
}

/* ---------- hábito ---------- */
const HABIT_ICONS = ['📖', '🎙️', '🤖', '🏃', '🧘', '💧', '🛏️', '✍️', '🎸', '🥗', '🚭', '🌍'];
function habitSheet(id) {
  const h = id ? getHabit(id) : { name: '', icon: '📖', area: 'hobbies', days: [0, 1, 2, 3, 4, 5, 6], autoTypes: [] };
  const custom = HABIT_ICONS.includes(h.icon) ? '' : h.icon;
  const body = `<form id="f-habit" data-id="${id || ''}" autocomplete="off">
    <input class="title-input" name="name" value="${esc(h.name)}" placeholder="Ej. Leer 20 minutos" required ${id ? '' : 'data-autofocus'} aria-label="Nombre del hábito">
    <fieldset class="pick icons"><legend>Icono</legend>${HABIT_ICONS.map(i =>
      `<label class="pick-item"><input type="radio" name="icon" value="${i}" ${h.icon === i ? 'checked' : ''}><span>${i}</span></label>`).join('')}
      <input class="icon-custom" name="iconCustom" value="${esc(custom)}" maxlength="4" placeholder="Otro" aria-label="Otro icono (emoji)">
    </fieldset>
    ${areaPicker(h.area)}
    <fieldset class="pick days"><legend>Días que toca</legend>${WEEKDAYS.map(w =>
      `<label class="pick-item"><input type="checkbox" name="days" value="${w.n}" ${h.days.includes(w.n) ? 'checked' : ''}><span>${w.l}</span></label>`).join('')}</fieldset>
    <fieldset class="pick"><legend>⚡ Marcar solo al apuntar avance en…</legend>${LIB_TYPES.filter(t => t.unit).map(t =>
      `<label class="pick-item"><input type="checkbox" name="autoTypes" value="${t.id}" ${(h.autoTypes || []).includes(t.id) ? 'checked' : ''}><span>${t.icon} ${t.plural}</span></label>`).join('')}</fieldset>
    ${id ? deleteBtn('delete-habit', id, 'Eliminar hábito y su historial') : ''}
  </form>`;
  openSheet({ title: id ? 'Editar hábito' : 'Nuevo hábito', body, formId: 'f-habit' });
}

function habitDetail(id) {
  const h = getHabit(id);
  const st = habitStreak(h);
  const total = Object.values(state.habitLog).filter(l => l.includes(id)).length;
  const body = `<div class="detail-head"><div class="big-ico">${h.icon}</div><h2>${esc(h.name)}</h2>
      <p class="muted">${area(h.area).icon} ${area(h.area).name}${(h.autoTypes || []).length ? ' · ⚡ ' + h.autoTypes.map(x => libType(x).plural).join(', ') : ''}</p></div>
    <div class="tiles three">
      <div class="card tile"><b>${st ? '🔥 ' + st : '—'}</b><span>racha actual</span></div>
      <div class="card tile"><b>${habitRate(h, 30)}%</b><span>últimos 30 días</span></div>
      <div class="card tile"><b>${total}</b><span>veces en total</span></div>
    </div>
    <div class="card pad"><span class="group-title">Últimas 16 semanas</span>${heatmap(h)}
      <p class="muted legend"><i class="lg on" style="--c:${area(h.area).color}"></i> hecho <i class="lg miss"></i> tocaba y no se hizo</p></div>`;
  openSheet({ title: 'Hábito', body, cancelLabel: 'Cerrar', rightAction: { action: 'edit-habit', id, label: 'Editar' } });
}

/* ---------- biblioteca ---------- */
function libSheet(id) {
  const it = id ? getItem(id) : {
    title: '', type: ui.libType !== 'all' ? ui.libType : 'libro', creator: '',
    status: ui.libStatus !== 'all' ? ui.libStatus : 'want', progress: 0, total: 0, rating: 0, url: '', notes: '',
  };
  const unit = libType(it.type).unit;
  const body = `<form id="f-lib" data-id="${id || ''}" autocomplete="off">
    <input class="title-input" name="title" value="${esc(it.title)}" placeholder="Título" required ${id ? '' : 'data-autofocus'} aria-label="Título">
    <div class="cover-pick">
      <div id="cover-preview">${cover(it, 'big')}</div>
      <div class="cover-actions">
        <label class="btn ghost small">📷 Elegir mi foto…<input type="file" id="cover-file" accept="image/*" hidden></label>
        <button type="button" class="btn ghost small" data-action="cover-auto">🔍 Buscar automática</button>
      </div>
      <input type="hidden" name="coverMode" value="keep"><input type="hidden" name="coverData" value="">
    </div>
    <div class="group">
      ${field('Tipo', `<select name="type">${LIB_TYPES.map(t => `<option value="${t.id}" data-unit="${t.unit || ''}" ${t.id === it.type ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}</select>`)}
      ${field('Autor / creador', `<input name="creator" value="${esc(it.creator || '')}" placeholder="Opcional">`)}
      ${field('Estado', `<select name="status">${options(LIB_STATUS, it.status)}</select>`)}
    </div>
    <div class="group" id="progress-group" ${unit ? '' : 'hidden'}>
      ${field(`Llevo <em id="unit-label">(${unit || ''})</em>`, `<input type="number" name="progress" min="0" inputmode="numeric" value="${it.progress || 0}">`)}
      ${field('De un total de', `<input type="number" name="total" min="0" inputmode="numeric" value="${it.total || ''}" placeholder="Opcional">`, `total ${unit === '%' ? 'hidden' : ''}`)}
    </div>
    <fieldset class="pick rating"><legend>Valoración</legend>
      ${[0, 1, 2, 3, 4, 5].map(n => `<label class="pick-item"><input type="radio" name="rating" value="${n}" ${(it.rating || 0) === n ? 'checked' : ''}><span>${n ? n + ' ★' : 'Sin valorar'}</span></label>`).join('')}
    </fieldset>
    <div class="group">
      ${field('Enlace', `<input type="url" name="url" value="${esc(it.url || '')}" placeholder="https://… (YouTube, artículo…)">`)}
      ${field('Notas e ideas clave', `<textarea name="notes" rows="4" placeholder="Citas, ideas, por qué te lo recomendaron…">${esc(it.notes || '')}</textarea>`, 'stack')}
    </div>
    ${id && safeUrl(it.url) ? `<a class="btn ghost full" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">Abrir enlace ↗</a>` : ''}
    ${id ? deleteBtn('delete-lib', id, 'Eliminar de la biblioteca') : ''}
  </form>`;
  openSheet({ title: id ? 'Editar' : 'Añadir a la biblioteca', body, formId: 'f-lib' });
}

function saveLib(form) {
  const f = new FormData(form);
  const id = form.dataset.id, prev = id ? Object.assign({}, getItem(id)) : null;
  const unit = libType(f.get('type')).unit;
  const data = {
    id, title: f.get('title').trim(), type: f.get('type'), creator: f.get('creator').trim(), status: f.get('status'),
    progress: unit ? Math.max(0, parseInt(f.get('progress'), 10) || 0) : 0,
    total: unit && unit !== '%' ? Math.max(0, parseInt(f.get('total'), 10) || 0) : 0,
    rating: parseInt(f.get('rating'), 10) || 0, url: f.get('url').trim(), notes: f.get('notes').trim(),
  };
  if (!data.title) return;
  const coverMode = f.get('coverMode');
  if (coverMode === 'custom') { data.cover = f.get('coverData'); data.coverCustom = true; }            // foto elegida por ti
  else if (coverMode === 'auto') { data.cover = undefined; data.coverCustom = false; }                  // volver a buscarla
  else if (!(prev && prev.coverCustom) && (!prev || prev.title !== data.title || prev.type !== data.type || prev.url !== data.url)) data.cover = undefined; // cambió el título: buscar de nuevo
  const it = upsertItem(data);
  if (prev && data.progress > (prev.progress || 0) && it.status === 'doing') notifyMarked(setProgress(it.id, data.progress));
  closeSheet(); render();
  fetchMissingCovers(render);
}

/* Reduce la foto elegida (máx. 400 px) para que ocupe poco y se sincronice rápido */
function resizeImage(file, max = 400) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('imagen no válida')); };
    img.src = url;
  });
}

function setCoverChoice(mode, dataUrl) {
  const form = $('#f-lib');
  form.coverMode.value = mode;
  form.coverData.value = dataUrl || '';
  const wide = ['youtube', 'podcast'].includes(form.type.value) ? 'wide' : '';
  $('#cover-preview').innerHTML = dataUrl
    ? `<div class="cover big ${wide}"><img src="${dataUrl}" alt="Foto elegida"></div>`
    : `<div class="cover big ${wide}"><span>${libType(form.type.value).icon}</span></div><p class="muted center">Se buscará una portada al guardar</p>`;
}

function progressSheet(id) {
  const it = getItem(id), tp = libType(it.type);
  const body = `<form id="f-progress" data-id="${id}" autocomplete="off">
    <div class="detail-head">${cover(it, 'big')}<h2>${esc(it.title)}</h2><p class="muted">Ahora: ${itemProgressLabel(it)}</p></div>
    <div class="group">${field(`Llevo (${tp.unit})`, `<input type="number" name="progress" min="0" inputmode="numeric" value="${it.progress || 0}" data-autofocus>`)}</div>
    <div class="quick">
      ${(tp.steps || [1]).map(s => `<button type="button" class="btn ghost" data-action="progress-step" data-step="${s}">+${s}</button>`).join('')}
      <button type="button" class="btn ghost" data-action="progress-finish" data-id="${id}">✓ Terminado</button>
    </div>
  </form>`;
  openSheet({ title: 'Apuntar avance', body, formId: 'f-progress' });
}

function notifyMarked(marked) {
  if (marked && marked.length) toast(`⚡ Hábito marcado: ${marked.map(h => h.name).join(', ')}`);
}

/* ---------- selector rápido y ajustes ---------- */
function chooserSheet() {
  const body = `<div class="chooser">
    <button class="card choice" data-action="new-task"><span>✅</span><b>Tarea</b><small>Algo que hacer</small></button>
    <button class="card choice" data-action="new-lib"><span>📚</span><b>Biblioteca</b><small>Libro, podcast, serie…</small></button>
    <button class="card choice" data-action="new-habit"><span>🔥</span><b>Hábito</b><small>Algo que repetir</small></button>
    <button class="card choice" data-action="new-project"><span>📁</span><b>Proyecto</b><small>Agrupar tareas</small></button>
  </div>`;
  openSheet({ title: 'Añadir', body });
}

function settingsSheet() {
  const cloud = Cloud.enabled && Cloud.user;
  const body = `<div class="group pad"><span class="group-title">${cloud ? 'Tu cuenta' : 'Tus datos'}</span>
      <p class="muted">${cloud
        ? `Sesión iniciada como <b>${esc(Cloud.user.email)}</b>. Tus datos se sincronizan entre todos los dispositivos donde entres con esta cuenta, y también se guardan sin conexión.`
        : 'Ahora mismo todo se guarda <b>solo en este dispositivo</b>. La sincronización se activa al conectar la app con Firebase.'}</p></div>
    <div class="group pad"><span class="group-title">Diagnóstico</span><div id="diag" class="stat-rows"><p class="muted">Comprobando…</p></div></div>
    <button class="btn ghost full" data-action="export">Descargar copia de seguridad</button>
    <label class="btn ghost full">Restaurar una copia…<input type="file" id="import-file" accept="application/json,.json" hidden></label>
    ${hasDemo()
      ? '<button class="btn ghost full" data-action="remove-demo">Borrar solo los datos de ejemplo</button>'
      : '<button class="btn ghost full" data-action="load-demo">Cargar datos de ejemplo</button>'}
    ${cloud ? '<button class="btn ghost full" data-action="logout">Cerrar sesión</button>' : ''}
    <button class="btn danger full" data-action="reset">Borrar todo y empezar de cero</button>`;
  openSheet({ title: 'Ajustes', body, cancelLabel: 'Cerrar' });
  runDiagnostics();
}

/* Compara lo que hay en este dispositivo con lo que hay de verdad en la nube */
const APP_VERSION = 'v6 · 15 nov';
async function runDiagnostics() {
  const show = (rows, verdict) => {
    const el = $('#diag');
    if (el) el.innerHTML = rows.map(([k, v]) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`).join('') + (verdict ? `<p class="diag-verdict">${verdict}</p>` : '');
  };
  const summary = (t, h, l) => `${t} tareas · ${h} hábitos · ${l} biblioteca`;
  const rows = [['Versión', APP_VERSION]];
  if (!(Cloud.enabled && Cloud.user)) {
    show(rows.concat([['Modo', 'Solo este dispositivo'], ['Aquí', summary(state.tasks.length, state.habits.length, state.library.length)]]));
    return;
  }
  rows.push(['Cuenta', esc(Cloud.user.email)], ['Código de cuenta', Cloud.user.uid.slice(-4)],
    ['En este dispositivo', summary(state.tasks.length, state.habits.length, state.library.length)]);
  show(rows.concat([['En la nube', 'comprobando…']]));
  const root = Cloud.db.collection('users').doc(Cloud.user.uid);
  const limit = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('tiempo agotado')), ms))]);
  try {
    const n = {};
    for (const c of ['tasks', 'habits', 'library']) n[c] = (await limit(root.collection(c).get({ source: 'server' }), 8000)).size;
    let pending = 0;
    for (const c of CLOUD_COLS.concat('habitLog')) pending += (await root.collection(c).get({ source: 'cache' })).docs.filter(d => d.metadata.hasPendingWrites).length;
    const same = n.tasks === state.tasks.length && n.habits === state.habits.length && n.library === state.library.length;
    show(rows.concat([['En la nube', summary(n.tasks, n.habits, n.library)], ['Cambios sin subir', pending]]),
      pending ? '⚠️ Este dispositivo tiene cambios que aún no han llegado a la nube.'
        : same ? '✅ Todo sincronizado.' : '⚠️ Lo que se ve aquí no coincide con la nube.');
  } catch (e) {
    show(rows.concat([['En la nube', 'sin respuesta']]), '⚠️ Este dispositivo no consigue conectar con la nube. Lo que ves es la copia guardada aquí.');
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mi-dia-copia-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Las acciones destructivas piden un segundo toque para confirmar */
function confirmed(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = '¿Seguro? Pulsa otra vez para confirmar';
  setTimeout(() => { if (document.contains(btn)) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 4000);
  return false;
}

/* ---------- acciones ---------- */
const ACTIONS = {
  nav: el => { ui.tab = el.dataset.tab; ui.projectId = null; render(); window.scrollTo(0, 0); },
  settings: settingsSheet,
  'close-sheet': closeSheet,

  add: () => {
    if (ui.tab === 'tareas') ACTIONS['new-task']();
    else if (ui.tab === 'habitos') habitSheet();
    else if (ui.tab === 'biblioteca') libSheet();
    else chooserSheet();
  },
  'new-task': () => {
    const p = ui.tab === 'tareas' && ui.projectId ? getProject(ui.projectId) : null;
    const preset = p ? { projectId: p.id, area: p.area } : {};
    if (!p && ui.tab === 'tareas' && ui.taskArea !== 'all') preset.area = ui.taskArea;
    if (ui.tab === 'hoy') preset.due = today();
    taskSheet(null, preset);
  },
  'new-lib': () => libSheet(),
  'new-habit': () => habitSheet(),
  'new-project': () => projectSheet(),

  'toggle-task': el => { toggleTask(el.dataset.id); render(); },
  'open-task': el => taskSheet(el.dataset.id),
  'delete-task': el => { if (confirmed(el)) { deleteTask(el.dataset.id); closeSheet(); render(); } },
  'task-area': el => { ui.taskArea = el.dataset.area; render(); },
  'task-view': el => { ui.taskView = el.dataset.view; render(); },
  'sub-add': () => { $('#subs').insertAdjacentHTML('beforeend', subRow()); $('#subs .sub:last-child input[type=text]').focus(); },
  'sub-del': el => el.closest('.sub').remove(),

  'open-project': el => { ui.projectId = el.dataset.id; render(); window.scrollTo(0, 0); },
  'back-projects': () => { ui.projectId = null; ui.taskView = 'projects'; render(); },
  'edit-project': el => projectSheet(el.dataset.id),
  'delete-project': el => { if (confirmed(el)) { deleteProject(el.dataset.id); ui.projectId = null; closeSheet(); render(); } },

  'toggle-habit': el => { toggleHabit(el.dataset.id, el.dataset.date); render(); },
  'open-habit': el => habitDetail(el.dataset.id),
  'edit-habit': el => habitSheet(el.dataset.id),
  'delete-habit': el => { if (confirmed(el)) { deleteHabit(el.dataset.id); closeSheet(); render(); } },

  'lib-type': el => { ui.libType = el.dataset.type; render(); },
  'lib-status': el => { ui.libStatus = el.dataset.view; render(); },
  'open-lib': el => libSheet(el.dataset.id),
  'delete-lib': el => { if (confirmed(el)) { deleteItem(el.dataset.id); closeSheet(); render(); } },
  'lib-progress': el => progressSheet(el.dataset.id),
  'cover-auto': () => setCoverChoice('auto', ''),
  'habit-range': el => { ui.habitRange = el.dataset.view; try { localStorage.setItem('midia.habitRange', ui.habitRange); } catch (e) { /* sin almacenamiento */ } render(); },
  'progress-step': el => { const inp = $('#f-progress [name=progress]'); inp.value = (parseInt(inp.value, 10) || 0) + Number(el.dataset.step); },
  'progress-finish': el => {
    const it = getItem(el.dataset.id), unit = libType(it.type).unit;
    const marked = setProgress(it.id, unit === '%' ? 100 : (it.total || (it.progress || 0) + 1));
    const cur = getItem(it.id); cur.status = 'done'; cur.finishedAt = today(); saveState();
    closeSheet(); render(); toast(`🎉 Terminado: ${it.title}`);
    if (marked.length) setTimeout(() => notifyMarked(marked), 2700);
  },

  logout: () => { closeSheet(); cloudLogout(); },
  forgot: authForgot,
  reload: () => location.reload(),
  export: exportData,
  'load-demo': () => { addDemoData(); closeSheet(); render(); fetchMissingCovers(render); toast('Ejemplos añadidos'); },
  'remove-demo': el => { if (confirmed(el)) { removeDemoData(); closeSheet(); render(); toast('Ejemplos borrados'); } },
  reset: el => { if (confirmed(el)) { state = emptyState(); saveState(); closeSheet(); ui.projectId = null; render(); toast('Listo: la app está vacía'); } },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.classList.contains('backdrop') && e.target !== el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el, e);
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target, f = new FormData(form);
  if (form.id === 'f-auth') authSubmit(form, e.submitter);
  else if (form.id === 'f-task') saveTask(form);
  else if (form.id === 'f-lib') saveLib(form);
  else if (form.id === 'f-project') {
    const name = f.get('name').trim();
    if (!name) return;
    upsertProject({ id: form.dataset.id, name, area: f.get('area') || 'casa' });
    closeSheet(); render();
  } else if (form.id === 'f-habit') {
    const name = f.get('name').trim();
    if (!name) return;
    const days = f.getAll('days').map(Number);
    upsertHabit({
      id: form.dataset.id, name, icon: f.get('iconCustom').trim() || f.get('icon') || '⭐', area: f.get('area') || 'personal',
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6], autoTypes: f.getAll('autoTypes'),
    });
    closeSheet(); render();
  } else if (form.id === 'f-progress') {
    const marked = setProgress(form.dataset.id, parseInt(f.get('progress'), 10) || 0);
    const it = getItem(form.dataset.id);
    closeSheet(); render();
    if (it.status === 'done') { toast(`🎉 Terminado: ${it.title}`); if (marked.length) setTimeout(() => notifyMarked(marked), 2700); }
    else notifyMarked(marked);
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.name === 'repeat') $('.field.every').classList.toggle('hidden', el.value === 'none');
  if (el.name === 'projectId' && el.value) {                 // al elegir proyecto, se propone su área
    const a = el.selectedOptions[0].dataset.area;
    const r = $(`#f-task input[name=area][value="${a}"]`);
    if (r) r.checked = true;
  }
  if (el.name === 'type' && el.form && el.form.id === 'f-lib') {
    const unit = el.selectedOptions[0].dataset.unit;
    $('#progress-group').hidden = !unit;
    $('#unit-label').textContent = `(${unit})`;
    $('.field.total').classList.toggle('hidden', unit === '%');
  }
  if (el.id === 'cover-file' && el.files[0]) {
    resizeImage(el.files[0]).then(url => setCoverChoice('custom', url)).catch(() => toast('No se pudo leer esa imagen. Prueba con un JPG o PNG.'));
  }
  if (el.id === 'import-file' && el.files[0]) {
    el.files[0].text().then(txt => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.library)) throw new Error('formato');
      state = Object.assign(emptyState(), data);
      state.meta = { demo: false };
      saveState(); closeSheet(); render(); toast('Copia restaurada');
    }).catch(() => toast('Ese archivo no es una copia válida de Mi Día'));
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheet-root').innerHTML) closeSheet();
});

/* ---------- arranque ---------- */
if (Cloud.enabled) {
  state = emptyState();
  render();                       // muestra "Cargando…" hasta saber si hay sesión
  cloudInit();
  window.addEventListener('offline', () => toast('Sin conexión: los cambios se guardan y se subirán después'));
  window.addEventListener('online', () => toast('Conexión recuperada'));
} else {
  state = loadState();
  if (!state) { state = demoState(); saveState(); }
  render();
  fetchMissingCovers(render);
}

/* Permite instalarla y abrirla sin conexión (solo cuando está publicada o en localhost) */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* la app funciona igual sin él */ });
}
