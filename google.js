'use strict';
/* ============================================================
   Mi Día — Google Calendar y Gmail
   El servidor de avisos le pide al script de Google (en tu
   cuenta) los eventos y correos; aquí se decide qué sugerir,
   se completan los datos que falten y se crean las tareas.
   Lo ya analizado (aceptado o descartado) no vuelve a salir.
   ============================================================ */

const TENANTS = ['Carlos Heredero', 'Eulalia Paino'];
const BILL_SUPPLIERS = [
  { name: 'ISTA (agua)', re: /\bista\b/i },
  { name: 'Iberdrola', re: /iberdrola/i }, { name: 'Endesa', re: /endesa/i }, { name: 'Naturgy', re: /naturgy/i },
  { name: 'Repsol', re: /repsol/i }, { name: 'TotalEnergies', re: /totalenergies/i }, { name: 'Holaluz', re: /holaluz/i },
  { name: 'Canal de Isabel II', re: /canal de isabel/i }, { name: 'Nedgia', re: /nedgia/i },
  { name: 'Comunidad', re: /comunidad de propietarios|administra(ci[oó]n|dor) de fincas/i },
  { name: 'IBI', re: /\bibi\b|bienes inmuebles/i },
  { name: 'Seguro del hogar', re: /seguro (de )?hogar|p[oó]liza/i },
];
const AREA_HINTS = [
  ['trabajo', /reuni[oó]n|meeting|\bcall\b|llamada con|comit[eé]|cliente|proyecto|oficina|trsa|sprint|\bdemo\b|workshop|teams|zoom|webinar|presentaci[oó]n|entrevista/i],
  ['personal', /m[eé]dico|dentista|doctor|cl[ií]nica|hospital|anal[ií]tica|fisio|gimnasio|\bgym\b|yoga|pilates|cumplea|cena|comida con|boda|cine|concierto|viaje|vuelo|peluquer|oculista|vacuna/i],
  ['finanzas', /banco|hacienda|declaraci[oó]n|renta|seguro|notar|gestor[ií]a|factura|\bpago\b|impuesto|\bibi\b|hipoteca/i],
  ['casa', /\bcasa\b|\bpiso\b|fontaner|electricista|limpieza|\bcompra\b|supermercado|ikea|reparaci|mudanza|caldera|comunidad|inquilino|basura|jard[ií]n/i],
  ['hobbies', /curso|\bclase\b|taller|\bia\b|podcast|libro|lectura|guitarra|partido|museo|exposici/i],
];
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

ui.suggestions = [];
ui.google = null;
let googleLastCheck = 0;

const shortDate = s => parseDay(s.slice(0, 10)).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const cleanSubject = s => String(s || '').replace(/^(re|rv|fw|fwd):\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 90);
const senderName = from => ((/^"?([^"<]+?)"?\s*</.exec(from || '') || [])[1] || from || '').trim();

/* "Llegará el jueves, 20 de noviembre" → 2026-11-20 (busca cerca de palabras de entrega) */
function deliveryDate(text, received) {
  const re = new RegExp(`(?:entrega|entregar|llega|llegar|llegada|recibir|recogida|prevista|estimada)[^.]{0,45}?\\b(\\d{1,2}) de (${MONTHS_ES.join('|')})`, 'i');
  const m = re.exec(text);
  if (!m) return '';
  const year = Number(received.slice(0, 4)), month = MONTHS_ES.indexOf(m[2].toLowerCase());
  let d = `${year}-${pad(month + 1)}-${pad(Number(m[1]))}`;
  if (d < addDays(received.slice(0, 10), -7)) d = `${year + 1}-${pad(month + 1)}-${pad(Number(m[1]))}`;   // diciembre → enero
  return d;
}

