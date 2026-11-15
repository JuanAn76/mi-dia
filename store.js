'use strict';
/* ============================================================
   Mi Día — datos, almacenamiento y lógica
   En la fase 1 todo se guarda en este dispositivo (localStorage).
   En la fase 2 solo cambian loadState/saveState por Firebase.
   ============================================================ */

const AREAS = [
  { id: 'casa',     name: 'Casa',               short: 'Casa',     icon: '🏠', color: '#ff9500' },
  { id: 'trabajo',  name: 'Trabajo',            short: 'Trabajo',  icon: '💼', color: '#0a84ff' },
  { id: 'personal', name: 'Personal / Salud',   short: 'Personal', icon: '❤️', color: '#ff375f' },
  { id: 'finanzas', name: 'Finanzas / Papeleo', short: 'Finanzas', icon: '💶', color: '#30b158' },
  { id: 'hobbies',  name: 'Hobbies',            short: 'Hobbies',  icon: '🎧', color: '#af52de' },
];

const LIB_TYPES = [
  { id: 'libro',      name: 'Libro',         plural: 'Libros',      icon: '📖', unit: 'páginas',   steps: [10, 25] },
  { id: 'audiolibro', name: 'Audiolibro',    plural: 'Audiolibros', icon: '🎧', unit: '%',         steps: [5, 10] },
  { id: 'podcast',    name: 'Podcast',       plural: 'Podcasts',    icon: '🎙️', unit: 'episodios', steps: [1] },
  { id: 'youtube',    name: 'Vídeo YouTube', plural: 'YouTube',     icon: '▶️', unit: '%',         steps: [25, 50] },
  { id: 'serie',      name: 'Serie',         plural: 'Series',      icon: '📺', unit: 'episodios', steps: [1] },
  { id: 'pelicula',   name: 'Película',      plural: 'Películas',   icon: '🎬', unit: null },
  { id: 'articulo',   name: 'Artículo',      plural: 'Artículos',   icon: '📰', unit: null },
  { id: 'curso',      name: 'Curso',         plural: 'Cursos',      icon: '🎓', unit: 'lecciones', steps: [1] },
];

const LIB_STATUS = [
  { id: 'doing',   name: 'En curso' },
  { id: 'want',    name: 'Quiero' },
  { id: 'done',    name: 'Terminado' },
  { id: 'dropped', name: 'Abandonado' },
];

const REMIND = [
  { id: 'none', name: 'Sin aviso' },
  { id: 'at',   name: 'A la hora' },
  { id: '10',   name: '10 min antes' },
  { id: '60',   name: '1 hora antes' },
  { id: '1d',   name: '1 día antes' },
  { id: 'custom', name: 'Día y hora concretos' },
];

/* Repetir el aviso: cada cuántos minutos y cuántas veces en total (0 = hasta completar la tarea) */
const NAG_EVERY = [
  { id: '0', name: 'No' }, { id: '5', name: 'Cada 5 min' }, { id: '10', name: 'Cada 10 min' },
  { id: '15', name: 'Cada 15 min' }, { id: '30', name: 'Cada 30 min' }, { id: '60', name: 'Cada hora' },
];
const NAG_TIMES = [
  { id: '2', name: '2 veces' }, { id: '3', name: '3 veces' }, { id: '5', name: '5 veces' },
  { id: '10', name: '10 veces' }, { id: '0', name: 'Hasta completarla' },
];
const NAG_MAX = 24;   // tope de avisos cuando es "hasta completarla"

const REPEAT = [
  { id: 'none',    name: 'No se repite' },
  { id: 'daily',   name: 'Cada día',    unit: ['día', 'días'] },
  { id: 'weekly',  name: 'Cada semana', unit: ['semana', 'semanas'] },
  { id: 'monthly', name: 'Cada mes',    unit: ['mes', 'meses'] },
];

const WEEKDAYS = [
  { n: 1, l: 'L' }, { n: 2, l: 'M' }, { n: 3, l: 'X' }, { n: 4, l: 'J' },
  { n: 5, l: 'V' }, { n: 6, l: 'S' }, { n: 0, l: 'D' },
];

