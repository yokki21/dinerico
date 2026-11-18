# Dinerico

Una app web instalable (PWA) para llevar el control completo de tus finanzas personales: movimientos, presupuestos, planes de ahorro, objetivos, inversiones, deudas, patrimonio neto y fiscalidad del ahorro en España.

Todo se guarda **en el dispositivo de cada persona** (IndexedDB), sin servidor ni cuentas, y si quieres se cifra con un PIN (AES-256-GCM, clave derivada con PBKDF2). Cualquiera que abra la URL tiene su propia app vacía, que configura con el asistente inicial.

## Funciones

- **Asistente inicial**: perfil, ingresos, pagas extra, día de cobro, cuentas, gastos fijos, objetivos, inversiones, reglas de ahorro y PIN. Al terminar crea los recurrentes y unos presupuestos orientativos.
- **Mes elegible**: mes natural o de nómina a nómina (con opción de adelantarlo al viernes si el cobro cae en fin de semana).
- **Movimientos**: gasto, ingreso, traspaso entre cuentas (sin duplicar), ajuste de saldo. Alta rápida con las categorías que más usas. Búsqueda y filtros.
- **Recurrentes**: nómina, recibos, suscripciones y aportaciones periódicas a fondos. Se apuntan solos o piden confirmación si el importe varía.
- **Plan del mes**: reparto sugerido y ajustable (colchón → objetivos por prioridad → inversión → margen libre), que se adapta a lo que cobras ese mes. Presupuestos por categoría con sugerencia según tu gasto real.
- **Objetivos**: con fecha y prioridad. Calcula cuánto apartar al mes y avisa si vas por detrás. El fondo de emergencia calcula su meta con tus gastos esenciales.
- **Inversiones**: fondos, ETF, acciones, cripto, planes de pensiones, depósitos y otros bienes. FIFO, traspasos entre fondos sin tributar, dividendos con retención y comisiones. Precios automáticos para cripto (CoinGecko) y para acciones/ETF (Alpha Vantage, con clave gratuita); el resto se actualiza a mano.
- **Fiscalidad**: ganancias y pérdidas realizadas por año, aviso de la regla anti-recompra (2 meses / 1 año), rendimientos del capital mobiliario, compensación del 25 % y cuota estimada con los tramos del ahorro de 2026 (editables).
- **Deudas**: préstamos e hipotecas con tabla de amortización y simulación de amortizar anticipadamente, rentings (como compromiso) y deudas con personas.
- **Patrimonio neto**: foto mensual automática, evolución y composición.
- **Informe mensual**: puntuación, qué ha ido bien, en qué te pasaste, comparación con tu media, gastos hormiga, suscripciones y sugerencias.
- **Simuladores**: interés compuesto, cuánto ahorrar para una meta, fondo de emergencia, independencia financiera (FIRE), préstamos y coste de un hábito.
- **Multidivisa**: tipos del BCE (Frankfurter) con la opción de fijarlos a mano.
- **Avisos** dentro de la app, **tema claro/oscuro**, **modo discreto** (ocultar importes), **copias de seguridad** (cifradas si hay PIN) y **exportación CSV**.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `dinerico` (público, o privado si tienes un plan que permita Pages en privados).
2. Sube el contenido de esta carpeta a la raíz del repositorio:
   ```bash
   cd dinerico
   git init
   git add .
   git commit -m "Dinerico"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/dinerico.git
   git push -u origin main
   ```
3. En el repositorio, ve a **Settings → Pages**, en *Build and deployment* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
4. En uno o dos minutos estará en `https://TU_USUARIO.github.io/dinerico/`.
5. En el móvil, ábrela y usa **Añadir a pantalla de inicio** (Chrome: menú ⋮ → *Instalar aplicación*; Safari: Compartir → *Añadir a pantalla de inicio*).

No hace falta compilar nada: son archivos estáticos (HTML, CSS y módulos JavaScript sin dependencias).

### Actualizar

Cuando cambies archivos, sube la versión en `sw.js` (`const VERSION = 'dinerico-v2'`) para que los móviles descarguen la nueva versión, y haz `git push`.

### Probar en local

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Cuenta en la nube (opcional, gratis)

Sin configurar nada, Dinerico guarda los datos solo en el dispositivo. Para que cada usuario pueda crear una cuenta (con Google o con email) y sus datos se guarden siempre y se sincronicen entre dispositivos, conecta un proyecto de Firebase (plan gratuito Spark, sin tarjeta):

1. Entra en <https://console.firebase.google.com>, pulsa **Crear un proyecto**, llámalo `dinerico` (Google Analytics no hace falta).
2. **Compilación › Authentication › Comenzar**. En *Método de inicio de sesión* activa **Google** (elige tu email de asistencia) y **Correo electrónico/contraseña**.
3. En **Authentication › Configuración › Dominios autorizados**, añade `yokki21.github.io` (o tu dominio).
4. **Compilación › Firestore Database › Crear base de datos**, ubicación en Europa (por ejemplo `eur3`), en **modo producción**.
5. En **Firestore › Reglas**, pega esto y pulsa **Publicar** (cada usuario solo puede leer y escribir sus propios datos):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
6. **⚙ Configuración del proyecto › Tus apps › Web (`</>`)**, regístrala como `Dinerico` (sin Hosting) y copia el objeto `firebaseConfig`.
7. Pégalo en `js/cloud-config.js` (`export const firebaseConfig = { ... };`), sube `VERSION` en `sw.js` y haz `git push`.

La `apiKey` de Firebase no es secreta: identifica el proyecto, y la seguridad la dan las reglas del paso 5. Si el usuario tiene PIN, los datos se suben cifrados con él (AES-256) y ni el administrador del proyecto puede leerlos.

## Datos y privacidad

- Sin cuenta, cada navegador guarda sus propios datos; para pasar a otro móvil se usa una copia (**Ajustes → Copias de seguridad**). Con cuenta se sincronizan solos.
- Borrar los datos del navegador borra los de la app. Dinerico recuerda hacer copia cada 14 días (configurable).
- Si activas el PIN y lo olvidas, los datos cifrados no se pueden recuperar.
- Lo que escribes en el asistente se guarda al momento como borrador: si sales de la app y vuelves, sigue ahí.
- Las conexiones externas son Firebase (solo si hay cuenta) y las de tipos de cambio y precios: `api.frankfurter.dev`, `api.coingecko.com` y `www.alphavantage.co` (solo si pones tu clave).

## Estructura

```
index.html            marco de la app
manifest.webmanifest  datos de instalación (PWA)
sw.js                 caché para funcionar sin conexión
css/app.css           estilos
js/app.js             arranque, bloqueo y enrutado (#/ruta)
js/store.js           guardado, cifrado y copias
js/defaults.js        estado inicial, categorías, perfiles y tramos fiscales
js/calc.js            cálculos: periodos, saldos, FIFO, impuestos, reparto, informe, avisos
js/prices.js          tipos de cambio y precios en línea
js/forms.js           formularios
js/views/*.js         pantallas
```

La fiscalidad es una estimación para planificar; no sustituye al borrador de la Agencia Tributaria ni a un asesor.
