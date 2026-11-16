'use strict';
/* ============================================================
   Mi Día — pantallas (solo generan HTML a partir del estado)
   ============================================================ */

const ui = {
  tab: 'hoy',
  taskArea: 'all', taskView: 'pending', projectId: null,
  libType: 'all', libStatus: 'doing',
  habitRange: '7',          // '7' | '14' | 'month'
};
ui.habitMonthOff = 0;     // vista Mes: cuántos meses hacia atrás
try { const r = localStorage.getItem('midia.habitRange'); if (['7', '14', 'month', 'year'].includes(r)) ui.habitRange = r; } catch (e) { /* sin almacenamiento */ }

const TABS = [
  { id: 'hoy',        name: 'Hoy',        icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>' },
  { id: 'tareas',     name: 'Tareas',     icon: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>' },
  { id: 'habitos',    name: 'Hábitos',    icon: '<path d="M12 21c4 0 7-2.7 7-6.5 0-3-2-4.7-3-7-.6 1.6-1.4 2.4-2.5 3C13.5 7 12 4.5 9.5 3c.4 3-1 4.6-2.3 6.3C6 10.900 5 12.500 5 14.500 5 18.300 8 21 12 21z"/>' },
  { id: 'biblioteca', name: 'Biblioteca', icon: '<path d="M4 5.5A1.500 1.500 0 015.500 4H11v15H5.500A1.500 1.500 0 004 20.500v-15zM20 5.500A1.500 1.500 0 0018.500 4H13v15h5.500a1.500 1.500 0 011.500 1.500v-15z"/>' },
  { id: 'resumen',    name: 'Resumen',    icon: '<path d="M5 20v-7M12 20V5M19 20v-10"/>' },
];

const svg = (inner, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const GEAR = svg('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.300l2-1.500-2-3.400-2.300 1a7 7 0 00-2.300-1.300L14 3h-4l-.300 2.500a7 7 0 00-2.300 1.300l-2.300-1-2 3.400 2 1.500a7 7 0 000 2.600l-2 1.500 2 3.400 2.300-1a7 7 0 002.300 1.300L10 21h4l.300-2.500a7 7 0 002.300-1.300l2.300 1 2-3.400-2-1.500c.1-.400.100-.900.100-1.300z"/>');

function renderTabs() {
  return TABS.map(t => `
    <button class="tab ${ui.tab === t.id ? 'on' : ''}" data-action="nav" data-tab="${t.id}" ${ui.tab === t.id ? 'aria-current="page"' : ''}>
      ${svg(t.icon)}<span>${t.name}</span>
    </button>`).join('');
}

function header(title, sub, extra = '') {
  return `<header class="top">
    <div class="top-text"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    <div class="top-actions">${extra}<button class="icon-btn" data-action="settings" aria-label="Ajustes">${GEAR}</button></div>
  </header>`;
}

const section = (title, body, right = '') => `<section class="block"><div class="block-head"><h2>${title}</h2>${right}</div>${body}</section>`;
const empty = (icon, text) => `<div class="empty"><div class="empty-ico">${icon}</div><p>${text}</p></div>`;
const bar = (pct, color) => `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%;${color ? `background:${color}` : ''}"></i></div>`;

/* ---------- piezas ---------- */
function taskRow(t, opts = {}) {
  const a = area(t.area), done = t.status === 'done';
  const meta = [];
  if (t.due && !opts.hideDate) meta.push(`<span class="${!done && t.due < today() ? 'late' : ''}">${fmtDue(t.due)}${t.time ? ' · ' + t.time : ''}</span>`);
  else if (t.time) meta.push(`<span>${t.time}</span>`);
  if (!opts.hideArea) meta.push(`<span>${a.icon} ${a.short}</span>`);
  const p = t.projectId && getProject(t.projectId);
  if (p && !opts.hideProject) meta.push(`<span>📁 ${esc(p.name)}</span>`);
  if (t.subtasks && t.subtasks.length) meta.push(`<span>☑ ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>`);
  if (t.repeat && t.repeat.type !== 'none') meta.push('<span title="Se repite">↻</span>');
  if (t.remind && t.remind !== 'none') {
    let bell = '🔔';
    if (t.remind === 'custom' && t.remindAt) bell += ` ${fmtDue(t.remindAt.slice(0, 10))} ${t.remindAt.slice(11, 16)}`;
    if (t.remindEvery) bell += ` · cada ${t.remindEvery} min`;
    meta.push(`<span title="Con aviso">${bell}</span>`);
  }
  return `<li class="row task ${done ? 'done' : ''}">
    <button class="check ${done ? 'on' : ''}" style="--c:${a.color}" data-action="toggle-task" data-id="${t.id}" aria-label="${done ? 'Marcar como pendiente' : 'Completar'}: ${esc(t.title)}"></button>
    <button class="row-main" data-action="open-task" data-id="${t.id}">
      <span class="row-title">${t.priority === 'alta' && !done ? '<b class="prio">!</b> ' : ''}${esc(t.title)}</span>
      <span class="row-meta">${meta.join('')}</span>
    </button>
  </li>`;
}
const taskList = (ts, opts) => `<ul class="card list">${ts.map(t => taskRow(t, opts)).join('')}</ul>`;

function cover(it, cls = '') {
  const tp = libType(it.type);
  return `<div class="cover ${cls} ${it.type === 'youtube' || it.type === 'podcast' ? 'wide' : ''}">${it.cover ? `<img src="${esc(it.cover)}" alt="" loading="lazy">` : `<span>${tp.icon}</span>`}</div>`;
}

const stars = n => n ? `<span class="stars" aria-label="${n} de 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '';

function libRow(it) {
  const tp = libType(it.type), pct = itemPct(it);
  const st = LIB_STATUS.find(s => s.id === it.status);
  return `<li class="row lib">
    <button class="row-main lib-main" data-action="open-lib" data-id="${it.id}">
      ${cover(it)}
      <span class="lib-text">
        <span class="row-title">${esc(it.title)}</span>
        <span class="row-meta"><span>${tp.icon} ${tp.name}</span>${it.creator ? `<span>${esc(it.creator)}</span>` : ''}</span>
        ${it.status === 'doing' && pct !== null ? `${bar(pct)}<span class="row-meta"><span>${itemProgressLabel(it)}</span></span>`
          : it.status === 'doing' && tp.unit ? `<span class="row-meta"><span>${itemProgressLabel(it)}</span></span>`
          : `<span class="row-meta"><span class="pill s-${it.status}">${st.name}</span>${stars(it.rating)}</span>`}
      </span>
    </button>
    ${it.status === 'doing' && tp.unit ? `<button class="mini-btn" data-action="lib-progress" data-id="${it.id}" aria-label="Apuntar avance en ${esc(it.title)}">+</button>` : ''}
  </li>`;
}

/* ---------- HOY ---------- */
function viewHoy() {
  const t = today();
  const open = state.tasks.filter(x => x.status !== 'done');
  const late = sortTasks(open.filter(x => x.due && x.due < t));
  const todays = sortTasks(state.tasks.filter(x => x.due === t && (x.status !== 'done' || x.doneAt === t)));
  const habits = activeHabits().filter(h => habitDue(h, t));
  const doing = state.library.filter(i => i.status === 'doing');
  const doneToday = todays.filter(x => x.status === 'done').length + habits.filter(h => habitDone(h.id, t)).length;
  const totalToday = todays.length + habits.length;
  const dateStr = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  let h = header('Hoy', dateStr.charAt(0).toUpperCase() + dateStr.slice(1));
  if (hasDemo()) h += `<div class="banner"><span>Hay <b>datos de ejemplo</b> para que veas cómo rellenar la app.</span><button class="link" data-action="remove-demo">Borrar los ejemplos</button></div>`;

  if (totalToday) {
    const pct = Math.round(doneToday / totalToday * 100);
    h += `<div class="card day-progress"><div class="ring" style="--p:${pct}"><b>${pct}%</b></div>
      <div><strong>${doneToday} de ${totalToday} hechas hoy</strong><p class="muted">${late.length ? `${late.length} atrasada${late.length > 1 ? 's' : ''} por revisar` : pct === 100 ? 'Día completo. ¡Bien hecho!' : 'Vas al día'}</p></div></div>`;
  }

  if (late.length) h += section('Atrasadas', taskList(late), `<span class="count late">${late.length}</span>`);
  h += section('Tareas de hoy', todays.length ? taskList(todays, { hideDate: true }) : empty('☀️', 'No hay tareas para hoy. Pulsa + para apuntar una.'));

  if (habits.length) {
    h += section('Hábitos', `<div class="habit-grid">${habits.map(hb => {
      const on = habitDone(hb.id, t), st = habitStreak(hb);
      return `<button class="habit-chip ${on ? 'on' : ''}" style="--c:${area(hb.area).color}" data-action="toggle-habit" data-id="${hb.id}" data-date="${t}" aria-pressed="${on}">
        <span class="habit-ico">${hb.icon}</span>
        <span class="habit-name">${esc(hb.name)}</span>
        <span class="habit-streak">${st ? `🔥 ${st}` : '—'}</span>
      </button>`;
    }).join('')}</div>`);
  }

  if (doing.length) h += section('En curso', `<ul class="card list">${doing.map(libRow).join('')}</ul>`);
  return h;
}

/* ---------- TAREAS ---------- */
function areaChips(current, action) {
  return `<div class="chips" role="tablist">
    <button class="chip ${current === 'all' ? 'on' : ''}" data-action="${action}" data-area="all">Todas</button>
    ${AREAS.map(a => `<button class="chip ${current === a.id ? 'on' : ''}" style="--c:${a.color}" data-action="${action}" data-area="${a.id}">${a.icon} ${a.short}</button>`).join('')}
  </div>`;
}

const segmented = (items, current, action) => `<div class="seg">${items.map(([id, name]) =>
  `<button class="${current === id ? 'on' : ''}" data-action="${action}" data-view="${id}">${name}</button>`).join('')}</div>`;

function viewTareas() {
  if (ui.projectId && getProject(ui.projectId)) return viewProject(getProject(ui.projectId));
  ui.projectId = null;
  const inArea = x => ui.taskArea === 'all' || x.area === ui.taskArea;
  const t = today();
  let h = header('Tareas', `${state.tasks.filter(x => x.status !== 'done').length} pendientes`);
  h += areaChips(ui.taskArea, 'task-area');
  h += segmented([['pending', 'Pendientes'], ['projects', 'Proyectos'], ['done', 'Hechas']], ui.taskView, 'task-view');

  if (ui.taskView === 'pending') {
    const open = sortTasks(state.tasks.filter(x => x.status !== 'done' && inArea(x)));
    const groups = [
      ['Atrasadas', open.filter(x => x.due && x.due < t), 'late'],
      ['Hoy', open.filter(x => x.due === t)],
      ['Próximos 7 días', open.filter(x => x.due > t && x.due <= addDays(t, 7))],
      ['Más adelante', open.filter(x => x.due > addDays(t, 7))],
      ['Sin fecha', open.filter(x => !x.due)],
    ].filter(g => g[1].length);
    h += groups.length
      ? groups.map(([name, ts, cls]) => section(name, taskList(ts, { hideArea: ui.taskArea !== 'all' }), `<span class="count ${cls || ''}">${ts.length}</span>`)).join('')
      : empty('✅', 'No hay tareas pendientes aquí.');
  } else if (ui.taskView === 'projects') {
    const ps = state.projects.filter(inArea);
    h += `<div class="block">${ps.length ? `<ul class="card list">${ps.map(p => {
      const a = area(p.area), pr = projectProgress(p.id);
      return `<li class="row"><button class="row-main" data-action="open-project" data-id="${p.id}">
        <span class="row-title">${a.icon} ${esc(p.name)}</span>
        ${bar(pr.pct, a.color)}
        <span class="row-meta"><span>${pr.done} de ${pr.total} tareas</span><span>${pr.pct}%</span></span>
      </button><span class="chev">›</span></li>`;
    }).join('')}</ul>` : empty('📁', 'Agrupa tareas bajo un objetivo, por ejemplo «Reforma del baño».')}
      <button class="btn ghost full" data-action="new-project">+ Nuevo proyecto</button></div>`;
  } else {
    const done = state.tasks.filter(x => x.status === 'done' && inArea(x)).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 60);
    h += done.length ? `<div class="block">${taskList(done.map(x => Object.assign({}, x, { due: x.doneAt })), { hideArea: ui.taskArea !== 'all' })}</div>` : empty('🗂️', 'Aquí aparecerán las tareas que completes.');
  }
  return h;
}

function viewProject(p) {
  const a = area(p.area), pr = projectProgress(p.id);
  const ts = state.tasks.filter(x => x.projectId === p.id);
  const open = sortTasks(ts.filter(x => x.status !== 'done')), done = ts.filter(x => x.status === 'done');
  let h = `<button class="back" data-action="back-projects">‹ Proyectos</button>`;
  h += header(`${a.icon} ${esc(p.name)}`, `${pr.done} de ${pr.total} tareas · ${pr.pct}%`, `<button class="btn ghost small" data-action="edit-project" data-id="${p.id}">Editar</button>`);
  h += `<div class="block">${bar(pr.pct, a.color)}</div>`;
  h += section('Pendientes', open.length ? taskList(open, { hideProject: true, hideArea: true }) : empty('✅', 'Nada pendiente en este proyecto. Pulsa + para añadir una tarea.'));
  if (done.length) h += section('Hechas', taskList(done, { hideProject: true, hideArea: true }));
  return h;
}

/* ---------- HÁBITOS ---------- */
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* Primer día del mes visible en la vista Mes (0 = mes actual, 1 = el anterior…) */
const shownMonthStart = () => addMonths(today().slice(0, 7) + '-01', -(ui.habitMonthOff || 0));

/* Filas de 7 días (lunes a domingo en la vista de mes; null = hueco fuera del mes) */
function habitRows(range) {
  const t = today(), rows = [];
  if (range === 'month') {
    const first = shownMonthStart(), ym = first.slice(0, 7), d0 = parseDay(first);
    const last = ym + '-' + pad(new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate());
    for (let day = weekStart(first); day <= last;) {
      const row = [];
      for (let i = 0; i < 7; i++) { row.push(day.slice(0, 7) === ym ? day : null); day = addDays(day, 1); }
      rows.push(row);
    }
    return rows;
  }
  const weeks = range === '14' ? 2 : 1;
  for (let w = weeks - 1; w >= 0; w--) rows.push(Array.from({ length: 7 }, (_, i) => addDays(t, i - 6 - 7 * w)));
  return rows;
}

function habitCell(hb, d, calendar, firstInRow) {
  if (!d) return '<span class="dot gap"></span>';
  const t = today(), dt = parseDay(d), num = dt.getDate();
  const due = habitDue(hb, d), on = habitDone(hb.id, d), future = d > t;
  const cls = `dot ${on ? 'on' : ''} ${due ? '' : 'off'} ${d === t ? 'today' : ''} ${future ? 'future' : ''} ${calendar ? 'cal' : ''}`;
  const attrs = future ? 'disabled' : `data-action="toggle-habit" data-id="${hb.id}" data-date="${d}" aria-pressed="${on}"`;
  const label = `${esc(hb.name)}, ${dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  if (calendar) return `<button class="${cls}" ${attrs} aria-label="${label}"><i>${num}</i></button>`;
  const wl = WEEKDAYS.find(w => w.n === dt.getDay()).l;
  return `<button class="${cls}" ${attrs} aria-label="${label}">
    <small class="mo ${firstInRow || num === 1 ? '' : 'ghost'}">${MONTHS[dt.getMonth()]}</small><b>${num}</b><small>${wl}</small><i></i></button>`;
}

function viewHabitos() {
  const t = today();
  const range = ui.habitRange, calendar = range === 'month', year = range === 'year';
  const rows = calendar || range === '7' || range === '14' ? habitRows(range) : [];
  const active = activeHabits(), archived = state.habits.filter(x => x.archived);
  let h = header('Hábitos', active.length ? `${active.filter(x => habitDone(x.id, t)).length} de ${active.filter(x => habitDue(x, t)).length} hechos hoy` : '');
  if (!state.habits.length) return h + empty('🔥', 'Crea tu primer hábito con el botón +. Por ejemplo «Leer 20 minutos».');
  h += segmented([['7', '7 días'], ['14', '2 semanas'], ['month', 'Mes'], ['year', 'Año']], range, 'habit-range');

  if (calendar) {
    const name = parseDay(shownMonthStart()).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const off = ui.habitMonthOff || 0;
    h += `<div class="month-nav">
      <button class="icon-btn" data-action="habit-month" data-step="1" aria-label="Mes anterior">‹</button>
      <h2>${name.charAt(0).toUpperCase() + name.slice(1)}</h2>
      <button class="icon-btn" data-action="habit-month" data-step="-1" aria-label="Mes siguiente" ${off ? '' : 'disabled'}>›</button>
    </div>`;
  }
  if (year) h += '<p class="muted year-hint">Últimos 12 meses. Cada fila es un mes y cada cuadro un día; a la derecha, los días hechos ese mes.</p>';

  if (active.length) {
    h += `<div class="block"><ul class="card list">${active.map(hb => {
      const c = area(hb.area).color, st = habitStreak(hb);
      const meta = year
        ? `<span>${habitYearCount(hb)} veces en 12 meses</span><span>${habitRate(hb, 365)}% del año</span><span>mejor racha ${habitBestStreak(hb)}</span>`
        : `<span>${st ? `🔥 ${st} día${st > 1 ? 's' : ''}` : 'Sin racha'}</span><span>${habitRate(hb, 30)}% en 30 días</span>${(hb.autoTypes || []).length ? '<span title="Se marca solo al avanzar en la Biblioteca">⚡ automático</span>' : ''}`;
      return `<li class="row habit r-${range}" style="--c:${c}">
        <button class="row-main" data-action="open-habit" data-id="${hb.id}">
          <span class="row-title">${hb.icon} ${esc(hb.name)}</span>
          <span class="row-meta">${meta}</span>
        </button>
        ${year ? yearGrid(hb) : `<div class="weeks">
          ${calendar ? `<div class="week head" aria-hidden="true">${WEEKDAYS.map(w => `<small>${w.l}</small>`).join('')}</div>` : ''}
          ${rows.map(row => `<div class="week">${row.map((d, i) => habitCell(hb, d, calendar, i === 0)).join('')}</div>`).join('')}
        </div>`}
      </li>`;
    }).join('')}</ul></div>`;
  } else {
    h += empty('🔥', 'No tienes hábitos activos. Crea uno con el botón +.');
  }

  if (archived.length) {
    h += section('Archivados', `<ul class="card list">${archived.map(hb => `<li class="row"><button class="row-main" data-action="open-habit" data-id="${hb.id}">
        <span class="row-title">${hb.icon} ${esc(hb.name)}</span>
        <span class="row-meta"><span>Archivado ${fmtDue(hb.archivedAt).toLowerCase()}</span><span>${Object.values(state.habitLog).filter(l => l.includes(hb.id)).length} veces en total</span></span>
      </button><span class="chev">›</span></li>`).join('')}</ul>
      <p class="muted year-hint">Conservan todo su historial. Tócalos para verlo o recuperarlos.</p>`);
  }
  return h;
}

/* Veces hechas en los últimos 12 meses (desde el día 1 del mes de hace 11 meses) */
function habitYearCount(hb) {
  const from = addMonths(today().slice(0, 7) + '-01', -11);
  return Object.keys(state.habitLog).filter(d => d >= from && d <= today() && state.habitLog[d].includes(hb.id)).length;
}

/* Cuadrícula de un año: una fila por mes (los 12 últimos), un cuadro por día */
function yearGrid(hb) {
  const t = today(), start = t.slice(0, 7) + '-01';
  let html = '';
  for (let i = 11; i >= 0; i--) {
    const first = addMonths(start, -i), d0 = parseDay(first);
    const days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    let cells = '', done = 0;
    for (let n = 1; n <= 31; n++) {
      if (n > days) { cells += '<i class="none"></i>'; continue; }
      const day = first.slice(0, 8) + pad(n);
      const on = habitDone(hb.id, day);
      if (on) done++;
      const cls = day > t ? 'future' : on ? 'on' : habitDue(hb, day) ? 'miss' : 'rest';
      cells += `<i class="${cls}${day === t ? ' today' : ''}" title="${n} ${MONTHS[d0.getMonth()]}${on ? ' · hecho' : ''}"></i>`;
    }
    const label = MONTHS[d0.getMonth()] + (d0.getMonth() === 0 || i === 11 ? ` <em>${String(d0.getFullYear()).slice(2)}</em>` : '');
    html += `<div class="yrow"><small>${label}</small>${cells}<b>${done || ''}</b></div>`;
  }
  return `<div class="year" style="--c:${area(hb.area).color}">${html}</div>`;
}

/* ---------- BIBLIOTECA ---------- */
function viewBiblioteca() {
  const used = LIB_TYPES.filter(tp => state.library.some(i => i.type === tp.id));
  if (ui.libType !== 'all' && !used.some(tp => tp.id === ui.libType)) ui.libType = 'all';
  let list = state.library.filter(i => (ui.libType === 'all' || i.type === ui.libType) && (ui.libStatus === 'all' || i.status === ui.libStatus));
  list = list.slice().sort((a, b) => (b.finishedAt || b.startedAt || b.createdAt || '').localeCompare(a.finishedAt || a.startedAt || a.createdAt || ''));
  let h = header('Biblioteca', `${state.library.filter(i => i.status === 'doing').length} en curso · ${state.library.filter(i => i.status === 'done').length} terminados`);
  h += `<div class="chips">
    <button class="chip ${ui.libType === 'all' ? 'on' : ''}" data-action="lib-type" data-type="all">Todo</button>
    ${used.map(tp => `<button class="chip ${ui.libType === tp.id ? 'on' : ''}" data-action="lib-type" data-type="${tp.id}">${tp.icon} ${tp.plural}</button>`).join('')}
  </div>`;
  h += segmented([['doing', 'En curso'], ['want', 'Quiero'], ['done', 'Terminado'], ['all', 'Todo']], ui.libStatus, 'lib-status');
  h += list.length ? `<div class="block"><ul class="card list">${list.map(libRow).join('')}</ul></div>`
    : empty('📚', state.library.length ? 'No hay nada con este filtro.' : 'Apunta tu primer libro, podcast o serie con el botón +.');
  return h;
}

/* ---------- RESUMEN ---------- */
function viewResumen() {
  const t = today(), year = t.slice(0, 4), ws = weekStart(t);
  const doneWeek = state.tasks.filter(x => x.status === 'done' && x.doneAt >= ws).length;
  const pending = state.tasks.filter(x => x.status !== 'done');
  const finished = state.library.filter(i => i.status === 'done' && (i.finishedAt || '').startsWith(year));
  const best = activeHabits().reduce((m, hb) => Math.max(m, habitStreak(hb)), 0);
  const weeks = tasksDonePerWeek(8), max = Math.max(1, ...weeks.map(w => w.n));

  let h = header('Resumen', `Año ${year}`);
  h += `<div class="tiles">
    <div class="card tile"><b>${doneWeek}</b><span>tareas hechas esta semana</span></div>
    <div class="card tile"><b>${pending.length}</b><span>tareas pendientes</span></div>
    <div class="card tile"><b>${best ? '🔥 ' + best : '—'}</b><span>mejor racha activa (días)</span></div>
    <div class="card tile"><b>${finished.length}</b><span>terminados este año</span></div>
  </div>`;

  h += section('Tareas completadas por semana', `<div class="card pad"><div class="cols">${weeks.map((w, i) => {
    const d = parseDay(w.from);
    return `<div class="col ${i === weeks.length - 1 ? 'now' : ''}"><em>${w.n}</em><i style="--h:${(w.n / max).toFixed(3)}"></i><small>${d.getDate()}/${d.getMonth() + 1}</small></div>`;
  }).join('')}</div><p class="muted center">Cada barra es una semana (empieza en lunes)</p></div>`);

  const byType = LIB_TYPES.map(tp => ({ tp, n: finished.filter(i => i.type === tp.id).length })).filter(x => x.n);
  h += section(`Terminados en ${year}`, byType.length
    ? `<div class="card pad stat-rows">${byType.map(x => `<div class="stat-row"><span>${x.tp.icon} ${x.tp.plural}</span><b>${x.n}</b></div>`).join('')}</div>`
    : empty('📚', 'Cuando termines un libro, serie o curso, se contará aquí.'));

  if (activeHabits().length) h += section('Hábitos: últimos 30 días', `<div class="card pad stat-rows">${activeHabits().map(hb => {
    const r = habitRate(hb, 30);
    return `<div class="stat-bar"><div class="stat-row"><span>${hb.icon} ${esc(hb.name)}</span><b>${r}%</b></div>${bar(r, area(hb.area).color)}</div>`;
  }).join('')}</div>`);

  const maxA = Math.max(1, ...AREAS.map(a => pending.filter(x => x.area === a.id).length));
  h += section('Pendientes por área', `<div class="card pad stat-rows">${AREAS.map(a => {
    const n = pending.filter(x => x.area === a.id).length;
    return `<div class="stat-bar"><div class="stat-row"><span>${a.icon} ${a.name}</span><b>${n}</b></div>${bar(n / maxA * 100, a.color)}</div>`;
  }).join('')}</div>`);
  return h;
}

const VIEWS = { hoy: viewHoy, tareas: viewTareas, habitos: viewHabitos, biblioteca: viewBiblioteca, resumen: viewResumen };