const area = id => AREAS.find(a => a.id === id) || AREAS[0];
const libType = id => LIB_TYPES.find(t => t.id === id) || LIB_TYPES[0];

/* ---------- utilidades ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => {
  const d = parseDay(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';

/* Lunes de la semana de una fecha */
const weekStart = s => { const d = parseDay(s); const wd = (d.getDay() + 6) % 7; return addDays(s, -wd); };

function fmtDue(s) {
  const t = today();
  if (s === t) return 'Hoy';
  if (s === addDays(t, 1)) return 'Mañana';
  if (s === addDays(t, -1)) return 'Ayer';
  const d = parseDay(s);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('es-ES', opts).replace(/\./g, '');
}

/* ---------- estado ---------- */
const STORE_KEY = 'midia.v1';
let state = null;

function emptyState() {
  return { tasks: [], projects: [], habits: [], habitLog: {}, library: [], meta: { demo: false } };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(emptyState(), JSON.parse(raw));
  } catch (e) { /* almacenamiento no disponible: se sigue en memoria */ }
  return null;
}

function saveState() {
  if (typeof Cloud !== 'undefined' && Cloud.enabled) { cloudPush(); return; }   // con Firebase, se guarda en la nube
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* idem */ }
}

/* ---------- tareas ---------- */
const getTask = id => state.tasks.find(t => t.id === id);
const getProject = id => state.projects.find(p => p.id === id);

function nextDue(t) {
  const base = t.due && t.due >= today() ? t.due : today();
  const n = Math.max(1, t.repeat.every || 1);
  if (t.repeat.type === 'daily') return addDays(base, n);
  if (t.repeat.type === 'weekly') return addDays(base, 7 * n);
  if (t.repeat.type === 'monthly') return addMonths(base, n);
  return null;
}

function toggleTask(id) {
  const t = getTask(id);
  if (!t) return;
  if (t.status !== 'done') {
    t.status = 'done';
    t.doneAt = today();
    if (t.repeat && t.repeat.type !== 'none') {
      const copy = Object.assign({}, t, {
        id: uid(), status: 'todo', doneAt: null, spawnedId: null,
        due: nextDue(t),
        subtasks: (t.subtasks || []).map(s => ({ id: uid(), title: s.title, done: false })),
      });
      /* Si el aviso tenía día y hora concretos, se mueve los mismos días que la tarea */
      if (t.remind === 'custom' && t.remindAt && t.due && copy.due) {
        const shift = Math.round((parseDay(copy.due) - parseDay(t.due)) / 86400000);
        copy.remindAt = addDays(t.remindAt.slice(0, 10), shift) + t.remindAt.slice(10);
      }
      t.spawnedId = copy.id;
      state.tasks.push(copy);
    }
  } else {
    t.status = 'todo';
    t.doneAt = null;
    if (t.spawnedId) {
      const sp = getTask(t.spawnedId);
      if (sp && sp.status !== 'done') state.tasks = state.tasks.filter(x => x.id !== sp.id);
      t.spawnedId = null;
    }
  }
  saveState();
}

function upsertTask(data) {
  if (data.id) delete Object.assign(getTask(data.id), data).demo;   // al editarlo deja de ser un ejemplo
  else state.tasks.push(Object.assign({ id: uid(), status: 'todo', doneAt: null, createdAt: today() }, data, { id: uid() }));
  saveState();
}

function deleteTask(id) { state.tasks = state.tasks.filter(t => t.id !== id); saveState(); }

const PRIO_ORDER = { alta: 0, media: 1, baja: 2 };
function sortTasks(list) {
  return list.slice().sort((a, b) =>
    (a.due || '9999').localeCompare(b.due || '9999') ||
    (a.time || '99').localeCompare(b.time || '99') ||
    (PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]) ||
    a.title.localeCompare(b.title));
}

/* ---------- proyectos ---------- */
function upsertProject(data) {
  if (data.id) delete Object.assign(getProject(data.id), data).demo;
  else state.projects.push(Object.assign({ createdAt: today() }, data, { id: uid() }));
  saveState();
}
function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  state.tasks.forEach(t => { if (t.projectId === id) t.projectId = ''; });
  saveState();
}
function projectProgress(id) {
  const ts = state.tasks.filter(t => t.projectId === id);
  const done = ts.filter(t => t.status === 'done').length;
  return { total: ts.length, done, pct: ts.length ? Math.round(done / ts.length * 100) : 0 };
}

