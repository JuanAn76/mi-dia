'use strict';
/* ============================================================
   Mi Día — inicio de sesión y sincronización (Firebase)
   Cada tarea, proyecto, hábito y elemento de la biblioteca es un
   documento en users/{uid}/…; el registro de hábitos es un
   documento por día. Los cambios llegan en tiempo real a todos
   los dispositivos y se guardan también sin conexión.
   ============================================================ */

const Cloud = {
  enabled: !!FIREBASE_CONFIG,
  loading: !!FIREBASE_CONFIG,   // aún no se sabe si hay sesión
  failed: false,                // no se pudo cargar Firebase (sin conexión la primera vez)
  user: null, db: null, ready: false,
  synced: {},                   // lo último que se sabe que hay en la nube, por colección
  unsub: [],
};
const CLOUD_COLS = ['tasks', 'projects', 'habits', 'library'];
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';

const loadScript = src => new Promise((ok, ko) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src));
  document.head.appendChild(s);
});

/* Texto estable (claves ordenadas) para comparar documentos */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const clean = o => JSON.parse(JSON.stringify(o));   // quita los "undefined", que Firestore no admite

async function cloudInit() {
  try {
    for (const part of ['app-compat.js', 'auth-compat.js', 'firestore-compat.js']) await loadScript(FIREBASE_SDK + part);
    firebase.initializeApp(FIREBASE_CONFIG);
    Cloud.db = firebase.firestore();
    try { await Cloud.db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* navegador sin almacenamiento local: sigue funcionando con conexión */ }
    firebase.auth().onAuthStateChanged(cloudOnUser);
  } catch (e) {
    Cloud.loading = false; Cloud.failed = true;
    render();
  }
}

function cloudStop() {
  Cloud.unsub.forEach(fn => fn());
  Cloud.unsub = []; Cloud.synced = {}; Cloud.ready = false;
}

function cloudOnUser(user) {
  cloudStop();
  Cloud.loading = false;
  Cloud.user = user;
  state = emptyState();
  if (!user) { render(); return; }

  const root = Cloud.db.collection('users').doc(user.uid);
  const waiting = new Set(CLOUD_COLS.concat('habitLog'));
  const arrived = name => {
    waiting.delete(name);
    if (!waiting.size && !Cloud.ready) { Cloud.ready = true; fetchMissingCovers(render); }
    render();
    if (name === 'tasks' && typeof pushSyncSoon === 'function') pushSyncSoon();   // mantener al día los avisos pendientes
  };
  const onError = () => toast('No se pudieron leer tus datos. Revisa la conexión.');

  CLOUD_COLS.forEach(c => Cloud.unsub.push(root.collection(c).onSnapshot(snap => {
    state[c] = snap.docs.map(d => d.data());
    Cloud.synced[c] = {};
    snap.docs.forEach(d => { Cloud.synced[c][d.id] = stable(d.data()); });
    arrived(c);
  }, onError)));

  Cloud.unsub.push(root.collection('habitLog').onSnapshot(snap => {
    state.habitLog = {}; Cloud.synced.habitLog = {};
    snap.docs.forEach(d => {
      const ids = d.data().ids || [];
      if (ids.length) state.habitLog[d.id] = ids;
      Cloud.synced.habitLog[d.id] = stable(ids);
    });
    arrived('habitLog');
  }, onError));
}