function classifyMail(d) {
  const text = `${d.from} ${d.subject} ${d.snippet}`, recv = d.date.slice(0, 10);
  if (/amazon\./i.test(d.from)) {
    if (!/pedido|enviado|entrega|llega|repart|order|shipped|deliver|paquete|devoluci/i.test(d.subject)) return null;
    const when = deliveryDate(text, recv);
    return { kind: 'amazon', icon: '📦', label: 'Pedido de Amazon', title: 'Recibir pedido de Amazon: ' + cleanSubject(d.subject), area: 'casa', due: when, hint: when ? `Entrega prevista: ${shortDate(when)}` : 'Sin fecha de entrega en el correo' };
  }
  if (/wallapop/i.test(d.from)) {
    if (/descubre|novedades|recomend|te puede interesar|bajad[oa] de precio|promo/i.test(d.subject)) return null;
    return { kind: 'wallapop', icon: '🛍', label: 'Wallapop', title: 'Wallapop: ' + cleanSubject(d.subject), area: 'personal', due: deliveryDate(text, recv) };
  }
  const sup = BILL_SUPPLIERS.find(s => s.re.test(text));
  if (sup && /factura|recibo|cargo|importe|liquidaci|lectura|consumo|cuota|domicilia|\bpago\b|bill/i.test(text)) {
    const low = text.toLowerCase();
    const tenant = TENANTS.find(n => low.includes(n.toLowerCase())) || TENANTS.find(n => low.includes(n.split(' ')[1].toLowerCase())) || '';
    return { kind: 'factura', icon: '🧾', label: 'Factura de un piso', supplier: sup.name, tenant, area: 'finanzas', due: today(), received: recv };
  }
  if (/tu pedido|pedido enviado|fecha de entrega|seguimiento (del|de tu) env[ií]o|ha sido enviado|en reparto/i.test(text)) {
    return { kind: 'pedido', icon: '📦', label: `Pedido (${senderName(d.from).slice(0, 30)})`, title: 'Recibir pedido: ' + cleanSubject(d.subject), area: 'casa', due: deliveryDate(text, recv) };
  }
  return null;
}

function classifyEvent(d) {
  const text = `${d.title} ${d.location} ${d.description}`;
  const hit = AREA_HINTS.find(([, re]) => re.test(text));
  return { kind: 'evento', icon: '📅', label: 'Calendario', title: d.title, area: hit ? hit[0] : '', due: d.date, time: d.time || '' };
}

const billTitle = (s, tenant) => tenant && tenant !== 'ninguno'
  ? `Avisar a ${tenant}: factura de ${s.supplier} (recibida ${shortDate(s.received)})`
  : `Revisar factura de ${s.supplier} (recibida ${shortDate(s.received)})`;

/* Convierte lo pendiente del servidor en sugerencias; lo que no encaja se descarta solo */
function processPending(list) {
  const keep = [], ignore = [];
  (list || []).forEach(p => {
    const s = p.source === 'calendar' ? classifyEvent(p.data) : classifyMail(p.data);
    if (s) keep.push(Object.assign(s, { id: p.id, source: p.source, data: p.data }));
    else ignore.push(p.id);
  });
  if (ignore.length) pushCall('/google/resolve', { ids: ignore, status: 'discarded' }).catch(() => {});
  ui.suggestions = keep;
}

async function googleRefresh(force) {
  if (!pushConfigured() || !Cloud.ready) return;
  if (!force && Date.now() - googleLastCheck < 5 * 60e3) return;
  googleLastCheck = Date.now();
  try {
    const before = ui.suggestions.length;
    const r = await pushCall('/google/pending');
    processPending(r.pending);
    if (before !== ui.suggestions.length) render();
    if (location.hash === '#sugerencias') { history.replaceState(null, '', location.pathname); suggestionsSheet(); }
  } catch (e) { /* sin conexión o servidor sin la versión nueva */ }
}

/* Tarjeta de la pantalla Hoy */
function suggestionsCard() {
  const n = ui.suggestions.length;
  if (!n) return '';
  const cal = ui.suggestions.filter(s => s.source === 'calendar').length, mail = n - cal;
  return `<button class="card fast-today pending" data-action="open-suggestions"><span class="fast-ico">📥</span><span><b>${n} sugerencia${n === 1 ? '' : 's'} para revisar</b><small>${[cal ? `${cal} del calendario` : '', mail ? `${mail} del correo` : ''].filter(Boolean).join(' · ')}</small></span><span class="chev">›</span></button>`;
}