/* ---------- hábitos ---------- */
const getHabit = id => state.habits.find(h => h.id === id);
const habitDone = (id, day) => (state.habitLog[day] || []).includes(id);
const habitDue = (h, day) => day >= (h.createdAt || '0000') && (h.days || [0, 1, 2, 3, 4, 5, 6]).includes(parseDay(day).getDay());

function setHabit(id, day, on) {
  const list = state.habitLog[day] || [];
  const has = list.includes(id);
  if (on && !has) list.push(id);
  if (!on && has) list.splice(list.indexOf(id), 1);
  if (list.length) state.habitLog[day] = list; else delete state.habitLog[day];
  saveState();
}
const toggleHabit = (id, day) => setHabit(id, day, !habitDone(id, day));

/* Racha: días seguidos (de los que tocan) cumplidos hasta hoy. Hoy sin marcar no la rompe. */
function habitStreak(h) {
  let day = today(), n = 0, guard = 0;
  if (!habitDone(h.id, day)) day = addDays(day, -1);
  while (guard++ < 2000 && day >= (h.createdAt || '0000')) {
    if (habitDone(h.id, day)) n++;
    else if (habitDue(h, day)) break;
    day = addDays(day, -1);
  }
  return n;
}

/* % de cumplimiento en los últimos n días */
function habitRate(h, n) {
  let due = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const day = addDays(today(), -i);
    if (!habitDue(h, day)) continue;
    due++;
    if (habitDone(h.id, day)) done++;
  }
  return due ? Math.round(done / due * 100) : 0;
}

function upsertHabit(data) {
  if (data.id) delete Object.assign(getHabit(data.id), data).demo;
  else state.habits.push(Object.assign({ createdAt: today() }, data, { id: uid() }));
  saveState();
}
function deleteHabit(id) {
  state.habits = state.habits.filter(h => h.id !== id);
  Object.keys(state.habitLog).forEach(d => {
    state.habitLog[d] = state.habitLog[d].filter(x => x !== id);
    if (!state.habitLog[d].length) delete state.habitLog[d];
  });
  saveState();
}

/* ---------- biblioteca ---------- */
const getItem = id => state.library.find(i => i.id === id);

function itemPct(it) {
  const unit = libType(it.type).unit;
  if (it.status === 'done') return 100;
  if (!unit) return null;
  if (unit === '%') return Math.min(100, it.progress || 0);
  if (it.total > 0) return Math.min(100, Math.round((it.progress || 0) / it.total * 100));
  return null;
}

function itemProgressLabel(it) {
  const unit = libType(it.type).unit;
  if (!unit) return '';
  if (unit === '%') return `${it.progress || 0} %`;
  return it.total > 0 ? `${it.progress || 0} de ${it.total} ${unit}` : `${it.progress || 0} ${unit}`;
}

/* Al avanzar en algo, se marcan solos los hábitos enlazados a ese tipo */
function autoMarkHabits(type) {
  const marked = [];
  state.habits.forEach(h => {
    if ((h.autoTypes || []).includes(type) && !habitDone(h.id, today())) {
      setHabit(h.id, today(), true);
      marked.push(h);
    }
  });
  return marked;
}

function setProgress(id, value) {
  const it = getItem(id);
  if (!it) return [];
  const unit = libType(it.type).unit;
  const before = it.progress || 0;
  let v = Math.max(0, Math.round(value));
  if (unit === '%') v = Math.min(100, v);
  if (it.total > 0) v = Math.min(it.total, v);
  it.progress = v;
  if (v > 0 && it.status === 'want') it.status = 'doing';
  if (it.status === 'doing' && !it.startedAt) it.startedAt = today();
  const complete = unit === '%' ? v >= 100 : (it.total > 0 && v >= it.total);
  if (complete) { it.status = 'done'; it.finishedAt = today(); }
  saveState();
  return v > before ? autoMarkHabits(it.type) : [];
}

