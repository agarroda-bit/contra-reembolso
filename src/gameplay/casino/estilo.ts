// Estilos del casino «La Suerte Loca»: moqueta hortera, bombillas, neón y dorados,
// con la línea visual del juego (crema, bordes #1b1030, sombras duras).
const CSS = `
.cr-casino{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;
  user-select:none;-webkit-user-select:none;color:#1b1030;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
  background-color:#4a0d34;
  background-image:
    radial-gradient(circle at 50% 50%,#ffd23f 0 3px,transparent 4px),
    radial-gradient(circle at 0 0,#2ec4b6 0 7px,#1b1030 8px 10px,transparent 11px),
    radial-gradient(circle at 100% 0,#2ec4b6 0 7px,#1b1030 8px 10px,transparent 11px),
    radial-gradient(circle at 0 100%,#2ec4b6 0 7px,#1b1030 8px 10px,transparent 11px),
    radial-gradient(circle at 100% 100%,#2ec4b6 0 7px,#1b1030 8px 10px,transparent 11px),
    repeating-linear-gradient(45deg,rgba(255,210,63,.13) 0 2px,transparent 2px 16px),
    repeating-linear-gradient(-45deg,rgba(255,79,129,.16) 0 2px,transparent 2px 16px);
  background-size:48px 48px,48px 48px,48px 48px,48px 48px,48px 48px,auto,auto;
  animation:cc-entra .3s ease-out}
@keyframes cc-entra{from{opacity:0}to{opacity:1}}
.cr-casino::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(ellipse 60% 45% at 50% 45%,rgba(255,210,63,.22),transparent 70%),radial-gradient(ellipse at center,transparent 45%,rgba(12,4,22,.8) 100%)}
.cr-casino.cc-turbo *,.cr-casino.cc-turbo *::before,.cr-casino.cc-turbo *::after{transition:none!important;animation-duration:0s!important}
.cr-casino kbd{display:inline-block;min-width:14px;padding:1px 6px;border:2px solid currentColor;border-bottom-width:3px;border-radius:6px;font:900 11px/1.3 system-ui;text-align:center}

/* barra de arriba */
.cc-barra{position:relative;z-index:3;display:flex;align-items:center;gap:14px;height:62px;flex:none;padding:0 16px;background:#1b1030;border-bottom:4px solid #ffd23f}
.cc-neon{font:900 italic 30px/1 system-ui;color:#fff;letter-spacing:.5px;white-space:nowrap;
  text-shadow:0 0 3px #fff,0 0 9px #ff4f81,0 0 18px #ff4f81,0 0 34px #ff4f81;animation:cc-parpadeo 7s infinite}
@keyframes cc-parpadeo{0%,18%,20.5%,63%,65%,100%{opacity:1}19%,64%{opacity:.45}}
.cc-seccion{flex:1 1 auto;min-width:0;font:900 18px system-ui;color:#ffd23f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-derecha{flex:none;margin-left:auto;display:flex;align-items:center;gap:8px}
.cc-pill{background:#fff7e6;border:3px solid #ffd23f;border-radius:14px;padding:3px 12px;font:900 18px/1.05 system-ui;color:#1b1030;min-width:92px;text-align:right;white-space:nowrap}
.cc-pill small{display:block;font:800 10px/1.2 system-ui;opacity:.6;text-transform:uppercase;letter-spacing:.6px}
.cc-pill.total{background:#ffd23f;border-color:#fff7e6}
.cc-pill.sesion.pos{border-color:#2ec4b6;background:#e7fff5}
.cc-pill.sesion.neg{border-color:#ff4f81;background:#ffe3ea}
.cc-pill.cambia{animation:cc-late .5s}
@keyframes cc-late{30%{transform:scale(1.14)}}
.cc-mini{border:3px solid #ffd23f;border-radius:12px;background:#2b1d4a;color:#ffd23f;font:900 14px system-ui;height:42px;padding:0 12px;cursor:pointer;white-space:nowrap}
.cc-mini:hover{background:#3d2a66}
.cc-mini.salir{background:#ff4f81;color:#fff;border-color:#fff7e6}
.cc-mini.salir:hover{background:#ff6f95}

/* bombillas */
.cc-bombillas{position:relative;z-index:3;height:14px;flex:none;background:#2b1d4a;border-bottom:3px solid #1b1030;overflow:hidden}
.cc-bombillas::before,.cc-bombillas::after{content:'';position:absolute;inset:0;background:radial-gradient(circle,#fffbe0 0 2.5px,#ffd23f 3.5px,rgba(255,210,63,.35) 5px,transparent 6.5px) 0 50%/24px 14px repeat-x}
.cc-bombillas::after{left:12px;background-image:radial-gradient(circle,#ffe3ea 0 2.5px,#ff4f81 3.5px,rgba(255,79,129,.35) 5px,transparent 6.5px);animation:cc-bombilla 1s steps(1) infinite}
.cc-bombillas::before{animation:cc-bombilla 1s steps(1) -.5s infinite}
@keyframes cc-bombilla{0%{opacity:1}50%{opacity:.25}}
.cr-casino.fiesta .cc-bombillas::before,.cr-casino.fiesta .cc-bombillas::after{animation-duration:.16s}

/* pie con teclas */
.cc-teclas{position:relative;z-index:3;height:34px;flex:none;display:flex;align-items:center;justify-content:center;gap:18px;background:rgba(27,16,48,.92);color:#fff7e6;font:700 13px system-ui;border-top:3px solid #ffd23f;white-space:nowrap;overflow:hidden}
.cc-teclas kbd{color:#ffd23f;background:#2b1d4a;margin-right:5px}
/* ventanas estrechas: la barra de arriba y el pie encogen para que no se corte «Salir» */
@media (max-width:1180px){
  .cc-barra{gap:10px;padding:0 12px}
  .cc-neon{font-size:24px}
  .cc-seccion{font-size:15px}
  .cc-pill{min-width:74px;font-size:16px;padding:3px 9px}
  .cc-mini{padding:0 9px;font-size:13px}
  .cc-teclas{gap:12px;font-size:11.5px}
  .cc-teclas kbd{font-size:10px;padding:0 4px;margin-right:4px}
}
@media (max-width:900px){
  .cc-neon{display:none}
  .cc-teclas{gap:8px;font-size:10.5px}
}

/* escena escalable */
.cc-main{position:relative;z-index:1;flex:1;min-height:0}
.cc-escena{position:absolute;left:0;top:0;width:1200px;height:640px;transform-origin:0 0}
.cc-confeti{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6}
.cc-destello{position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0}
.cr-casino.fiesta .cc-destello{animation:cc-destello .5s steps(1) infinite;background:radial-gradient(ellipse at 50% 40%,rgba(255,210,63,.35),transparent 70%)}
.cr-casino.susto .cc-destello{animation:cc-destello .3s steps(1) 4;background:radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(108,59,209,.6))}
@keyframes cc-destello{0%{opacity:1}50%{opacity:0}}

/* botones */
.cc-boton{border:3px solid #1b1030;border-radius:16px;background:#ffd23f;color:#1b1030;font:900 18px/1.1 system-ui;padding:10px 18px;cursor:pointer;box-shadow:0 5px 0 #1b1030;transition:transform .08s,box-shadow .08s,background .15s;white-space:nowrap}
.cc-boton:hover{background:#ffe27a}
.cc-boton:active{transform:translateY(4px);box-shadow:0 1px 0 #1b1030}
.cc-boton:disabled{opacity:.4;cursor:default;transform:none;box-shadow:0 5px 0 #1b1030;filter:grayscale(.4)}
.cc-boton small{display:block;font:800 11px system-ui;opacity:.7;margin-top:2px}
.cc-boton.rosa{background:#ff4f81;color:#fff}.cc-boton.rosa:hover{background:#ff6f95}
.cc-boton.turq{background:#2ec4b6}.cc-boton.turq:hover{background:#5fd8cc}
.cc-boton.morado{background:#6c3bd1;color:#fff}.cc-boton.morado:hover{background:#8458e0}
.cc-boton.crema{background:#fff7e6}.cc-boton.crema:hover{background:#fff}
.cc-boton.gordo{font-size:26px;padding:12px 26px;border-radius:20px;box-shadow:0 7px 0 #1b1030}
.cc-boton.gordo:active{transform:translateY(6px);box-shadow:0 1px 0 #1b1030}

/* fichas */
.cc-fichas{display:flex;gap:12px}
.cc-ficha{--c:#2ec4b6;position:relative;flex:none;box-sizing:border-box;width:66px;height:66px;border-radius:50%;border:3px solid #1b1030;cursor:pointer;
  background:radial-gradient(circle,var(--c) 0 50%,#fff7e6 51% 55%,transparent 56%),repeating-conic-gradient(#fff7e6 0 12deg,var(--c) 12deg 45deg);
  box-shadow:0 5px 0 #1b1030;display:flex;align-items:center;justify-content:center;transition:transform .12s,box-shadow .12s}
.cc-ficha span{font:900 17px system-ui;color:#fff;text-shadow:0 2px 0 #1b1030,0 0 3px #1b1030}
.cc-ficha kbd{position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);color:#fff7e6;background:#1b1030}
.cc-ficha:hover{transform:translateY(-4px)}
.cc-ficha.sel{transform:translateY(-8px);box-shadow:0 0 0 4px #ffd23f,0 10px 0 #1b1030}
.cc-ficha.no{opacity:.35;cursor:not-allowed;filter:grayscale(.6)}
.cc-monton{position:relative;width:52px;height:78px}
.cc-monton i{position:absolute;left:0;width:52px;height:16px;border-radius:50%;border:2px solid #1b1030;box-sizing:border-box;
  background:linear-gradient(90deg,var(--c) 0 16%,#fff7e6 16% 26%,var(--c) 26% 74%,#fff7e6 74% 84%,var(--c) 84%)}
.cc-monton b{position:absolute;left:50%;bottom:-24px;transform:translateX(-50%);white-space:nowrap;background:#1b1030;color:#ffd23f;border-radius:10px;padding:2px 8px;font:900 14px system-ui}
.cc-monton.peq{width:30px;height:40px}
.cc-monton.peq i{width:30px;height:10px;border-width:1.5px}
.cc-monton.peq b{bottom:-18px;font-size:11px;padding:1px 5px}

/* crupier */
.cc-crupier{display:flex;align-items:flex-start;gap:14px}
.cc-cara{flex:none;width:76px;height:76px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#ffe1a8 55%,#f4b860);border:4px solid #1b1030;display:flex;align-items:center;justify-content:center;box-shadow:4px 4px 0 #1b1030;position:relative}
.cc-cara span{font-size:48px;line-height:1;transform:translateY(2px)}
.cc-cara::after{content:'🎩';position:absolute;top:-26px;left:14px;font-size:34px;transform:rotate(-12deg)}
.cc-bocadillo{position:relative;flex:1;min-width:0;background:#fff7e6;border:3px solid #1b1030;border-radius:18px;padding:8px 14px 10px;font:800 16px/1.3 system-ui;box-shadow:5px 5px 0 rgba(27,16,48,.65)}
.cc-bocadillo::before{content:'';position:absolute;left:-15px;top:22px;border-style:solid;border-width:9px 15px 9px 0;border-color:transparent #1b1030 transparent transparent}
.cc-bocadillo::after{content:'';position:absolute;left:-9px;top:25px;border-style:solid;border-width:6px 10px 6px 0;border-color:transparent #fff7e6 transparent transparent}
.cc-bocadillo .nombre{display:block;font:900 11px system-ui;text-transform:uppercase;color:#6c3bd1;letter-spacing:.8px;margin-bottom:2px}
.cc-bocadillo.pop{animation:cc-pop .35s cubic-bezier(.2,1.6,.4,1)}
@keyframes cc-pop{from{transform:scale(.9) rotate(-1.5deg)}to{transform:none}}
.cc-bocadillo.gana{background:#e7fff5}.cc-bocadillo.gana::after{border-right-color:#e7fff5}
.cc-bocadillo.pierde{background:#ffe3ea}.cc-bocadillo.pierde::after{border-right-color:#ffe3ea}
.cc-bocadillo.jackpot{background:#fff1a8}.cc-bocadillo.jackpot::after{border-right-color:#fff1a8}
.cc-bocadillo.aviso{background:#ffe9d6}.cc-bocadillo.aviso::after{border-right-color:#ffe9d6}

/* tarjeta crema genérica */
.cc-panel{background:#fff7e6;border:4px solid #1b1030;border-radius:22px;box-shadow:8px 8px 0 rgba(12,4,22,.55)}
.cc-panel h3{margin:0;font:900 17px system-ui;text-transform:uppercase;letter-spacing:.6px}

/* ───────── vestíbulo ───────── */
.cc-cartel{position:absolute;left:210px;top:6px;width:780px;height:170px;border-radius:30px;background:#1b1030;border:5px solid #ffd23f;box-shadow:10px 10px 0 rgba(12,4,22,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.cc-cartel::before{content:'';position:absolute;inset:6px;border-radius:24px;border:2px dashed rgba(255,210,63,.4)}
.cc-cartel .luces{position:absolute;inset:0;pointer-events:none}
.cc-cartel .luces i{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fffbe0;box-shadow:0 0 8px 3px #ffd23f;animation:cc-bombilla .9s steps(1) infinite}
.cc-cartel .luces i:nth-child(odd){animation-delay:-.45s;background:#ffe3ea;box-shadow:0 0 8px 3px #ff4f81}
.cc-cartel h1{margin:0;font:900 italic 74px/1 system-ui;color:#fff;letter-spacing:1px;text-shadow:0 0 4px #fff,0 0 12px #ff4f81,0 0 26px #ff4f81,0 0 50px #ff4f81,5px 5px 0 #6c3bd1;animation:cc-parpadeo 5s infinite}
.cc-cartel p{margin:10px 0 0;font:900 16px system-ui;color:#2ec4b6;letter-spacing:4px;text-shadow:0 0 10px #2ec4b6}
.cc-juegos{position:absolute;left:40px;top:200px;width:1120px;display:flex;justify-content:space-between}
.cc-juego{position:relative;width:350px;height:320px;background:#fff7e6;border:4px solid #1b1030;border-radius:26px;box-shadow:9px 9px 0 rgba(12,4,22,.6);cursor:pointer;overflow:hidden;
  transition:transform .18s cubic-bezier(.2,1.5,.4,1),box-shadow .18s;display:flex;flex-direction:column}
.cc-juego:nth-child(1){transform:rotate(-2deg)}.cc-juego:nth-child(3){transform:rotate(2deg)}
.cc-juego:hover,.cc-juego.foco{transform:translateY(-10px) rotate(0) scale(1.03);box-shadow:12px 16px 0 rgba(12,4,22,.6),0 0 0 5px #ffd23f}
.cc-juego .arte{height:170px;border-bottom:4px solid #1b1030;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cc-juego .info{padding:12px 16px;flex:1;display:flex;flex-direction:column;gap:4px}
.cc-juego h2{margin:0;font:900 23px/1.05 system-ui}
.cc-juego p{margin:0;font:650 13.5px/1.3 system-ui;opacity:.78;flex:1}
.cc-juego .pie{display:flex;align-items:center;justify-content:space-between;font:900 13px system-ui}
.cc-juego .pie kbd{background:#1b1030;color:#ffd23f;border-color:#1b1030;font-size:14px;padding:3px 9px}
.cc-juego .pie span{background:#ffd23f;border:2px solid #1b1030;border-radius:10px;padding:3px 10px}
.cc-arte-tragaperras{background:repeating-linear-gradient(90deg,#ff4f81 0 22px,#ff6f95 22px 44px)}
.cc-arte-tragaperras .mini{display:flex;gap:6px;padding:10px;background:#1b1030;border-radius:14px;border:4px solid #ffd23f;box-shadow:5px 5px 0 rgba(0,0,0,.35)}
.cc-arte-tragaperras .mini b{width:62px;height:76px;border-radius:8px;background:linear-gradient(180deg,#d9d2c3,#fffdf5 35%,#fffdf5 65%,#d9d2c3);display:flex;align-items:center;justify-content:center;font-size:44px}
.cc-arte-ruleta{background:radial-gradient(circle at 50% 50%,#18a36a,#0b6b45)}
.cc-arte-ruleta .rueda{width:150px;height:150px;border-radius:50%;border:8px solid #7a3b12;box-shadow:0 0 0 3px #1b1030,6px 6px 0 rgba(0,0,0,.35);
  background:radial-gradient(circle,#ffe9a8 0 18%,#c9981a 19% 30%,transparent 31%),
  repeating-conic-gradient(from -4.86deg,#d7263d 0 9.73deg,#1b1030 9.73deg 19.46deg);animation:cc-gira 9s linear infinite}
.cc-juego:hover .cc-arte-ruleta .rueda,.cc-juego.foco .cc-arte-ruleta .rueda{animation-duration:2s}
@keyframes cc-gira{to{transform:rotate(360deg)}}
.cc-arte-blackjack{background:radial-gradient(circle at 50% 30%,#8458e0,#4b2596)}
.cc-arte-blackjack .cc-carta{position:absolute}
.cc-juego .etiqueta{position:absolute;top:10px;right:10px;background:#ffd23f;border:3px solid #1b1030;border-radius:12px;padding:2px 9px;font:900 12px system-ui;transform:rotate(4deg);z-index:2}
.cc-vest-crupier{position:absolute;left:150px;top:548px;width:900px}
.cc-aviso-juego{position:absolute;right:20px;bottom:4px;font:800 12px system-ui;color:#fff7e6;opacity:.7}

/* ───────── tragaperras ───────── */
.cc-tp-izq{position:absolute;left:16px;top:10px;width:300px}
.cc-tp-izq .cc-panel{padding:14px 16px;margin-top:16px}
.cc-tp-apuesta{display:flex;flex-direction:column;gap:12px}
.cc-tp-apuesta .cc-fichas{flex-wrap:wrap;gap:14px 16px;padding-bottom:22px}
.cc-tp-apuesta .valor{font:900 30px system-ui}
.cc-tp-apuesta .valor small{font:800 12px system-ui;opacity:.6;display:block}
.cc-maquina{position:absolute;left:330px;top:0;width:430px;height:640px}
.cc-corona{position:relative;height:92px;margin:0 30px;border:4px solid #1b1030;border-bottom:0;border-radius:46px 46px 0 0;background:linear-gradient(180deg,#ffd23f,#ff7b54);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.cc-corona .luces{position:absolute;inset:0}
.cc-corona .luces i{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#fff;box-shadow:0 0 6px 2px #fff;animation:cc-bombilla .7s steps(1) infinite}
.cc-corona .luces i:nth-child(odd){animation-delay:-.35s}
.cc-maquina.fiesta .cc-corona .luces i{animation-duration:.14s}
.cc-corona h2{position:relative;margin:0;font:900 italic 38px/1 system-ui;color:#fff;text-shadow:3px 3px 0 #1b1030,0 0 16px #ff4f81;letter-spacing:1px}
.cc-corona small{position:relative;font:900 12px system-ui;color:#1b1030;letter-spacing:2px;margin-top:4px}
.cc-cuerpo{position:relative;border:4px solid #1b1030;border-radius:28px;background:linear-gradient(90deg,#a30f3b,#ff4f81 28%,#ff7ea0 50%,#ff4f81 72%,#a30f3b);padding:14px 18px 14px;box-shadow:10px 10px 0 rgba(12,4,22,.55)}
.cc-ventana{position:relative;display:flex;gap:10px;padding:10px;background:#1b1030;border-radius:18px;border:5px solid #ffd23f;box-shadow:inset 0 0 0 3px #c9981a}
.cc-rodillo{position:relative;width:112px;height:288px;overflow:hidden;border-radius:10px;background:linear-gradient(180deg,#cfc6b3,#fffdf5 28%,#fffdf5 72%,#cfc6b3)}
.cc-rodillo::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(27,16,48,.55),transparent 26%,transparent 74%,rgba(27,16,48,.55))}
.cc-rodillo.suspense{box-shadow:0 0 0 4px #ffd23f,0 0 22px 6px #ffd23f;animation:cc-tiembla .08s infinite}
@keyframes cc-tiembla{50%{transform:translateX(1.5px)}}
.cc-tira{position:absolute;left:0;top:0;width:100%;will-change:transform}
.cc-tira.borrosa{filter:blur(1.6px)}
.cc-simbolo{height:96px;display:flex;align-items:center;justify-content:center;font-size:60px;line-height:1;filter:drop-shadow(2px 3px 0 rgba(27,16,48,.3))}
.cc-marco-gana{position:absolute;left:10px;right:10px;top:106px;height:96px;pointer-events:none;display:flex;gap:10px}
.cc-marco-gana i{width:112px;border-radius:12px}
.cc-marco-gana i.si{box-shadow:inset 0 0 0 5px #ffd23f,0 0 18px 4px #ffd23f;animation:cc-brilla .35s steps(2) infinite}
@keyframes cc-brilla{50%{box-shadow:inset 0 0 0 5px #ff4f81,0 0 22px 6px #ff4f81}}
.cc-linea{position:absolute;left:4px;right:4px;top:50%;height:4px;margin-top:-2px;background:#ff2d55;box-shadow:0 0 8px #ff2d55;opacity:.75;pointer-events:none}
.cc-linea::before,.cc-linea::after{content:'';position:absolute;top:-9px;border-style:solid;border-width:11px 0 11px 14px;border-color:transparent transparent transparent #ff2d55}
.cc-linea::before{left:-8px}.cc-linea::after{right:-8px;transform:scaleX(-1)}
.cc-linea.gana{animation:cc-linea .25s steps(2) infinite}
@keyframes cc-linea{50%{background:#ffd23f;box-shadow:0 0 14px #ffd23f}}
.cc-lcd{margin-top:12px;height:46px;background:#0d2b1d;border:4px solid #1b1030;border-radius:12px;color:#7dff9a;font:900 23px/38px ui-monospace,Menlo,monospace;text-align:center;text-shadow:0 0 8px #7dff9a;box-shadow:inset 0 0 12px rgba(0,0,0,.8);white-space:nowrap;overflow:hidden}
.cc-lcd.rojo{color:#ff7ea0;text-shadow:0 0 8px #ff4f81}
.cc-lcd.oro{color:#ffd23f;text-shadow:0 0 10px #ffd23f;animation:cc-late .5s 3}
.cc-tp-mandos{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
.cc-tp-mandos .apu{font:900 15px system-ui;color:#fff;text-shadow:2px 2px 0 #1b1030}
.cc-tp-mandos .apu b{display:block;font-size:26px;color:#ffd23f}
.cc-girar{width:104px;height:104px;border-radius:50%;font:900 24px system-ui;padding:0;border-width:4px;background:radial-gradient(circle at 40% 30%,#fff3b0,#ffd23f 45%,#e0a800);box-shadow:0 8px 0 #1b1030}
.cc-girar:active{transform:translateY(6px);box-shadow:0 2px 0 #1b1030}
.cc-girar small{font-size:12px}
.cc-palanca{position:absolute;right:-44px;top:130px;width:44px;height:210px;perspective:500px;cursor:pointer}
.cc-palanca .base{position:absolute;left:4px;bottom:0;width:36px;height:70px;border:4px solid #1b1030;border-radius:12px;background:linear-gradient(90deg,#8a8f99,#e9edf3 45%,#8a8f99)}
.cc-palanca .brazo{position:absolute;left:15px;bottom:40px;width:14px;height:160px;transform-origin:50% 100%;border:3px solid #1b1030;border-radius:8px;background:linear-gradient(90deg,#8a8f99,#f4f6f9 45%,#8a8f99)}
.cc-palanca .brazo::before{content:'';position:absolute;left:50%;top:-30px;width:44px;height:44px;margin-left:-22px;border-radius:50%;border:4px solid #1b1030;background:radial-gradient(circle at 35% 30%,#ffb3c6,#ff2d55 50%,#a30f3b)}
.cc-palanca:hover .brazo::before{filter:brightness(1.15)}
.cc-tabla{position:absolute;right:12px;top:10px;width:370px;box-sizing:border-box;padding:14px 16px}
.cc-tabla h3{display:flex;justify-content:space-between;align-items:baseline}
.cc-tabla h3 small{font:800 11px system-ui;opacity:.6;text-transform:none;letter-spacing:0}
.cc-tabla table{width:100%;border-collapse:collapse;margin-top:6px}
.cc-tabla td{padding:3px 4px;font:800 14px system-ui;border-bottom:2px dashed rgba(27,16,48,.15);white-space:nowrap}
.cc-tabla td.s{font-size:21px;letter-spacing:1px}
.cc-tabla td.t{font-size:12.5px;font-weight:700;white-space:normal;line-height:1.15}
.cc-tabla td.m{text-align:right;font-weight:900;color:#6c3bd1}
.cc-tabla td.e{text-align:right;font-weight:900;width:84px}
.cc-tabla tr.malo td{color:#c2185b}
.cc-tabla tr.ilum td{background:#ffd23f;animation:cc-fila .25s steps(2) 6}
@keyframes cc-fila{50%{background:#fff7e6}}
.cc-tabla .rtp{margin-top:8px;font:700 11.5px/1.3 system-ui;opacity:.7}
.cc-tp-ultimos{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.cc-tp-ultimos span{background:#fff;border:2px solid #1b1030;border-radius:10px;padding:1px 6px;font:800 13px system-ui}
.cc-tp-ultimos span.g{background:#e7fff5}

.cc-siete{display:inline-block;font:900 italic 1.08em/1 system-ui;color:#ff2d55;-webkit-text-stroke:.045em #1b1030;paint-order:stroke fill;text-shadow:.05em .05em 0 #ffd23f,.1em .1em 0 #1b1030;transform:skewX(-4deg)}
.cc-tabla td.s .cc-siete{width:.75em;text-align:center}
.cc-fichas.compactas{gap:8px;flex-wrap:nowrap}
.cc-fichas.compactas .cc-ficha{width:58px;height:58px}
.cc-fichas.compactas .cc-ficha span{font-size:15px}

/* ───────── ruleta ───────── */
.cc-ru-rueda{position:absolute;left:14px;top:84px;width:430px;height:430px}
.cc-ru-rueda canvas{position:absolute;left:0;top:0;width:430px;height:430px}
.cc-ru-rueda .sombra{position:absolute;inset:6px;border-radius:50%;box-shadow:12px 14px 0 rgba(12,4,22,.5)}
.cc-ru-resultado{position:absolute;left:14px;top:4px;width:430px;height:70px;display:flex;align-items:center;justify-content:center;gap:12px}
.cc-ru-num{width:66px;height:66px;border-radius:50%;border:4px solid #1b1030;display:flex;align-items:center;justify-content:center;font:900 32px system-ui;color:#fff;box-shadow:4px 4px 0 rgba(12,4,22,.55);background:#2b1d4a}
.cc-ru-num.rojo{background:#d7263d}.cc-ru-num.negro{background:#1b1030;border-color:#ffd23f}.cc-ru-num.verde{background:#0aa36b}
.cc-ru-num.nuevo{animation:cc-pop .5s cubic-bezier(.2,1.8,.4,1)}
.cc-ru-num.girando{background:#6c3bd1;border-color:#ffd23f;animation:cc-late .6s infinite}
.cc-ru-txt{background:#fff7e6;border:3px solid #1b1030;border-radius:14px;padding:6px 12px;font:900 16px/1.2 system-ui;box-shadow:4px 4px 0 rgba(12,4,22,.55);max-width:320px}
.cc-ru-txt small{display:block;font:700 12px system-ui;opacity:.65}
.cc-ru-historial{position:absolute;left:14px;top:530px;width:430px}
.cc-ru-historial h4{margin:0 0 6px;font:900 12px system-ui;color:#fff7e6;text-transform:uppercase;letter-spacing:1px;text-align:center}
.cc-ru-historial div{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}
.cc-ru-historial span{width:30px;height:30px;border-radius:50%;border:2px solid #1b1030;display:flex;align-items:center;justify-content:center;font:900 13px system-ui;color:#fff}
.cc-ru-historial span.rojo{background:#d7263d}.cc-ru-historial span.negro{background:#1b1030;border-color:#fff7e6}.cc-ru-historial span.verde{background:#0aa36b}
.cc-ru-historial span:first-child{transform:scale(1.2);box-shadow:0 0 0 3px #ffd23f}
.cc-ru-crupier{position:absolute;left:478px;top:14px;width:700px}
.cc-tapete{position:absolute;left:462px;top:118px;width:716px;height:334px;background:radial-gradient(ellipse at 50% 40%,#18a36a,#0b6b45 75%);border:5px solid #c9981a;border-radius:20px;box-shadow:inset 0 0 0 3px #1b1030,9px 9px 0 rgba(12,4,22,.55)}
.cc-tapete .zona{position:absolute;left:16px;top:16px;width:684px;height:302px}
.cc-casilla{position:absolute;box-sizing:border-box;border:2px solid rgba(255,247,230,.85);display:flex;align-items:center;justify-content:center;color:#fff;font:900 19px system-ui;cursor:pointer;transition:background .15s,filter .15s}
.cc-casilla:hover{filter:brightness(1.25)}
.cc-casilla.rojo{background:#d7263d}.cc-casilla.negro{background:#1b1030}.cc-casilla.verde{background:#0aa36b;border-radius:30px 0 0 30px}
.cc-casilla.fuera{background:rgba(255,255,255,.06);font-size:15px;letter-spacing:.5px}
.cc-casilla.fuera:hover{background:rgba(255,255,255,.16)}
.cc-casilla .rombo{width:30px;height:30px;transform:rotate(45deg);border:2px solid #fff7e6}
.cc-casilla.cursor{outline:4px dashed #ffd23f;outline-offset:-5px;z-index:3}
.cc-casilla.ganadora{z-index:2;animation:cc-casilla .4s steps(2) infinite}
@keyframes cc-casilla{50%{box-shadow:inset 0 0 0 5px #ffd23f,0 0 16px 4px #ffd23f}}
.cc-fmesa{--c:#2ec4b6;position:absolute;left:50%;top:50%;width:36px;height:36px;margin:-20px 0 0 -18px;border-radius:50%;box-sizing:border-box;border:2px solid #1b1030;
  background:radial-gradient(circle,var(--c) 0 50%,#fff7e6 51% 56%,transparent 57%),repeating-conic-gradient(#fff7e6 0 13deg,var(--c) 13deg 45deg);
  display:flex;align-items:center;justify-content:center;font:900 11.5px/1 system-ui;letter-spacing:-.3px;color:#fff;text-shadow:0 1px 0 #1b1030,0 0 2px #1b1030,0 0 2px #1b1030;
  box-shadow:0 3px 0 #1b1030;pointer-events:none;z-index:4;transition:opacity .5s,transform .5s,box-shadow .3s}
.cc-fmesa.dos{box-shadow:0 3px 0 #1b1030,0 5px 0 var(--c),0 7px 0 #1b1030}
.cc-fmesa.tres{box-shadow:0 3px 0 #1b1030,0 5px 0 var(--c),0 7px 0 #1b1030,0 9px 0 var(--c),0 11px 0 #1b1030}
.cc-fmesa.gana{box-shadow:0 0 0 3px #ffd23f,0 0 14px 5px #ffd23f;animation:cc-late .6s 2}
.cc-fmesa.pierde{opacity:0;transform:translateY(-40px) scale(.5)}
.cc-dolly{position:absolute;left:50%;top:-6px;transform:translateX(-50%);font-size:28px;z-index:5;animation:cc-dolly .5s cubic-bezier(.2,1.8,.4,1);pointer-events:none;filter:drop-shadow(2px 2px 0 #1b1030)}
@keyframes cc-dolly{from{transform:translate(-50%,-40px);opacity:0}}
.cc-ru-mandos{position:absolute;left:462px;top:466px;width:716px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.cc-ru-mandos .cc-fichas{padding-bottom:24px}
.cc-ru-mandos .tot{font:900 13px system-ui;color:#fff7e6;text-align:center;min-width:110px}
.cc-ru-mandos .tot b{display:block;font-size:26px;color:#ffd23f;text-shadow:2px 2px 0 #1b1030}
.cc-ru-mandos .bots{display:flex;gap:8px;align-items:flex-start}
.cc-ru-mandos .col{display:flex;flex-direction:column;gap:6px}
.cc-ru-mandos .cc-boton.peque{font-size:13px;padding:4px 10px;border-radius:12px;box-shadow:0 4px 0 #1b1030;text-align:left}
.cc-ru-mandos .cc-boton.gordo{font-size:22px;padding:12px 18px}

/* ───────── blackjack ───────── */
.cc-mesa{position:absolute;left:30px;top:6px;width:1140px;height:626px;box-sizing:border-box;border-radius:44px 44px 560px 560px / 44px 44px 330px 330px;
  background:radial-gradient(ellipse at 50% 28%,#1bb574,#0b6b45 58%,#074a30);border:12px solid #6b3410;box-shadow:inset 0 0 0 4px #c9981a,inset 0 0 60px rgba(0,0,0,.45),10px 10px 0 rgba(12,4,22,.55)}
.cc-bj-svg{position:absolute;left:0;top:0;width:1200px;height:640px;pointer-events:none}
.cc-bj-crupier{position:absolute;left:330px;top:18px;width:560px}
.cc-zapato{position:absolute;left:944px;top:28px;width:120px;height:120px;transform:rotate(12deg)}
.cc-zapato .caja{position:absolute;inset:18px 0 0 0;border:4px solid #1b1030;border-radius:14px 14px 14px 30px;background:linear-gradient(135deg,#3d2a66,#1b1030);box-shadow:5px 5px 0 rgba(0,0,0,.35)}
.cc-zapato .mazo{position:absolute;left:14px;top:4px;width:72px;height:96px;border-radius:8px;border:3px solid #1b1030;background:repeating-linear-gradient(45deg,#ff4f81 0 6px,#6c3bd1 6px 12px)}
.cc-zapato small{position:absolute;left:0;right:0;bottom:-26px;text-align:center;font:900 12px system-ui;color:#fff7e6}
.cc-descarte{position:absolute;left:90px;top:40px;width:100px;height:100px;border:3px dashed rgba(255,247,230,.35);border-radius:14px;transform:rotate(-10deg)}
.cc-bj-total{position:absolute;min-width:46px;height:40px;padding:0 10px;border-radius:20px;border:3px solid #1b1030;background:#fff7e6;font:900 21px/34px system-ui;text-align:center;box-shadow:3px 3px 0 rgba(0,0,0,.35);transition:opacity .2s;box-sizing:border-box}
.cc-bj-total.pasa{background:#ff4f81;color:#fff}.cc-bj-total.bj{background:#ffd23f}
.cc-bj-total small{font:800 11px system-ui;opacity:.6;margin-left:3px}
.cc-bj-etq{position:absolute;font:900 13px system-ui;color:#fff7e6;letter-spacing:2px;text-transform:uppercase;text-shadow:2px 2px 0 rgba(12,4,22,.6);transition:opacity .2s;white-space:nowrap}
.cc-bj-etq.tu{color:#ffd23f}
.cc-circulo{position:absolute;left:545px;top:488px;width:110px;height:110px;border-radius:50%;border:4px dashed rgba(255,247,230,.7);display:flex;align-items:flex-end;justify-content:center}
.cc-circulo .cc-monton{margin-bottom:34px}
.cc-circulo .vacio{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font:900 12px system-ui;color:#fff7e6;opacity:.75}
.cc-bj-rack{position:absolute;left:36px;top:494px;width:330px;padding:12px 16px 32px;box-sizing:border-box}
.cc-bj-rack h3{margin-bottom:10px}
.cc-bj-acciones{position:absolute;left:814px;top:494px;width:352px;min-height:126px;box-sizing:border-box;padding:12px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-content:center}
.cc-bj-acciones .cc-boton{font-size:16px;padding:8px 12px}
.cc-bj-acciones .cc-boton.gordo{font-size:21px;padding:11px 18px}
.cc-bj-acciones .cc-boton kbd{margin-left:6px;font-size:11px}
.cc-cartel-bj{position:absolute;left:300px;top:250px;width:600px;text-align:center;pointer-events:none;z-index:40}
.cc-cartel-bj div{display:inline-block;padding:7px 26px 8px;border:4px solid #1b1030;border-radius:22px;font:900 34px/1.1 system-ui;box-shadow:7px 7px 0 rgba(12,4,22,.6);animation:cc-pop .45s cubic-bezier(.2,1.8,.4,1);background:#fff7e6}
.cc-cartel-bj div small{display:block;font:800 15px system-ui;opacity:.75;margin-top:4px}
.cc-cartel-bj .gana{background:#2ec4b6}.cc-cartel-bj .pierde{background:#ff4f81;color:#fff}.cc-cartel-bj .empate{background:#fff7e6}.cc-cartel-bj .bj{background:#ffd23f}
.cc-barajando{position:absolute;left:0;right:0;top:250px;text-align:center;font:900 30px system-ui;color:#ffd23f;text-shadow:3px 3px 0 #1b1030;pointer-events:none;z-index:41}

/* cartas */
.cc-carta{position:absolute;width:100px;height:140px;perspective:900px;transition:left .3s ease,top .3s ease}
.cc-carta .gira{position:absolute;inset:0;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .5s cubic-bezier(.3,1.35,.5,1)}
.cc-carta.oculta .gira{transform:rotateY(180deg)}
.cc-carta .cara,.cc-carta .dorso{position:absolute;inset:0;border-radius:11px;border:2px solid #1b1030;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:3px 4px 0 rgba(0,0,0,.35);overflow:hidden}
.cc-carta .cara{background:linear-gradient(160deg,#fff,#fff7e6);color:#1b1030}
.cc-carta.roja .cara{color:#d7263d}
.cc-carta .dorso{transform:rotateY(180deg);background:#fff7e6;padding:6px;box-sizing:border-box}
.cc-carta .dorso i{position:absolute;inset:6px;border-radius:7px;border:2px solid #1b1030;background:radial-gradient(circle,#ffd23f 0 14px,#1b1030 15px 17px,transparent 18px),repeating-linear-gradient(45deg,#ff4f81 0 7px,#6c3bd1 7px 14px);display:flex;align-items:center;justify-content:center;font-size:18px;font-style:normal}
.cc-carta .esq{position:absolute;display:flex;flex-direction:column;align-items:center;font:900 20px/1 system-ui;width:20px;letter-spacing:-1px}
.cc-carta .esq i{font-style:normal;font-size:17px;margin-top:1px;font-family:'Apple Symbols','Segoe UI Symbol',system-ui}
.cc-carta .esq.a{left:4px;top:6px}.cc-carta .esq.b{right:4px;bottom:6px;transform:rotate(180deg)}
.cc-carta .pip{position:absolute;font-size:23px;line-height:1;transform:translate(-50%,-50%);font-family:'Apple Symbols','Segoe UI Symbol',system-ui}
.cc-carta .pip.inv{transform:translate(-50%,-50%) rotate(180deg)}
.cc-carta .as{position:absolute;left:50%;top:50%;transform:translate(-50%,-52%);font-size:62px;line-height:1;font-family:'Apple Symbols','Segoe UI Symbol',system-ui}
.cc-carta .figura{position:absolute;left:24px;right:24px;top:24px;bottom:24px;border:2px solid currentColor;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:repeating-linear-gradient(45deg,rgba(255,210,63,.35) 0 5px,rgba(255,210,63,.1) 5px 10px)}
.cc-carta .figura span{font-size:38px;line-height:1}
.cc-carta .figura b{font:900 13px system-ui;margin-top:2px}
.cc-carta.brilla .cara{box-shadow:0 0 0 4px #ffd23f,0 0 18px 4px #ffd23f}
`;

let puesto = false;

export function ponerEstilos() {
  if (puesto) return;
  puesto = true;
  const st = document.createElement('style');
  st.id = 'cr-casino-estilos';
  st.textContent = CSS;
  document.head.appendChild(st);
}