/* Compara el estado con lo último sincronizado y sube solo lo que cambió */
function cloudPush() {
  if (!Cloud.ready || !Cloud.user) return;
  const root = Cloud.db.collection('users').doc(Cloud.user.uid);
  const ops = [];

  CLOUD_COLS.forEach(c => {
    const prev = Cloud.synced[c] || (Cloud.synced[c] = {});
    const seen = {};
    state[c].forEach(x => {
      const data = clean(x), s = stable(data);
      seen[x.id] = true;
      if (prev[x.id] !== s) { ops.push(b => b.set(root.collection(c).doc(x.id), data)); prev[x.id] = s; }
    });
    Object.keys(prev).forEach(id => { if (!seen[id]) { ops.push(b => b.delete(root.collection(c).doc(id))); delete prev[id]; } });
  });

  const prevLog = Cloud.synced.habitLog || (Cloud.synced.habitLog = {});
  Object.keys(state.habitLog).forEach(day => {
    const s = stable(state.habitLog[day]);
    if (prevLog[day] !== s) { const ids = state.habitLog[day].slice(); ops.push(b => b.set(root.collection('habitLog').doc(day), { ids })); prevLog[day] = s; }
  });
  Object.keys(prevLog).forEach(day => { if (!state.habitLog[day]) { ops.push(b => b.delete(root.collection('habitLog').doc(day))); delete prevLog[day]; } });

  for (let i = 0; i < ops.length; i += 400) {            // Firestore admite 500 cambios por lote
    const batch = Cloud.db.batch();
    ops.slice(i, i + 400).forEach(op => op(batch));
    batch.commit().catch(() => toast('No se pudo guardar un cambio. Se reintentará al recuperar la conexión.'));
  }
  if (typeof pushSyncSoon === 'function') pushSyncSoon();
}

/* ---------- pantalla de acceso ---------- */
const AUTH_ERRORS = {
  'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
  'auth/wrong-password': 'El correo o la contraseña no son correctos.',
  'auth/user-not-found': 'No hay ninguna cuenta con ese correo. Pulsa «Crear cuenta».',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Pulsa «Entrar».',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'Ese correo no parece válido.',
  'auth/missing-password': 'Escribe la contraseña.',
  'auth/network-request-failed': 'No hay conexión. Inténtalo de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/operation-not-allowed': 'Falta activar «Correo electrónico/contraseña» en Firebase → Authentication.',
};
const authMsg = (text, ok) => { const el = document.querySelector('#auth-msg'); if (el) { el.textContent = text; el.classList.toggle('ok', !!ok); } };
const authError = err => authMsg(AUTH_ERRORS[err && err.code] || 'No se pudo completar. Inténtalo de nuevo.');

function viewGate() {
  const logo = '<img class="gate-logo" src="icon.svg" alt="" width="84" height="84">';
  if (Cloud.loading) return `<div class="gate-box">${logo}<p class="muted">Cargando…</p></div>`;
  if (Cloud.failed) return `<div class="gate-box">${logo}<h1>Mi Día</h1><p class="muted">No se pudo conectar. Comprueba tu conexión a internet.</p><button class="btn primary full" data-action="reload">Reintentar</button></div>`;
  return `<div class="gate-box">${logo}<h1>Mi Día</h1><p class="muted">Entra para ver tus tareas, hábitos y lecturas en todos tus dispositivos.</p>
    <form id="f-auth" autocomplete="on">
      <div class="group">
        <label class="field"><span>Correo</span><input type="email" name="email" autocomplete="username" required placeholder="tu@correo.com"></label>
        <label class="field"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required minlength="6" placeholder="Mínimo 6 caracteres"></label>
      </div>
      <p id="auth-msg" role="alert"></p>
      <button class="btn primary full" type="submit" name="mode" value="login">Entrar</button>
      <button class="btn ghost full" type="submit" name="mode" value="signup">Crear cuenta</button>
      <button class="link center-link" type="button" data-action="forgot">He olvidado la contraseña</button>
    </form></div>`;
}

function authSubmit(form, submitter) {
  const f = new FormData(form), auth = firebase.auth();
  const email = f.get('email').trim(), password = f.get('password');
  authMsg('');
  const p = submitter && submitter.value === 'signup'
    ? auth.createUserWithEmailAndPassword(email, password)
    : auth.signInWithEmailAndPassword(email, password);
  p.catch(authError);
}

function authForgot() {
  const email = (document.querySelector('#f-auth [name=email]').value || '').trim();
  if (!email) { authMsg('Escribe tu correo arriba y vuelve a pulsar.'); return; }
  firebase.auth().sendPasswordResetEmail(email)
    .then(() => authMsg('Te hemos enviado un correo para cambiar la contraseña.', true))
    .catch(authError);
}

function cloudLogout() {
  cloudStop();
  firebase.auth().signOut();
}