function upsertItem(data) {
  let it;
  if (data.id) { it = getItem(data.id); Object.assign(it, data); delete it.demo; }
  else { it = Object.assign({ createdAt: today(), cover: undefined }, data, { id: uid() }); state.library.push(it); }
  if (it.status === 'doing' && !it.startedAt) it.startedAt = today();
  if (it.status === 'done' && !it.finishedAt) it.finishedAt = today();
  if (it.status !== 'done') it.finishedAt = null;
  saveState();
  return it;
}
function deleteItem(id) { state.library = state.library.filter(i => i.id !== id); saveState(); }

/* ---------- portadas automáticas ---------- */
function youtubeId(url) {
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

async function lookupCover(it) {
  const q = encodeURIComponent(it.title);
  try {
    if (it.type === 'youtube') {
      const id = youtubeId(it.url);
      return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
    }
    if (it.type === 'libro' || it.type === 'audiolibro') {
      const full = encodeURIComponent(`${it.title} ${it.creator || ''}`.trim());
      const r = await fetch(`https://openlibrary.org/search.json?q=${full}&limit=5&fields=cover_i`);
      const j = await r.json();
      const hit = (j.docs || []).find(d => d.cover_i);
      if (hit) return `https://covers.openlibrary.org/b/id/${hit.cover_i}-M.jpg`;
      const r2 = await fetch(`https://itunes.apple.com/search?term=${q}&media=${it.type === 'libro' ? 'ebook' : 'audiobook'}&limit=1&country=es`);
      const h2 = ((await r2.json()).results || [])[0];
      return h2 && h2.artworkUrl100 ? h2.artworkUrl100.replace('100x100', '300x300') : '';
    }
    if (it.type === 'pelicula') {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(it.title + ' film')}&gsrlimit=1&prop=pageimages&pilicense=any&pithumbsize=300&format=json&origin=*`);
      const j = await r.json();
      const p = j.query && Object.values(j.query.pages)[0];
      /* Solo se acepta si el artículo encontrado empieza igual que el título (evita carteles equivocados) */
      const first = s => s.toLowerCase().split(/[\s:(]/)[0];
      return p && p.thumbnail && first(p.title) === first(it.title) ? p.thumbnail.source : '';
    }
    if (it.type === 'serie') {
      const r = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${q}`);
      if (!r.ok) return '';
      const j = await r.json();
      return (j.image && j.image.medium) ? j.image.medium.replace(/^http:/, 'https:') : '';
    }
    if (it.type === 'podcast') {
      const r = await fetch(`https://itunes.apple.com/search?term=${q}&media=podcast&limit=1&country=es`);
      const j = await r.json();
      const hit = (j.results || [])[0];
      return hit && hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100', '300x300') : '';
    }
  } catch (e) { return undefined; /* sin conexión: se reintenta otro día */ }
  return '';
}

/* Busca portada para los elementos que aún no la tienen. cover === '' significa "ya se buscó y no hay". */
async function fetchMissingCovers(onUpdate) {
  for (const it of state.library.filter(i => i.cover === undefined || i.cover === null)) {
    const c = await lookupCover(it);
    if (c === undefined) continue;
    const cur = getItem(it.id);
    if (!cur) continue;
    cur.cover = c;
    saveState();
    if (c && onUpdate) onUpdate();
  }
}

/* ---------- estadísticas ---------- */
function tasksDonePerWeek(weeks) {
  const start = weekStart(today());
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(start, -7 * i), to = addDays(from, 6);
    out.push({ from, n: state.tasks.filter(t => t.status === 'done' && t.doneAt >= from && t.doneAt <= to).length });
  }
  return out;
}

