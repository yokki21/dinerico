// Configuración de Firebase para la cuenta en la nube (proyecto «dinerico»).
// Estos datos no son secretos: identifican el proyecto. La seguridad la dan las reglas de Firestore,
// que solo dejan a cada usuario leer y escribir sus propios datos.
// Si se deja en null, Dinerico funciona solo en el dispositivo y no muestra la opción de cuenta.
export const firebaseConfig = {
  apiKey: 'AIzaSyCMXcyaguvEigcU0P51AAFxY9TC2FviK08',
  authDomain: 'dinerico.firebaseapp.com',
  projectId: 'dinerico',
  storageBucket: 'dinerico.firebasestorage.app',
  messagingSenderId: '1039252816083',
  appId: '1:1039252816083:web:068447c1c1ee02f2779426',
};
