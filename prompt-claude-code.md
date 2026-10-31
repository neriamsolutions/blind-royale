# Prompt para Claude Code: versión vendible de Poker Nights

> Cómo usarlo: crea una carpeta nueva (por ejemplo `poker-app`), pon dentro el archivo `poker-nights-original.html`, abre Claude Code en esa carpeta y pega todo lo que está debajo de la línea.

---

## Contexto

Soy Ramon, fundador de nerIAm (agencia de IA). Construí una app web para organizar torneos y juegos cash de poker en casa con mis amigos. Hoy vive como un artefacto de Claude en un solo archivo: `poker-nights-original.html` (~200 KB, HTML + CSS + JS sin frameworks).

Quiero convertirla en un producto que pueda vender a ~$9.99 USD como pago único, publicado en Netlify (ya tengo cuenta; ahí está mi app Habit Arena).

**Qué hace la app hoy:** reloj de ciegas con estructura editable y breaks, modo torneo y modo cash, banca (buy-ins, rebuys, cash-outs, cuadre), mesa visual con asientos y eliminaciones (con una animación épica de eliminación), pagos y deal entre finalistas, pantalla de campeón, historial de torneos, ranking, récords, perfil por jugador, y textos en español e inglés. Lleva la firma de mi marca nerIAm.

**Cómo depende de Claude hoy:**
- Guarda casi todo en `localStorage` (funciones `load`/`save`, llaves `hgclock.*`).
- Además usa `window.claude.use("db")` y `window.claude.use("user")`, siempre con chequeo `if(!window.claude...) return;`, para tres cosas: (1) sincronizar el historial en la colección `tournaments`, (2) el "modo amigo" (`enterFriendMode`, `ME.canEdit`, vínculos en `config/players`) y (3) la vista **En vivo** (`livePush`, `liveListen`, documento `live/now`).
- Sin `window.claude` la app ya debería funcionar sola en un dispositivo, pero hay que confirmarlo y limpiar lo que sobra.

## Objetivo de esta fase (v1)

Una **PWA independiente, de un solo dispositivo**, sin ninguna dependencia de Claude, lista para publicar en Netlify y vender.

## Tareas

1. **Primero lee el archivo completo y dame un plan corto** (qué vas a quitar, qué vas a cambiar y la estructura de carpetas). Espera mi OK antes de editar.
2. **Estructura del proyecto:** separa en `index.html`, `styles.css`, `app.js` (o pocos módulos si ayuda a mantenerlo), sin frameworks ni paso de build. Inicia un repo git con commits pequeños y claros.
3. **Quitar Claude:** elimina todo el código de `window.claude`, el modo amigo, los vínculos de cuentas y la vista En vivo. Deja un comentario `// TODO v2: En vivo` donde estaba esa lógica para retomarla después. Que no quede ninguna pestaña o botón que no funcione.
4. **Datos locales robustos:** todo en `localStorage` con try/catch (ya existe el patrón). Agrega en Ajustes:
   - **Exportar respaldo** (descarga un `.json` con config, estado, favoritos e historial).
   - **Importar respaldo** (con confirmación antes de sobrescribir).
   - Versión de esquema en los datos para poder migrar en el futuro.
5. **PWA:** `manifest.webmanifest` (nombre, íconos 192 y 512, `display: standalone`, colores del tema oscuro), `service-worker.js` que cachee todo para que funcione **sin internet**, y que se pueda instalar en iPhone, Android y tablet. Ojo: las Google Fonts deben quedar cacheadas o descargadas localmente en `/fonts` para que funcione offline.
6. **Nombre configurable:** el nombre "Poker Nights" ya lo usa otra empresa, así que voy a cambiarlo. Centraliza el nombre de la app en **una sola constante** (y en el manifest) para cambiarlo fácil. Por ahora usa el placeholder `APP_NAME = "Poker Nights"`. Mantén la firma "by nerIAm" tal como está (isotipo Eclipse, Schibsted Grotesk ExtraBold, "IA" en azul #3B82F6).
7. **Netlify:** agrega `netlify.toml` con headers correctos para el service worker (sin caché agresivo en `service-worker.js`) y explícame paso a paso cómo publicarlo en un subdominio `.netlify.app` gratis.
8. **Página legal mínima:** `privacidad.html` simple en español e inglés: la app no recolecta datos, todo se queda en el dispositivo, no maneja dinero ni apuestas, solo registra resultados.

## Reglas

- **No cambies el diseño ni las animaciones.** El look (fieltro, neón, cartas, animación de eliminación) es lo que la hace vender. Solo cambia lo necesario.
- No agregues dependencias externas salvo que sea indispensable; si propones alguna, explícame por qué.
- Todo texto nuevo debe existir en español e inglés usando el sistema de idioma que ya tiene la app.
- Debe verse bien en teléfono (desde 360 px), tablet y TV.

## Criterios de aceptación (pruébalos y dime el resultado)

- [ ] `grep -n "window.claude"` no encuentra nada.
- [ ] La app abre sin errores en la consola.
- [ ] Puedo correr un torneo completo de 6 jugadores: reloj, rebuy, eliminaciones, campeón, y queda guardado en el historial y en los perfiles.
- [ ] Puedo correr una sesión de cash con buy-ins y cash-outs y el cuadre da cero.
- [ ] Recargo la página y no se pierde nada.
- [ ] Exporto un respaldo, borro los datos, lo importo y todo regresa.
- [ ] En modo avión (offline) la app abre y funciona después de la primera visita.
- [ ] Lighthouse marca la app como instalable (PWA).

Si puedes, usa Playwright para probar estos puntos automáticamente.

## Fuera de alcance por ahora (v2, no lo hagas todavía)

- Cobro con Lemon Squeezy y claves de licencia.
- Vista En vivo para jugadores con cuentas (Supabase o Firebase).
- Página de venta (landing).
- Publicar en App Store o Google Play.

Al terminar, dame un resumen corto: qué cambió, qué probaste y qué falta para v2.
