// App de Android (Capacitor, carpeta android-app/). Se carga antes de app.js en todas partes: en el
// navegador, la PWA o el iPhone no existe window.Capacitor y este archivo no hace nada.
// Dentro de la app instala window.BRNative y habla con los plugins por el puente que Capacitor
// inyecta en el WebView (nativePromise / nativeCallback), sin npm ni build: el sitio sigue siendo una
// carpeta estática.
(function(){
  var C=window.Capacitor;
  if(!C||typeof C.nativePromise!=="function"||!(C.isNativePlatform&&C.isNativePlatform())) return;
  function call(p,m,o){return C.nativePromise(p,m,o||{});}
  function on(p,ev,fn){try{C.nativeCallback(p,"addListener",{eventName:ev},fn);}catch(e){}}
  var BASE_ID=2000, MAX=12, asked=false;

  var N=window.BRNative={
    // navigator.vibrate no es confiable en el WebView; el plugin sí
    vibrate:function(ms){call("Haptics","vibrate",{duration:Math.max(1,Math.min(+ms||30,600))}).catch(function(){});},
    // La Wake Lock API no existe en el WebView de Android: pantalla encendida vía plugin
    keepAwake:function(on){call("KeepAwake",on?"keepAwake":"allowSleep").catch(function(){});},
    // Un WebView no puede "descargar": se escribe en caché y se pasa al menú Compartir (Drive, correo, WhatsApp…)
    saveFile:function(name,text,title){
      return call("Filesystem","writeFile",{path:name,data:text,directory:"CACHE",encoding:"utf8"}).then(function(r){
        return call("Share","share",{title:title,files:[r.uri],dialogTitle:title});
      }).then(function(){return true;},function(e){return /cancel/i.test((e&&e.message)||"");}); // cerrar el menú cuenta como cancelar, no como error
    },
    // Android 13+ pide permiso para notificar; se pregunta la primera vez que arranca el reloj
    askNotify:function(){
      if(asked) return; asked=true;
      call("LocalNotifications","checkPermissions").then(function(r){if(!r||r.display!=="granted") return call("LocalNotifications","requestPermissions");}).catch(function(){});
    },
    upcoming:null, // app.js: () => [{at,title,body}] con los próximos cambios de nivel
    onBack:null    // app.js: () => true si el botón Atrás cerró algo
  };

  // Con la app a la vista el reloj ya avisa (sonido y pantalla de nivel). Los avisos del sistema son
  // para cuando el anfitrión sale de la app o se apaga la pantalla: se agendan al salir y se borran al volver.
  function ids(){var a=[];for(var i=0;i<MAX;i++)a.push({id:BASE_ID+i});return a;}
  function clear(){return call("LocalNotifications","cancel",{notifications:ids()}).catch(function(){});}
  function arm(){
    var now=Date.now(), list=((typeof N.upcoming==="function"&&N.upcoming())||[]).filter(function(x){return x.at>now+1000;}).slice(0,MAX);
    clear().then(function(){
      if(!list.length) return;
      return call("LocalNotifications","schedule",{notifications:list.map(function(x,i){
        // Sin alarma exacta (ver AndroidManifest.xml): Android puede retrasarlo un poco con la pantalla apagada
        return {id:BASE_ID+i,title:x.title,body:x.body,schedule:{at:new Date(x.at).toISOString(),allowWhileIdle:true}};
      })});
    }).catch(function(){});
  }
  var away=false;
  function state(active){if(active===!away) return; away=!active; away?arm():clear();}
  on("App","appStateChange",function(s){state(!!(s&&s.isActive));});
  document.addEventListener("visibilitychange",function(){state(document.visibilityState==="visible");});

  // Atrás cierra la capa de encima; si no hay nada que cerrar, minimiza en vez de cerrar la app (el reloj sigue)
  on("App","backButton",function(){if(!(typeof N.onBack==="function"&&N.onBack())) call("App","minimizeApp").catch(function(){});});
  clear();
})();
