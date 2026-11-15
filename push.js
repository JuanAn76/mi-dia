'use strict';
/* ============================================================
   Mi Día — avisos (notificaciones push)
   La app le pasa al servidor de avisos la lista de avisos
   pendientes; el servidor los envía a su hora a todos los
   dispositivos donde se hayan activado.
   ============================================================ */

const Push = {
  supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  timer: null,
};
const pushConfigured = () => !!(typeof PUSH_SERVER === 'string' && PUSH_SERVER && Cloud.enabled && Cloud.user);

const REMIND_MINUTES = { at: 0, 10: 10, 60: 60, '1d': 1440 };

/* Momento exacto (en este dispositivo) en que debe sonar el aviso de una tarea */
function reminderTime(t) {
  if (!t.remind || t.remind === 'none' || !t.due || !t.time) return null;
  const [h, m] = t.time.split(':').map(Number);
  const d = parseDay(t.due);
  d.setHours(h, m, 0, 0);
  return d.getTime() - (REMIND_MINUTES[t.remind] || 0) * 60000;
}

/* Avisos pendientes: tareas sin hacer cuyo aviso aún no ha pasado (con 10 min de margen) */
function reminderList() {
  const now = Date.now();
  return state.tasks
    .filter(t => t.status !== 'done')
    .map(t => {
      const at = reminderTime(t);
      if (at === null || at < now - 10 * 60000) return null;
      const day = parseDay(t.due).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      return { id: t.id, at, title: t.title, body: `${t.time} · ${day} · ${area(t.area).short}` };
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
    .slice(0, 300);
}

async function pushCall(path, body) {
  const token = await Cloud.user.getIdToken();
  const res = await fetch(PUSH_SERVER.replace(/\/+$/, '') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error('servidor ' + res.status);
  return res.json();
}

async function pushSubscription() {
  if (!Push.supported) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/* Envía al servidor los avisos pendientes (y este dispositivo, si tiene los avisos activados) */
async function pushSync() {
  if (!pushConfigured() || !Cloud.ready) return null;
  const sub = await pushSubscription().catch(() => null);
  return pushCall('/sync', { subscription: sub ? sub.toJSON() : null, reminders: reminderList() });
}

/* Se llama tras cada cambio; espera unos segundos para agrupar varios cambios seguidos */
function pushSyncSoon() {
  if (!pushConfigured()) return;
  clearTimeout(Push.timer);
  Push.timer = setTimeout(() => { pushSync().catch(() => { /* se reintenta en el siguiente cambio */ }); }, 3000);
}

const b64uToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

/* Activa los avisos en este dispositivo (debe llamarse al pulsar un botón) */
async function pushEnable() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denegado');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await (await fetch(PUSH_SERVER.replace(/\/+$/, '') + '/key')).json();
  await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  return pushSync();
}

async function pushDisable() {
  const sub = await pushSubscription();
  if (!sub) return;
  await pushCall('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/* Bloque "Avisos" de Ajustes */
async function renderPushSettings() {
  const el = document.querySelector('#push-box');
  if (!el) return;
  const set = html => { const box = document.querySelector('#push-box'); if (box) box.innerHTML = html; };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!pushConfigured()) return set('<p class="muted">Los avisos aún no están conectados a un servidor.</p>');
  if (!Push.supported) {
    return set(`<p class="muted">${ios && !installed
      ? 'En iPhone y iPad los avisos solo funcionan con la app instalada: en Safari pulsa <b>Compartir → Añadir a pantalla de inicio</b> y ábrela desde ese icono.'
      : 'Este navegador no admite avisos.'}</p>`);
  }
  if (Notification.permission === 'denied') {
    return set('<p class="muted">Los avisos están <b>bloqueados</b> para esta app en este dispositivo. Hay que permitirlos en los ajustes del navegador o del sistema y volver a abrir la app.</p>');
  }
  const sub = await pushSubscription().catch(() => null);
  const pending = reminderList().length;
  if (sub && Notification.permission === 'granted') {
    set(`<p><b>✅ Activados en este dispositivo.</b></p><p class="muted">${pending} aviso${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} de sonar.</p>
      <button class="btn ghost full" data-action="push-test">Enviar un aviso de prueba</button>
      <button class="btn ghost full" data-action="push-off">Desactivar en este dispositivo</button>`);
  } else {
    set(`<p class="muted">Recibe una notificación a la hora que marques en el campo «Aviso» de cada tarea. Se activa por separado en cada dispositivo.</p>
      <button class="btn primary full" data-action="push-on">Activar avisos en este dispositivo</button>`);
  }
}