/* ---------- hoja de sugerencias ---------- */
function suggestionForm(s, i) {
  const d = s.data;
  const source = s.source === 'calendar'
    ? `${shortDate(d.date)}${d.time ? ' · ' + d.time + (d.endTime ? '–' + d.endTime : '') : ' · todo el día'}${d.location ? ' · ' + esc(d.location) : ''}`
    : `De ${esc(senderName(d.from))} · ${shortDate(d.date)} · «${esc(cleanSubject(d.subject))}»`;
  const mailLink = s.source === 'gmail' ? `<a class="sug-link" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(d.threadId)}" target="_blank" rel="noopener">Abrir correo ↗</a>` : '';
  const title = s.kind === 'factura' ? billTitle(s, s.tenant) : s.title;
  return `<form class="f-sug card" id="sug-${i}" data-sid="${esc(s.id)}" autocomplete="off">
    <div class="sug-head"><span class="sug-ico">${s.icon}</span><div><b>${esc(s.label)}</b><small>${source}</small>${s.hint ? `<small>${esc(s.hint)}</small>` : ''}${mailLink}</div></div>
    ${s.kind === 'factura' ? `<fieldset class="pick sug-tenant"><legend>¿De qué inquilino es?</legend>
      ${TENANTS.map(n => `<label class="pick-item"><input type="radio" name="tenant" value="${esc(n)}" required ${s.tenant === n ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}
      <label class="pick-item"><input type="radio" name="tenant" value="ninguno" required><span>Ninguno (solo apuntar)</span></label></fieldset>` : ''}
    <input class="sug-title" name="title" value="${esc(title)}" required aria-label="Título de la tarea">
    <div class="sug-grid">
      <label><span>Área</span><select name="area" required><option value="">¿Área?</option>${AREAS.map(a => `<option value="${a.id}" ${s.area === a.id ? 'selected' : ''}>${a.icon} ${a.short}</option>`).join('')}</select></label>
      <label><span>Fecha</span><input type="date" name="due" value="${s.due || ''}"></label>
      <label><span>Hora</span><input type="time" name="time" value="${s.time || ''}"></label>
      <label><span>Aviso</span><select name="remind">${REMIND.filter(r => r.id !== 'custom').map(r => `<option value="${r.id}" ${r.id === (s.time ? '60' : 'none') ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label>
    </div>
    ${s.area ? '' : '<p class="sug-ask">❓ No sé a qué área pertenece: elige una para añadirla.</p>'}
    <div class="sug-actions"><button type="button" class="btn ghost small" data-action="sug-discard" data-sid="${esc(s.id)}">Descartar</button><button type="submit" class="btn primary small">Añadir a tareas</button></div>
  </form>`;
}

function suggestionsSheet() {
  if (!pushConfigured()) { toast('Primero inicia sesión'); return; }
  const list = ui.suggestions;
  const cal = list.map((s, i) => [s, i]).filter(([s]) => s.source === 'calendar'), mail = list.map((s, i) => [s, i]).filter(([s]) => s.source === 'gmail');
  const body = `<div class="sug-scan">
      <button class="btn ghost small" data-action="google-scan" data-source="calendar">📅 Revisar calendario<br><small>próximos 15 días</small></button>
      <button class="btn ghost small" data-action="google-scan" data-source="gmail">✉️ Revisar correo<br><small>últimos 15 días</small></button>
    </div>
    <p class="muted center sug-note">Cada lunes a las 7:00 se revisa solo. Lo que ya aceptaste o descartaste no vuelve a aparecer.</p>
    ${list.length ? '' : '<div class="empty"><div class="empty-ico">📭</div><p>No hay nada pendiente de revisar.</p></div>'}
    ${cal.length ? `<h3 class="sug-section">📅 Calendario (${cal.length})</h3>${cal.map(([s, i]) => suggestionForm(s, i)).join('')}` : ''}
    ${mail.length ? `<h3 class="sug-section">✉️ Correo (${mail.length})</h3>${mail.map(([s, i]) => suggestionForm(s, i)).join('')}` : ''}
    ${list.length > 1 ? '<button class="btn danger full" data-action="sug-discard-all">Descartar todas</button>' : ''}`;
  openSheet({ title: 'Sugerencias', body, cancelLabel: 'Cerrar' });
}

function acceptSuggestion(form) {
  const s = ui.suggestions.find(x => x.id === form.dataset.sid);
  if (!s) return;
  const f = new FormData(form), d = s.data;
  const origin = s.source === 'calendar'
    ? `Desde Google Calendar: ${d.title}${d.location ? ' · ' + d.location : ''}${d.description ? '\n' + d.description : ''}`
    : `Desde Gmail (${senderName(d.from)}, ${shortDate(d.date)}): ${cleanSubject(d.subject)}\nhttps://mail.google.com/mail/u/0/#all/${d.threadId}`;
  const due = f.get('due') || '', time = f.get('time') || '';
  let remind = f.get('remind') || 'none';
  if (remind !== 'none' && !time) remind = 'none';   // un aviso necesita hora
  upsertTask({
    title: f.get('title').trim(), area: f.get('area'), projectId: '', due, time, remind,
    remindAt: '', remindEvery: 0, remindTimes: 3, priority: s.kind === 'factura' ? 'alta' : 'media',
    repeat: { type: 'none', every: 1 }, subtasks: [], notes: origin,
  });
  resolveSuggestion(s.id, 'accepted');
  toast('✅ Añadida a tus tareas');
}

function resolveSuggestion(id, status) {
  ui.suggestions = ui.suggestions.filter(x => x.id !== id);
  pushCall('/google/resolve', { id, status }).catch(() => toast('No se pudo guardar en el servidor; puede volver a aparecer'));
  render();
  if ($('#sheet-root').innerHTML) suggestionsSheet();
}

/* ---------- Ajustes: conexión con Google ---------- */
async function renderGoogleSettings() {
  const set = html => { const el = $('#google-box'); if (el) el.innerHTML = html; };
  if (!pushConfigured()) return set('<p class="muted">Inicia sesión para conectar Google.</p>');
  try {
    const st = await pushCall('/google/status');
    ui.google = st;
    if (st.connected) {
      set(`<p><b>✅ Conectado:</b> ${esc(st.email || '')}</p>
        <p class="muted">Revisión automática: lunes a las 7:00${st.ultimaRevision ? ` (última: ${fmtDue(st.ultimaRevision).toLowerCase()})` : ''}.</p>
        <button class="btn ghost full" data-action="open-suggestions">📥 Ver sugerencias${ui.suggestions.length ? ` (${ui.suggestions.length})` : ''}</button>
        <button class="btn ghost full" data-action="google-disconnect">Desconectar Google</button>`);
    } else {
      set(`<p class="muted">Para leer tu calendario y tu correo, y enviar tareas por email, pega aquí la dirección de tu script de Google (acaba en <b>/exec</b>).</p>
        <form id="f-gconnect" autocomplete="off"><div class="group">${field('Dirección', '<input type="url" name="url" required placeholder="https://script.google.com/macros/s/…/exec">')}</div>
        <button class="btn primary full" type="submit">Conectar</button></form>`);
    }
  } catch (e) {
    set('<p class="muted">El servidor de avisos todavía no tiene la versión con Google. Actualiza su código en Cloudflare.</p>');
  }
}

async function googleConnect(form) {
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Comprobando…';
  try {
    const r = await pushCall('/google/connect', { url: new FormData(form).get('url').trim() });
    toast(`✅ Google conectado (${r.email})`);
    googleRefresh(true);
  } catch (e) {
    toast('No se pudo conectar. Revisa la dirección y que el script esté publicado para «Cualquier usuario».');
  }
  renderGoogleSettings();
}

/* ---------- enviar una tarea por correo (programado) ---------- */
const MAIL_TO = ['jaserranor@gmail.com', 'jaserrano@trsa.es'];

function taskMail(t) {
  const a = area(t.area), p = t.projectId && getProject(t.projectId);
  const rows = [['Área', `${a.icon} ${a.name}`]];
  if (p) rows.push(['Proyecto', p.name]);
  if (t.due) rows.push(['Fecha', parseDay(t.due).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (t.time ? ` · ${t.time}` : '')]);
  rows.push(['Prioridad', { alta: 'Alta', media: 'Media', baja: 'Baja' }[t.priority] || 'Media']);
  if (t.repeat && t.repeat.type !== 'none') rows.push(['Se repite', (REPEAT.find(r => r.id === t.repeat.type) || {}).name || '']);
  const subs = (t.subtasks || []).map(s => `${s.done ? '☑' : '☐'} ${s.title}`);
  const text = [t.title, '', ...rows.map(([k, v]) => `${k}: ${v}`), subs.length ? '\nSubtareas:\n' + subs.join('\n') : '', t.notes ? '\nNotas:\n' + t.notes : '', `\nAbrir Mi Día: ${APP_PUBLIC_URL}`].join('\n');
  const td = 'padding:4px 12px 4px 0;vertical-align:top;';
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;color:#1c1c1e;max-width:560px">
    <h2 style="margin:0 0 12px;font-size:20px">📌 ${esc(t.title)}</h2>
    <table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="${td}color:#6b6b70">${esc(k)}</td><td style="${td}">${esc(v)}</td></tr>`).join('')}</table>
    ${subs.length ? `<p style="margin:14px 0 4px;color:#6b6b70">Subtareas</p><p style="margin:0">${subs.map(esc).join('<br>')}</p>` : ''}
    ${t.notes ? `<p style="margin:14px 0 4px;color:#6b6b70">Notas</p><p style="margin:0;white-space:pre-wrap">${esc(t.notes)}</p>` : ''}
    <p style="margin:20px 0 0"><a href="${APP_PUBLIC_URL}" style="color:#007aff">Abrir Mi Día</a></p></div>`;
  return { subject: `📌 ${t.title}`.slice(0, 200), html, text };
}

/* Valor para <input type="datetime-local"> */
const localDT = d => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function mailSheet(taskId) {
  const t = getTask(taskId);
  if (!t) return;
  const soon = new Date(Date.now() + 5 * 60e3); soon.setSeconds(0, 0);
  const m = taskMail(t);
  const body = `<form id="f-mail" data-task="${t.id}" autocomplete="off">
    <p class="day-title">📌 ${esc(t.title)}</p>
    <fieldset class="pick"><legend>Enviar a</legend>${MAIL_TO.map((a, i) => `<label class="pick-item"><input type="radio" name="to" value="${a}" ${i === 0 ? 'checked' : ''}><span>${a}</span></label>`).join('')}</fieldset>
    <div class="group">${field('Enviar el', `<input type="datetime-local" name="sendAt" required value="${localDT(soon)}">`)}</div>
    <div class="quick">
      <button type="button" class="btn ghost small" data-action="mail-when" data-when="now">Ahora</button>
      <button type="button" class="btn ghost small" data-action="mail-when" data-when="tomorrow">Mañana 8:00</button>
      <button type="button" class="btn ghost small" data-action="mail-when" data-when="monday">Lunes 8:00</button>
    </div>
    <div class="card pad mail-preview"><span class="group-title">Vista previa</span><b>${esc(m.subject)}</b><pre>${esc(m.text)}</pre></div>
    <button class="btn primary full" type="submit">✉️ Programar envío</button>
    <div id="mail-list" class="mail-list"></div>
  </form>`;
  openSheet({ title: 'Enviar por correo', body, cancelLabel: 'Cerrar' });
  loadMailList(t.id);
}

async function loadMailList(taskId) {
  const el = $('#mail-list');
  if (!el) return;
  try {
    const { mails = [] } = await pushCall('/mail/list', { taskId });
    if (!mails.length) { el.innerHTML = ''; return; }
    const label = { pending: '⏳ programado', sent: '✅ enviado', failed: '⚠️ no se pudo enviar' };
    el.innerHTML = `<span class="group-title">Correos de esta tarea</span>` + mails.map(m => `<div class="stat-row">
      <span>${label[m.status] || m.status} · ${esc(m.to_addr)}<br><small class="muted">${new Date(m.send_at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${m.error ? ' · ' + esc(m.error) : ''}</small></span>
      ${m.status === 'pending' ? `<button type="button" class="btn ghost small" data-action="mail-cancel" data-id="${m.id}" data-task="${esc(taskId)}">Cancelar</button>` : ''}</div>`).join('');
  } catch (e) { el.innerHTML = ''; }
}

async function scheduleMail(form) {
  const t = getTask(form.dataset.task), f = new FormData(form);
  const when = new Date(f.get('sendAt')).getTime();
  if (!t || !Number.isFinite(when)) return;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Programando…';
  try {
    await pushCall('/mail/schedule', Object.assign({ taskId: t.id, to: f.get('to'), sendAt: when }, taskMail(t)));
    toast(when <= Date.now() + 60e3 ? `✉️ Se enviará en un minuto a ${f.get('to')}` : `✉️ Programado: ${new Date(when).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
    loadMailList(t.id);
  } catch (e) {
    toast(ui.google && !ui.google.connected ? 'Primero conecta Google en Ajustes' : 'No se pudo programar. ¿Está Google conectado en Ajustes?');
  }
  btn.disabled = false; btn.textContent = '✉️ Programar envío';
}

/* Revisar al volver a la app (como mucho cada 5 minutos) y al abrir un aviso del lunes */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') googleRefresh(); });
window.addEventListener('hashchange', () => { if (location.hash === '#sugerencias') googleRefresh(true); });
