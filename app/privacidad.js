// Muestra el idioma que eligió el usuario en la app (misma llave hgclock.lang), o ?lang=es|en.
(()=>{let l="en";try{l=localStorage.getItem("hgclock.lang")||"en"}catch(e){}
  const q=new URLSearchParams(location.search).get("lang"); if(q==="es"||q==="en") l=q;
  const b=document.getElementById("lang");
  const set=x=>{l=x;document.documentElement.lang=x;document.title=(x==="es"?"Privacidad":"Privacy")+" · Blind Royale";
    document.querySelectorAll("[data-l]").forEach(s=>s.hidden=s.dataset.l!==x);
    b.textContent=x==="en"?"ES":"EN";b.setAttribute("aria-label",x==="en"?"Cambiar a español":"Switch to English");};
  b.onclick=()=>set(l==="en"?"es":"en"); set(l);})();
