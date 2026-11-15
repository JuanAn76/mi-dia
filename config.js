'use strict';
/* ============================================================
   Mi Día — conexión con tu proyecto de Firebase
   Mientras valga null, la app funciona solo en este dispositivo.
   Al pegar aquí la configuración de Firebase se activan el
   inicio de sesión y la sincronización entre dispositivos.
   (Estos valores no son secretos: los datos los protegen las
   reglas de Firestore, no esta configuración.)
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAHwRKwPTF7fGCFXgozddgQwNYxyc8yfMg",
  authDomain: "mi-dia-b94fb.firebaseapp.com",
  projectId: "mi-dia-b94fb",
  storageBucket: "mi-dia-b94fb.firebasestorage.app",
  messagingSenderId: "429169271352",
  appId: "1:429169271352:web:99ca957e244a61bcd93ccd"
};
/* Ejemplo:
const FIREBASE_CONFIG = {
  apiKey: "…",
  authDomain: "mi-dia-xxxxx.firebaseapp.com",
  projectId: "mi-dia-xxxxx",
  storageBucket: "mi-dia-xxxxx.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
*/
