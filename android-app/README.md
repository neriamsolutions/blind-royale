# `android-app/` — la app de Google Play (Capacitor)

La app de Play es **la misma** de `app/`, empaquetada dentro de una app Android con
[Capacitor](https://capacitorjs.com). Es la misma receta que Habit Arena (`habitquest/android-app/`).
Paquete `com.neriamsolutions.blindroyale`.

## Qué cambia frente a la web

| | Web (Netlify) | App de Android |
|---|---|---|
| La app | se descarga de Netlify; offline con service worker | va **dentro** del APK; sin service worker |
| Pantalla encendida | Wake Lock del navegador | plugin `KeepAwake` |
| Suben las ciegas con la app cerrada o la pantalla apagada | nada | **notificación local** por cada cambio de nivel |
| Exportar respaldo | descarga un `.json` | menú **Compartir** (Drive, correo, WhatsApp…) |
| Eliminación / cambio de nivel | — | vibración |
| Botón Atrás | — | cierra la capa de encima; si no hay, minimiza (el reloj sigue) |
| "Instalar app" | se ofrece | oculto |
| Actualizar | cada `git push` llega solo | cada cambio es un `.aab` nuevo subido a Play |

El código que habla con Android vive en **`app/native.js`** (en la web no hace nada) y en los
puntos de `app/app.js` que usan `NATIVE`.

## ⚠️ Nunca en Google Drive

npm corrompe archivos dentro de Drive. Para compilar, **clona el repo en C:\\**, por ejemplo
`C:\dev\blind-royale`. La llave de firma (`.keystore`) tampoco va al repo.

## Probar en tu teléfono sin pasar por Play

Cada push a `main` que toca `android-app/` o `app/` compila en GitHub un **APK de prueba**:
pestaña **Actions** del repo → la corrida más reciente de *Android build* → **Artifacts** →
`blind-royale-debug-apk`. Se instala con el paquete `com.neriamsolutions.blindroyale.debug`, así que
convive con la app de Play. Android pedirá permitir "instalar apps de fuentes desconocidas".

## Compilar el `.aab` para Play (en la laptop)

Primera vez (1 a 2 horas, casi todo es descarga):

1. Instala **Node.js 22** (nodejs.org) y **Android Studio** (developer.android.com/studio).
2. En una terminal:
   ```
   cd C:\dev
   git clone https://github.com/neriamsolutions/blind-royale.git
   cd blind-royale\android-app
   npm install
   ```
3. Crea la **llave de firma de Blind Royale** (una sola vez, propia: no reutilices la de Habit
   Arena). Android Studio → Build → Generate Signed App Bundle → *Create new…*. Guarda el
   `.keystore` y sus contraseñas fuera del repo y con respaldo: sin ella no se puede actualizar la app.

Cada versión:

1. `git pull` en `C:\dev\blind-royale`.
2. Sube `versionCode` (1 → 2) y `versionName` ("1.0" → "1.1") en `android/app/build.gradle`.
   Play rechaza un número que ya usaste.
3. En `C:\dev\blind-royale\android-app`:
   ```
   npx cap sync android
   npx cap open android
   ```
4. **Build → Generate Signed App Bundle or APK → Android App Bundle**, con tu `.keystore`, variante
   **release**.
5. El archivo queda en `android/app/release/app-release.aab` → Play Console → Crear versión.

## Íconos

Fuente en `android-app/assets/` (la ficha del logo, la misma de `app/icons/`). Si cambia:
```
npx @capacitor/assets generate --android --iconBackgroundColor "#07120f" --splashBackgroundColor "#07120f"
```
El ícono de las notificaciones es `android/app/src/main/res/drawable/ic_stat_icon.xml` (la pica,
de un solo color como pide Android).

## Decisiones que no hay que deshacer

- **App empaquetada, no `server.url`.** Cargar la web remota dentro de la app es "un sitio en una
  caja", lo que Google rechaza por funcionalidad mínima.
- **Sin alarmas exactas.** El plugin de notificaciones pide `SCHEDULE_EXACT_ALARM`; se quita en
  `AndroidManifest.xml`. Android 14+ la niega por defecto y Play revisa su uso. El aviso es un
  respaldo: con el reloj corriendo la app mantiene la pantalla encendida.
- **Los avisos se agendan solo al salir de la app** y se borran al volver: con la app a la vista,
  el reloj ya suena y muestra el cambio de nivel.