/* ---------- datos de ejemplo ---------- */
function demoState() {
  const t = today(), s = emptyState();
  s.meta.demo = true;
  const P = (name, a) => { const p = { id: uid(), name, area: a, createdAt: addDays(t, -40) }; s.projects.push(p); return p.id; };
  const pIA = P('Aprender IA', 'hobbies');
  const pBano = P('Reforma del baño', 'casa');
  const pWeb = P('Lanzamiento web nueva', 'trabajo');

  const T = (title, a, o = {}) => s.tasks.push(Object.assign({
    id: uid(), title, area: a, projectId: '', status: 'todo', due: '', time: '', remind: 'none',
    priority: 'media', repeat: { type: 'none', every: 1 }, subtasks: [], notes: '', doneAt: null, createdAt: addDays(t, -10),
  }, o));
  const subs = (...xs) => xs.map(([title, done]) => ({ id: uid(), title, done: !!done }));

  T('Enviar informe mensual', 'trabajo', { due: t, time: '12:00', remind: '60', priority: 'alta', repeat: { type: 'monthly', every: 1 } });
  T('Preparar presentación para el comité', 'trabajo', { due: addDays(t, 2), projectId: pWeb, subtasks: subs(['Recopilar métricas', 1], ['Montar diapositivas'], ['Ensayar']) });
  T('Revisar textos de la home', 'trabajo', { due: addDays(t, 5), projectId: pWeb });
  T('Responder al proveedor', 'trabajo', { due: addDays(t, -1), priority: 'alta' });
  T('Hacer la compra semanal', 'casa', { due: t, repeat: { type: 'weekly', every: 1 }, subtasks: subs(['Fruta y verdura', 1], ['Detergente'], ['Café']) });
  T('Pedir presupuesto de azulejos', 'casa', { due: addDays(t, 3), projectId: pBano });
  T('Elegir grifería', 'casa', { projectId: pBano });
  T('Llamar al fontanero', 'casa', { due: addDays(t, -2), projectId: pBano, priority: 'alta' });
  T('Pedir cita con el dentista', 'personal', { due: addDays(t, 1) });
  T('Salir a correr 5 km', 'personal', { due: t, time: '19:00', remind: '10' });
  T('Pagar el seguro del coche', 'finanzas', { due: addDays(t, 6), remind: '1d', priority: 'alta' });
  T('Revisar la factura de la luz', 'finanzas', { due: addDays(t, 12), repeat: { type: 'monthly', every: 1 } });
  T('Terminar el módulo 3 del curso', 'hobbies', { due: addDays(t, 4), projectId: pIA });
  T('Probar un agente con mis propias notas', 'hobbies', { projectId: pIA });
  [[1, 'trabajo', 'Cerrar actas de la reunión'], [2, 'casa', 'Cambiar la bombilla del pasillo'], [3, 'finanzas', 'Presentar el modelo 303'],
   [6, 'trabajo', 'Actualizar el plan del trimestre'], [8, 'hobbies', 'Terminar el módulo 2 del curso', pIA], [9, 'personal', 'Renovar el abono del gimnasio'],
   [10, 'casa', 'Medir el baño', pBano], [13, 'trabajo', 'Entrevista con el candidato'], [15, 'hobbies', 'Instalar el entorno de Python', pIA],
   [16, 'casa', 'Llevar el coche a la ITV'], [20, 'trabajo', 'Enviar la propuesta al cliente'], [22, 'personal', 'Analítica anual'],
   [27, 'trabajo', 'Revisar el presupuesto'], [29, 'finanzas', 'Ordenar las facturas'], [34, 'trabajo', 'Planificar el sprint'], [41, 'casa', 'Limpiar el trastero'],
  ].forEach(([ago, a, title, pid]) => T(title, a, { status: 'done', doneAt: addDays(t, -ago), due: addDays(t, -ago), projectId: pid || '' }));

  const H = (name, icon, a, autoTypes, days) => { const h = { id: uid(), name, icon, area: a, autoTypes, days: days || [0, 1, 2, 3, 4, 5, 6], createdAt: addDays(t, -60) }; s.habits.push(h); return h; };
  const hs = [
    [H('Leer 20 minutos', '📖', 'hobbies', ['libro', 'audiolibro']), 0.82, 6],
    [H('Escuchar un podcast', '🎙️', 'hobbies', ['podcast']), 0.6, 2],
    [H('Aprender IA 30 min', '🤖', 'hobbies', ['curso', 'youtube']), 0.7, 4],
    [H('Hacer deporte', '🏃', 'personal', [], [1, 3, 5, 6]), 0.75, 3],
    [H('Meditar', '🧘', 'personal', []), 0.45, 0],
  ];
  /* Historial verosímil y estable (no aleatorio de verdad) */
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 59; i >= 1; i--) {
    const day = addDays(t, -i);
    hs.forEach(([h, p, streak]) => {
      if (!h.days.includes(parseDay(day).getDay())) return;
      if (i <= streak * (7 / h.days.length) || rnd() < p) (s.habitLog[day] = s.habitLog[day] || []).push(h.id);
    });
  }

  const L = (title, type, creator, status, o = {}) => s.library.push(Object.assign({
    id: uid(), title, type, creator, status, progress: 0, total: 0, rating: 0, url: '', notes: '',
    startedAt: status === 'want' ? null : addDays(t, -20), finishedAt: null, createdAt: addDays(t, -30), cover: undefined,
  }, o));
  L('Hábitos atómicos', 'libro', 'James Clear', 'doing', { progress: 142, total: 320, notes: '«No te elevas al nivel de tus metas, caes al nivel de tus sistemas.»' });
  L('Deep Learning with Python', 'libro', 'François Chollet', 'doing', { progress: 60, total: 504 });
  L('Sapiens', 'libro', 'Yuval Noah Harari', 'done', { progress: 496, total: 496, rating: 5, finishedAt: addDays(t, -35) });
  L('El infinito en un junco', 'libro', 'Irene Vallejo', 'done', { progress: 452, total: 452, rating: 4, finishedAt: addDays(t, -80) });
  L('Proyecto Hail Mary', 'audiolibro', 'Andy Weir', 'want');
  L('Lex Fridman Podcast', 'podcast', 'Lex Fridman', 'doing', { progress: 12 });
  L('Kaizen', 'podcast', 'Jaime Rodríguez de Santiago', 'doing', { progress: 34 });
  L('Severance', 'serie', 'Apple TV+', 'doing', { progress: 7, total: 19 });
  L('The Bear', 'serie', 'FX', 'want');
  L('Dune: Parte Dos', 'pelicula', 'Denis Villeneuve', 'done', { rating: 5, finishedAt: addDays(t, -12) });
  L('Oppenheimer', 'pelicula', 'Christopher Nolan', 'want');
  L('Curso de IA generativa', 'curso', 'DeepLearning.AI', 'doing', { progress: 9, total: 24 });
  L('Intro to Large Language Models', 'youtube', 'Andrej Karpathy', 'done', { progress: 100, rating: 5, url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g', finishedAt: addDays(t, -6) });
  L('Cómo funcionan los transformers', 'articulo', 'Blog técnico', 'want');
  DEMO_COLS.forEach(c => s[c].forEach(x => { x.demo = true; }));   // marca de "ejemplo" para poder borrarlos aparte
  return s;
}

const DEMO_COLS = ['tasks', 'projects', 'habits', 'library'];
const hasDemo = () => DEMO_COLS.some(c => state[c].some(x => x.demo));

/* Añade los ejemplos a lo que ya haya, sin tocar los datos propios */
function addDemoData() {
  const d = demoState();
  DEMO_COLS.forEach(c => { state[c] = state[c].concat(d[c]); });
  Object.keys(d.habitLog).forEach(day => { state.habitLog[day] = (state.habitLog[day] || []).concat(d.habitLog[day]); });
  saveState();
}

/* Borra solo lo marcado como ejemplo. Lo que se haya editado ya no lleva la marca y se conserva. */
function removeDemoData() {
  const habitIds = new Set(state.habits.filter(h => h.demo).map(h => h.id));
  const projectIds = new Set(state.projects.filter(p => p.demo).map(p => p.id));
  DEMO_COLS.forEach(c => { state[c] = state[c].filter(x => !x.demo); });
  state.tasks.forEach(t => { if (projectIds.has(t.projectId)) t.projectId = ''; });
  Object.keys(state.habitLog).forEach(day => {
    const left = state.habitLog[day].filter(id => !habitIds.has(id));
    if (left.length) state.habitLog[day] = left; else delete state.habitLog[day];
  });
  state.meta.demo = false;
  saveState();
}
