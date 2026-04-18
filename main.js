(function () {
  'use strict';

  /* ════════════════════════════════════════════════
     MATRIX RAIN
     Offscreen canvas → dark: direct blit
                      → light: screen-blend onto teal
  ════════════════════════════════════════════════ */
  var CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:<>|=+-*";
  var rainEl  = document.getElementById("rain");
  var ctx     = rainEl.getContext("2d");
  var ofc     = document.createElement("canvas");
  var octx    = ofc.getContext("2d");

  var FS      = 36;
  var cols    = [];
  var raf;
  var DPR     = 1;
  var rainOn  = true;
  var isDark  = true;
  var SPEEDS  = [0.5, 1, 2];   // slow / normal / fast
  var speedIdx = 1;
  var BG_LIGHT = [127, 217, 208];

  // FPS counter
  var fpsFrames = 0, fpsLast = performance.now(), fpsVal = 0;

  function rc() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }

  function makeCol(h, scatter) {
    var sp = SPEEDS[speedIdx];
    return {
      y:        scatter ? Math.random() * h * 1.5 - h * 0.4 : -FS * (2 + Math.random() * 6),
      speed:    (0.8 + Math.random() * 2.0) * sp,
      trailLen: Math.floor(10 + Math.random() * 20),
      trail:    [],
      mt: 0,
      mr: Math.floor(2 + Math.random() * 5),
      bright: Math.random() < 0.10,
    };
  }

  function initRain() {
    DPR = window.devicePixelRatio || 1;
    var w = window.innerWidth, h = window.innerHeight;
    rainEl.width  = Math.round(w * DPR); rainEl.height  = Math.round(h * DPR);
    rainEl.style.width = w + "px";       rainEl.style.height = h + "px";
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(DPR, DPR);
    ofc.width = rainEl.width; ofc.height = rainEl.height;
    octx.setTransform(1,0,0,1,0,0); octx.scale(DPR, DPR);
    octx.fillStyle = "#000"; octx.fillRect(0, 0, w, h);
    cols = [];
    var n = Math.ceil(w / FS);
    for (var i = 0; i < n; i++) cols.push(makeCol(h, true));
    var hc = document.getElementById("hud-cols");
    if (hc) hc.textContent = "COLS · " + n;
  }

  function drawRain() {
    var w = rainEl.width / DPR, h = rainEl.height / DPR;

    // FPS
    fpsFrames++;
    var now = performance.now();
    if (now - fpsLast >= 1000) {
      fpsVal = Math.round(fpsFrames * 1000 / (now - fpsLast));
      fpsFrames = 0; fpsLast = now;
      var fe = document.getElementById("hud-fps");
      if (fe) fe.textContent = "FPS · " + fpsVal;
    }

    octx.fillStyle = "rgba(0,0,0,0.06)";
    octx.fillRect(0, 0, w, h);
    octx.font = FS + "px 'Courier Prime','Courier New',monospace";
    octx.textBaseline = "top";

    for (var i = 0; i < cols.length; i++) {
      var col = cols[i], x = i * FS;
      col.mt++;
      if (col.mt >= col.mr) {
        col.mt = 0;
        col.trail.push(rc());
        if (col.trail.length > col.trailLen) col.trail.shift();
      }
      if (!col.trail.length) col.trail.push(rc());
      var tL = col.trail.length;
      for (var t = 0; t < tL; t++) {
        var gy = col.y - (tL - 1 - t) * FS;
        if (gy < -FS || gy > h) continue;
        var frac = t / Math.max(1, tL - 1);
        var r, g, b, alpha;
        if (t === tL - 1) {
          r = col.bright ? 255 : 180; g = 255; b = col.bright ? 255 : 180; alpha = 1;
          octx.shadowColor = "rgba(100,255,140,1)"; octx.shadowBlur = 14;
        } else if (t >= tL - 4) {
          var nf = (t - (tL - 4)) / 3;
          r = Math.round(nf * 180); g = Math.round(200 + nf * 55); b = Math.round(60 + nf * 120);
          alpha = 0.5 + nf * 0.5;
          octx.shadowColor = "rgba(0,255,80,.55)"; octx.shadowBlur = 7;
        } else {
          var tf = frac * frac;
          r = 0; g = Math.round(80 + tf * 120); b = Math.round(20 + tf * 40);
          alpha = 0.06 + tf * 0.65; octx.shadowBlur = 0;
        }
        octx.fillStyle = "rgba("+r+","+g+","+b+","+alpha+")";
        octx.fillText(col.trail[t], x, gy);
        octx.shadowBlur = 0;
      }
      col.y += col.speed;
      if (col.y > h + FS * 2) cols[i] = makeCol(h, false);
    }

    if (isDark) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(ofc, 0, 0, w, h);
    } else {
      ctx.fillStyle = "rgb("+BG_LIGHT.join(",")+")";
      ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalCompositeOperation = "screen";
      ctx.drawImage(ofc, 0, 0, w, h);
      ctx.restore();
    }
    raf = requestAnimationFrame(drawRain);
  }

  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, rainEl.width, rainEl.height);
  initRain(); drawRain();

  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      cancelAnimationFrame(raf);
      ctx.setTransform(1,0,0,1,0,0); octx.setTransform(1,0,0,1,0,0);
      initRain(); drawRain();
    }, 140);
  });

  /* ════════════════════════════════════════════════
     IDENTITY SCRAMBLE — 5s cycle
  ════════════════════════════════════════════════ */
  var TARGET = "qwertlexi";
  var POOL   = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*█░▒≠≈∞∂∑";
  var CLRS   = ["#ff3b6b","#ff8c00","#ffe600","#00e5ff","#b44fff","#39ff14","#ff00cc","#00bfff"];
  var markEl = document.getElementById("mark-text");
  var glitchT = null;
  function rf(s)  { return s[Math.floor(Math.random() * s.length)]; }
  function rcol() { return CLRS[Math.floor(Math.random() * CLRS.length)]; }
  function renderMark(chars, colors) {
    if (!markEl) return;
    var h = "";
    for (var i = 0; i < chars.length; i++)
      h += colors[i] ? '<span style="color:' + colors[i] + '">' + chars[i] + '</span>' : chars[i];
    markEl.innerHTML = h;
  }
  function scrambleOut(done) {
    var n = TARGET.length, chars = TARGET.split(""), colors = new Array(n).fill(null);
    var unlocked = new Array(n).fill(false), frame = 0;
    function tick() {
      frame++;
      var done2 = true;
      for (var j = 0; j < n; j++) {
        if (!unlocked[j]) {
          done2 = false;
          if (frame >= j * 5 && Math.random() < .5) { unlocked[j]=true; chars[j]=rf(POOL); colors[j]=rcol(); }
        } else { chars[j]=rf(POOL); colors[j]=rcol(); }
      }
      if (frame >= n * 5 + 20) { for (var k=0;k<n;k++){chars[k]=rf(POOL);colors[k]=rcol();} done2=true; }
      renderMark(chars, colors);
      if (!done2) glitchT = requestAnimationFrame(tick); else { glitchT=null; done&&done(); }
    }
    glitchT = requestAnimationFrame(tick);
  }
  function scrambleIn(done) {
    var n = TARGET.length;
    var chars = Array.from({length:n},function(){return rf(POOL)});
    var colors = Array.from({length:n},rcol);
    var locked = new Array(n).fill(false), frame = 0;
    function tick() {
      frame++;
      var done2 = true;
      for (var j = 0; j < n; j++) {
        var rev = n - 1 - j;
        if (!locked[rev]) {
          done2 = false;
          if (frame >= j * 6 && Math.random() < .45) { locked[rev]=true; chars[rev]=TARGET[rev]; colors[rev]=null; }
          else { chars[rev]=rf(POOL); colors[rev]=rcol(); }
        }
      }
      if (frame >= n * 6 + 24) { for (var k=0;k<n;k++){locked[k]=true;chars[k]=TARGET[k];colors[k]=null;} done2=true; }
      renderMark(chars, colors);
      if (!done2) glitchT = requestAnimationFrame(tick); else { glitchT=null; done&&done(); }
    }
    glitchT = requestAnimationFrame(tick);
  }
  if (markEl) {
    markEl.textContent = TARGET;
    function doGlitch() {
      if (glitchT) cancelAnimationFrame(glitchT);
      scrambleOut(function () {
        setTimeout(function () { scrambleIn(function () { setTimeout(doGlitch, 5000); }); }, 260);
      });
    }
    setTimeout(doGlitch, 1000);
  }

  /* ── Clock + meta ── */
  var PHRASES = [
    "signal from the noise","entropy is a feature","no uplink · local session",
    "observer effect active","the matrix has you","all systems nominal",
    "running in the rain","ghost in the shell","低轨道漂流中","杂讯里偶尔一句完整话",
  ];
  var phraseEl = document.getElementById("ident-phrase");
  if (phraseEl) phraseEl.textContent = PHRASES[Math.floor(Math.random() * PHRASES.length)];

  var clockEl = document.getElementById("ident-clock");
  var dateEl  = document.getElementById("ident-date");
  var tickEl  = document.getElementById("hud-tick");
  var yearEl  = document.getElementById("hud-year");
  var tick    = 0;
  function pad(n) { return n < 10 ? "0"+n : ""+n; }
  function updateClock() {
    var d = new Date();
    if (clockEl) clockEl.textContent = pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
    if (dateEl)  dateEl.textContent  = d.getFullYear()+"·"+pad(d.getMonth()+1)+"·"+pad(d.getDate());
    if (yearEl)  yearEl.textContent  = d.getFullYear();
  }
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(function(){ tick++; if(tickEl) tickEl.textContent = "TICK · "+tick; }, 400);

  /* ════════════════════════════════════════════════
     MOUSE RIPPLE
  ════════════════════════════════════════════════ */
  var rippleLayer = document.getElementById("ripple-layer");
  var rippleOn = true;
  function spawnRipple(x, y) {
    if (!rippleOn || !rippleLayer) return;
    var el = document.createElement("div");
    el.className = "ripple";
    el.style.left = x + "px"; el.style.top = y + "px";
    rippleLayer.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 750);
  }
  document.addEventListener("click", function(e) {
    // Don't spawn on interactive elements
    if (e.target.closest("button,input,textarea,.player,.ctrl,.terminal,.capsule-box")) return;
    spawnRipple(e.clientX, e.clientY);
  });

  /* ════════════════════════════════════════════════
     CONTROLS
  ════════════════════════════════════════════════ */
  var ctrlTheme  = document.getElementById("ctrl-theme");
  var ctrlRain   = document.getElementById("ctrl-rain");
  var ctrlSpeed  = document.getElementById("ctrl-speed");
  var ctrlRipple = document.getElementById("ctrl-ripple");
  var ctrlFs     = document.getElementById("ctrl-fs");

  function setTheme(dark) {
    isDark = dark;
    document.body.classList.toggle("light", !dark);
    if (ctrlTheme) ctrlTheme.title = dark ? "切换到日间模式 [T]" : "切换到夜间模式 [T]";
  }

  if (ctrlTheme) ctrlTheme.addEventListener("click", function(){ setTheme(!isDark); });

  if (ctrlRain) {
    ctrlRain.addEventListener("click", function() {
      rainOn = !rainOn;
      rainEl.style.opacity = rainOn ? "1" : "0";
      ctrlRain.classList.toggle("is-off", !rainOn);
    });
  }

  var SPEED_LABELS = ["SLOW","NORM","FAST"];
  if (ctrlSpeed) {
    ctrlSpeed.title = "雨速: " + SPEED_LABELS[speedIdx] + " [S]";
    ctrlSpeed.addEventListener("click", function() {
      speedIdx = (speedIdx + 1) % 3;
      ctrlSpeed.title = "雨速: " + SPEED_LABELS[speedIdx] + " [S]";
      // Rebuild cols with new speed
      var h = window.innerHeight;
      cols = cols.map(function(c){ return makeCol(h, false); });
    });
  }

  if (ctrlRipple) {
    ctrlRipple.addEventListener("click", function() {
      rippleOn = !rippleOn;
      ctrlRipple.classList.toggle("is-off", !rippleOn);
    });
  }

  if (ctrlFs) {
    ctrlFs.addEventListener("click", function() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    });
  }

  /* ════════════════════════════════════════════════
     TERMINAL
  ════════════════════════════════════════════════ */
  var termEl      = document.getElementById("terminal");
  var termInput   = document.getElementById("terminal-input");
  var termOutput  = document.getElementById("terminal-output");
  var termBackdrop= document.getElementById("terminal-backdrop");
  var termClose   = document.getElementById("terminal-close");
  var termOpen    = false;

  var CMD_HELP = [
    "help       — 显示指令列表",
    "clear      — 清空终端",
    "rain on/off— 矩阵雨开关",
    "speed s/n/f— 雨速 slow/normal/fast",
    "theme d/l  — 主题 dark/light",
    "time       — 当前时间",
    "echo <txt> — 回显文字",
    "matrix     — 随机矩阵语录",
    "fps        — 当前帧率",
    "capsule    — 打开时间胶囊",
    "about      — 关于",
  ];

  var MATRIX_QUOTES = [
    "There is no spoon.",
    "Free your mind.",
    "The Matrix is everywhere.",
    "I know kung fu.",
    "What is real? How do you define real?",
    "You take the blue pill… the story ends.",
    "Unfortunately, no one can be told what the Matrix is.",
    "We never free a mind once it's reached a certain age.",
    "Ignorance is bliss.",
    "Choice. The problem is choice.",
    "Everything that has a beginning has an end.",
    "杂讯里偶尔拼出一句完整话。",
    "低轨道漂流中，信号时有时无。",
    "随机不是无意义，只是还没被读。",
  ];

  function termLine(text, type) {
    if (!termOutput) return;
    var row = document.createElement("div");
    row.className = "term-line" + (type ? " " + type : "");
    row.innerHTML = '<span class="prompt">' + (type === "sys" ? "//" : type === "err" ? "!!" : type === "ok" ? "✓" : "›") + '</span>'
      + '<span class="text"></span>';
    row.querySelector(".text").textContent = text;
    termOutput.appendChild(row);
    termOutput.scrollTop = termOutput.scrollHeight;
  }

  function openTerminal() {
    termOpen = true;
    termEl.classList.add("is-open");
    termBackdrop.classList.add("is-open");
    termEl.setAttribute("aria-hidden","false");
    setTimeout(function(){ if(termInput) termInput.focus(); }, 50);
  }
  function closeTerminal() {
    termOpen = false;
    termEl.classList.remove("is-open");
    termBackdrop.classList.remove("is-open");
    termEl.setAttribute("aria-hidden","true");
  }

  if (termClose) termClose.addEventListener("click", closeTerminal);
  if (termBackdrop) termBackdrop.addEventListener("click", closeTerminal);

  function runCmd(raw) {
    var line = raw.trim(); if (!line) return;
    termLine(line);
    var parts = line.split(/\s+/), cmd = parts[0].toLowerCase();

    if (cmd === "help") { CMD_HELP.forEach(function(l){ termLine(l, "sys"); }); }
    else if (cmd === "clear") { if(termOutput) termOutput.innerHTML = ""; termLine("cleared.", "sys"); }
    else if (cmd === "time") { termLine(new Date().toString(), "sys"); }
    else if (cmd === "fps")  { termLine("current FPS: " + fpsVal, "sys"); }
    else if (cmd === "about") { termLine("qwertlexi · signal from the noise · local session · " + new Date().getFullYear(), "sys"); }
    else if (cmd === "matrix") { termLine(MATRIX_QUOTES[Math.floor(Math.random()*MATRIX_QUOTES.length)], "ok"); }
    else if (cmd === "capsule") { closeTerminal(); openCapsule(); }
    else if (cmd === "echo") { termLine(parts.slice(1).join(" ") || "…", "sys"); }
    else if (cmd === "rain") {
      var arg = (parts[1]||"").toLowerCase();
      if (arg === "on")  { rainOn=true;  rainEl.style.opacity="1"; ctrlRain.classList.remove("is-off"); termLine("rain on", "ok"); }
      else if (arg==="off"){ rainOn=false; rainEl.style.opacity="0"; ctrlRain.classList.add("is-off");    termLine("rain off","sys"); }
      else termLine("usage: rain on | off", "err");
    }
    else if (cmd === "speed") {
      var s = (parts[1]||"").toLowerCase();
      var idx2 = {s:0,slow:0,n:1,normal:1,f:2,fast:2}[s];
      if (idx2 === undefined) { termLine("usage: speed s|n|f", "err"); return; }
      speedIdx = idx2;
      var h = window.innerHeight;
      cols = cols.map(function(){ return makeCol(h, false); });
      termLine("speed → " + SPEED_LABELS[speedIdx], "ok");
    }
    else if (cmd === "theme") {
      var t = (parts[1]||"").toLowerCase();
      if (t === "d" || t === "dark")  { setTheme(true);  termLine("dark mode", "ok"); }
      else if (t==="l"||t==="light"){ setTheme(false); termLine("light mode","ok"); }
      else termLine("usage: theme d|l", "err");
    }
    else { termLine("unknown command: " + cmd + " — try 'help'", "err"); }
  }

  if (termInput) {
    var cmdHistory = [], histIdx = -1;
    termInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        var v = termInput.value;
        if (v.trim()) { cmdHistory.unshift(v); histIdx = -1; runCmd(v); }
        termInput.value = "";
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (histIdx < cmdHistory.length - 1) { histIdx++; termInput.value = cmdHistory[histIdx]; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (histIdx > 0) { histIdx--; termInput.value = cmdHistory[histIdx]; }
        else { histIdx=-1; termInput.value=""; }
      } else if (e.key === "Escape") { closeTerminal(); }
    });
  }

  // Boot message
  termLine("// qwertlexi terminal v1.0 — type 'help' for commands", "sys");

  /* ════════════════════════════════════════════════
     TIME CAPSULE
  ════════════════════════════════════════════════ */
  var capsuleOverlay = document.getElementById("capsule-overlay");
  var capsuleClose   = document.getElementById("capsule-close");
  var capsuleInput   = document.getElementById("capsule-input");
  var capsuleSave    = document.getElementById("capsule-save");
  var capsuleClear   = document.getElementById("capsule-clear");
  var capsuleList    = document.getElementById("capsule-list");
  var CAPSULE_KEY    = "qwl-capsule-v1";

  function loadCapsules() {
    try { var d = localStorage.getItem(CAPSULE_KEY); return d ? JSON.parse(d) : []; }
    catch(e) { return []; }
  }
  function saveCapsules(arr) {
    try { localStorage.setItem(CAPSULE_KEY, JSON.stringify(arr)); } catch(e){}
  }
  function renderCapsules() {
    if (!capsuleList) return;
    var arr = loadCapsules();
    capsuleList.innerHTML = "";
    if (!arr.length) { capsuleList.innerHTML = '<p style="font-size:.6rem;color:var(--ink-dim);padding:.3rem 0">暂无记录。</p>'; return; }
    arr.forEach(function(c) {
      var div = document.createElement("div"); div.className = "capsule-entry";
      var meta = document.createElement("div"); meta.className = "capsule-entry-meta";
      meta.textContent = new Date(c.t).toLocaleString("zh-CN",{hour12:false});
      var txt = document.createElement("div"); txt.className = "capsule-entry-text";
      txt.textContent = c.text;
      div.appendChild(meta); div.appendChild(txt); capsuleList.appendChild(div);
    });
  }

  function openCapsule() {
    if (!capsuleOverlay) return;
    renderCapsules();
    capsuleOverlay.hidden = false;
    setTimeout(function(){ if(capsuleInput) capsuleInput.focus(); }, 60);
  }
  function closeCapsule() { if (capsuleOverlay) capsuleOverlay.hidden = true; }

  if (capsuleClose) capsuleClose.addEventListener("click", closeCapsule);
  if (capsuleOverlay) capsuleOverlay.addEventListener("click", function(e){ if(e.target===capsuleOverlay) closeCapsule(); });
  if (capsuleSave) {
    capsuleSave.addEventListener("click", function() {
      if (!capsuleInput) return;
      var text = capsuleInput.value.trim(); if (!text) return;
      var arr = loadCapsules();
      arr.unshift({ text:text, t:Date.now() });
      if (arr.length > 20) arr = arr.slice(0, 20); // keep last 20
      saveCapsules(arr);
      capsuleInput.value = "";
      renderCapsules();
    });
  }
  if (capsuleClear) {
    capsuleClear.addEventListener("click", function() {
      if (!confirm("清除所有时间胶囊记录？")) return;
      saveCapsules([]); renderCapsules();
    });
  }

  // Show capsule greeting if messages exist
  (function checkCapsuleGreeting() {
    var arr = loadCapsules(); if (!arr.length) return;
    var last = arr[0];
    var days = Math.floor((Date.now() - last.t) / 86400000);
    if (days < 1) return; // don't show if from today
    // Show a brief flash on the ident phrase
    var pe = document.getElementById("ident-phrase");
    if (pe) {
      setTimeout(function() {
        pe.textContent = "👻 " + days + "天前，你说：「" + last.text.slice(0,20) + (last.text.length>20?"…":"") + "」";
        pe.style.opacity = ".7";
        setTimeout(function(){ pe.style.opacity=""; pe.textContent = PHRASES[Math.floor(Math.random()*PHRASES.length)]; }, 5000);
      }, 3000);
    }
  })();

  /* ════════════════════════════════════════════════
     KEYBOARD SHORTCUTS
  ════════════════════════════════════════════════ */
  document.addEventListener("keydown", function(e) {
    // Don't fire if typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.key === "Escape") { closeTerminal(); closeCapsule(); }
      return;
    }
    var k = e.key.toLowerCase();
    if (k === "k" || (e.metaKey && k === "k") || (e.ctrlKey && k === "k")) {
      e.preventDefault(); termOpen ? closeTerminal() : openTerminal();
    }
    else if (k === "escape") { closeTerminal(); closeCapsule(); }
    else if (k === "t") { setTheme(!isDark); }
    else if (k === "r") {
      rainOn = !rainOn;
      rainEl.style.opacity = rainOn ? "1" : "0";
      if (ctrlRain) ctrlRain.classList.toggle("is-off", !rainOn);
    }
    else if (k === "s") {
      speedIdx = (speedIdx + 1) % 3;
      if (ctrlSpeed) ctrlSpeed.title = "雨速: " + SPEED_LABELS[speedIdx] + " [S]";
      var h = window.innerHeight;
      cols = cols.map(function(){ return makeCol(h, false); });
    }
    else if (k === "w") {
      rippleOn = !rippleOn;
      if (ctrlRipple) ctrlRipple.classList.toggle("is-off", !rippleOn);
    }
    else if (k === "f") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    }
    else if (k === "c" && !e.metaKey && !e.ctrlKey) {
      capsuleOverlay && !capsuleOverlay.hidden ? closeCapsule() : openCapsule();
    }
  });

  /* ════════════════════════════════════════════════
     MUSIC PLAYER
  ════════════════════════════════════════════════ */
  var TRACKS = [
    { title:"GO",                artist:"BLACKPINK",              src:"music/BLACKPINK - GO.mp3" },
    { title:"BIRDS OF A FEATHER",artist:"Billie Eilish",          src:"music/Billie Eilish - BIRDS OF A FEATHER.mp3" },
    { title:"Best Part",         artist:"Daniel Caesar / H.E.R.", src:"music/Daniel Caesar; H.E.R. - Best Part.mp3" },
    { title:"Oblivion",          artist:"Grimes",                 src:"music/Grimes - Oblivion.mp3" },
    { title:"Realiti",           artist:"Grimes",                 src:"music/Grimes - Realiti.mp3" },
    { title:"Episode 33",        artist:"She Her Her Hers",       src:"music/She Her Her Hers - Episode 33.mp3" },
    { title:"About You",         artist:"The 1975",               src:"music/The 1975 - About You.mp3" },
    { title:"How Can I Make It OK?",          artist:"Wolf Alice",             src:"music/Wolf Alice - How Can I Make It OK_.mp3" },
    { title:"Lipstick On The Glass",          artist:"Wolf Alice",             src:"music/Wolf Alice - Lipstick On The Glass.mp3" },
  ];

  var audio = new Audio(), curIdx = -1, vizT = null;
  var playerEl   = document.getElementById("player");
  var playerBar  = document.getElementById("player-bar");
  var titleElP   = document.getElementById("player-title");
  var artistElP  = document.getElementById("player-artist");
  var playBtn    = document.getElementById("player-play");
  var prevBtn    = document.getElementById("player-prev");
  var nextBtn    = document.getElementById("player-next");
  var expandBtn  = document.getElementById("player-expand");
  var panelEl    = document.getElementById("player-panel");
  var seekEl     = document.getElementById("player-seek");
  var seekFill   = document.getElementById("player-seek-fill");
  var seekHead   = document.getElementById("player-seek-head");
  var curElP     = document.getElementById("player-cur");
  var totElP     = document.getElementById("player-tot");
  var volSlider  = document.getElementById("player-vol");
  var volVal     = document.getElementById("player-vol-val");
  var tracklistEl= document.getElementById("player-tracklist");
  var vizEl      = document.getElementById("player-viz");

  function fmt(s) {
    if (!isFinite(s)||s<0) return "0:00";
    return Math.floor(s/60)+":"+(Math.floor(s%60)<10?"0":"")+Math.floor(s%60);
  }

  TRACKS.forEach(function(t, i) {
    var btn = document.createElement("button");
    btn.type="button"; btn.className="player-track"; btn.dataset.idx=i;
    btn.innerHTML = '<span class="track-num">'+String(i+1).padStart(2,"0")+'</span>'
      +'<span class="track-name">'+t.title+'</span>'
      +'<span class="track-dur" id="pdur-'+i+'">—:——</span>';
    btn.addEventListener("click", function(){ loadTrack(i, true); });
    if (tracklistEl) tracklistEl.appendChild(btn);
  });

  function highlight() {
    document.querySelectorAll(".player-track").forEach(function(r){
      r.classList.toggle("is-current", parseInt(r.dataset.idx) === curIdx);
    });
  }

  function loadTrack(idx, play) {
    curIdx = ((idx % TRACKS.length) + TRACKS.length) % TRACKS.length;
    var t = TRACKS[curIdx];
    audio.src = t.src; audio.load();
    if (titleElP) titleElP.textContent  = t.title;
    if (artistElP) artistElP.textContent = t.artist;
    if (curElP) curElP.textContent = "0:00";
    if (totElP) totElP.textContent = "0:00";
    if (seekFill) seekFill.style.width = "0%";
    if (seekHead) seekHead.style.left  = "0%";
    highlight();
    if (play) audio.play().catch(function(){});
  }

  function setPlayUI(playing) {
    if (playBtn) playBtn.textContent = playing ? "⏸" : "▶";
    if (playerEl) playerEl.classList.toggle("is-playing", playing);
    if (playing) {
      if (!vizT) vizT = setInterval(function(){
        if (!vizEl) return;
        vizEl.querySelectorAll("span").forEach(function(s){
          s.style.transform = "scaleY("+(0.12+Math.random()*.88).toFixed(2)+")";
        });
      }, 85);
    } else {
      clearInterval(vizT); vizT = null;
      if (vizEl) vizEl.querySelectorAll("span").forEach(function(s){ s.style.transform="scaleY(.2)"; });
    }
  }

  audio.addEventListener("play",  function(){ setPlayUI(true); });
  audio.addEventListener("pause", function(){ setPlayUI(false); });
  audio.addEventListener("ended", function(){ loadTrack(curIdx+1, true); });
  audio.addEventListener("timeupdate", function(){
    if (!isFinite(audio.duration)) return;
    var pct = audio.currentTime / audio.duration * 100;
    if (seekFill) seekFill.style.width = pct+"%";
    if (seekHead) seekHead.style.left  = pct+"%";
    if (curElP)   curElP.textContent   = fmt(audio.currentTime);
  });
  audio.addEventListener("loadedmetadata", function(){
    if (totElP) totElP.textContent = fmt(audio.duration);
    var d = document.getElementById("pdur-"+curIdx);
    if (d) d.textContent = fmt(audio.duration);
  });

  function togglePlay() {
    if (curIdx < 0) { loadTrack(0, true); return; }
    audio.paused ? audio.play().catch(function(){}) : audio.pause();
  }

  if (playBtn)   playBtn.addEventListener("click",   function(e){ e.stopPropagation(); togglePlay(); });
  if (prevBtn)   prevBtn.addEventListener("click",   function(e){ e.stopPropagation(); loadTrack(curIdx-1, !audio.paused); });
  if (nextBtn)   nextBtn.addEventListener("click",   function(e){ e.stopPropagation(); loadTrack(curIdx+1, !audio.paused); });
  if (expandBtn) expandBtn.addEventListener("click", function(e){
    e.stopPropagation();
    var open = playerEl.classList.toggle("is-open");
    expandBtn.setAttribute("aria-expanded", String(open));
    if (panelEl) panelEl.setAttribute("aria-hidden", String(!open));
  });
  if (playerBar) playerBar.addEventListener("click", function(e){
    if ([playBtn,prevBtn,nextBtn,expandBtn].some(function(b){ return b&&(e.target===b||b.contains(e.target)); })) return;
    if (expandBtn) expandBtn.click();
  });

  if (volSlider) {
    audio.volume = parseFloat(volSlider.value);
    volSlider.addEventListener("input", function(){
      audio.volume = parseFloat(volSlider.value);
      if (volVal) volVal.textContent = Math.round(audio.volume*100)+"%";
    });
  }
  if (seekEl) seekEl.addEventListener("click", function(e){
    if (!isFinite(audio.duration)||!audio.duration) return;
    var rect = seekEl.getBoundingClientRect();
    audio.currentTime = Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*audio.duration;
  });

  /* Drag */
  if (playerEl && playerBar) {
    var drag = { on:false, sx:0, sy:0, ox:0, oy:0 };
    function dStart(cx,cy) {
      var r = playerEl.getBoundingClientRect();
      playerEl.style.bottom="auto"; playerEl.style.transform="none";
      playerEl.style.left=r.left+"px"; playerEl.style.top=r.top+"px";
      drag.on=true; drag.sx=cx; drag.sy=cy; drag.ox=r.left; drag.oy=r.top;
      playerEl.classList.add("is-dragging");
    }
    function dMove(cx,cy) {
      if (!drag.on) return;
      var nl=drag.ox+cx-drag.sx, nt=drag.oy+cy-drag.sy;
      nl=Math.max(0,Math.min(window.innerWidth-playerEl.offsetWidth,nl));
      nt=Math.max(0,Math.min(window.innerHeight-playerEl.offsetHeight,nt));
      playerEl.style.left=nl+"px"; playerEl.style.top=nt+"px";
    }
    function dEnd() { drag.on=false; playerEl.classList.remove("is-dragging"); }
    playerBar.addEventListener("mousedown", function(e){
      if ([playBtn,prevBtn,nextBtn,expandBtn].some(function(b){return b&&(e.target===b||b.contains(e.target));})) return;
      e.preventDefault(); dStart(e.clientX,e.clientY);
    });
    document.addEventListener("mousemove", function(e){ dMove(e.clientX,e.clientY); });
    document.addEventListener("mouseup", dEnd);
    playerBar.addEventListener("touchstart", function(e){
      if ([playBtn,prevBtn,nextBtn,expandBtn].some(function(b){return b&&(e.target===b||b.contains(e.target));})) return;
      dStart(e.touches[0].clientX,e.touches[0].clientY);
    },{passive:true});
    document.addEventListener("touchmove",function(e){ if(drag.on) dMove(e.touches[0].clientX,e.touches[0].clientY); },{passive:true});
    document.addEventListener("touchend",dEnd);
  }

  loadTrack(0, false);

})();
