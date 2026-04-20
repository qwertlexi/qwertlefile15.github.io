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

  // FPS: rolling average over last 60 frames
  var fpsFrameTimes = [], fpsVal = 0;

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

    // FPS: rolling average of last 60 rAF intervals
    var _now = performance.now();
    fpsFrameTimes.push(_now);
    if (fpsFrameTimes.length > 60) fpsFrameTimes.shift();
    if (fpsFrameTimes.length >= 2) {
      var _elapsed = fpsFrameTimes[fpsFrameTimes.length-1] - fpsFrameTimes[0];
      fpsVal = Math.round((fpsFrameTimes.length - 1) / _elapsed * 1000);
      if (fpsFrameTimes.length % 20 === 0) {
        var fe = document.getElementById("hud-fps");
        if (fe) fe.textContent = "FPS · " + fpsVal;
      }
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
          octx.shadowColor = "rgba(100,255,140,1)"; octx.shadowBlur = 9;
        } else if (t >= tL - 4) {
          var nf = (t - (tL - 4)) / 3;
          r = Math.round(nf * 180); g = Math.round(200 + nf * 55); b = Math.round(60 + nf * 120);
          alpha = 0.5 + nf * 0.5;
          octx.shadowColor = "rgba(0,255,80,.45)"; octx.shadowBlur = 5;
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
  // ASCII only — uniform width, no reflow jitter
  var POOL   = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*?!/";
  var CLRS   = ["#ff3b6b","#ff8c00","#ffe600","#00e5ff","#b44fff","#39ff14","#ff00cc","#00bfff"];
  var markEl = document.getElementById("mark-text");
  var glitchT = null;

  function rf(s)  { return s[Math.floor(Math.random() * s.length)]; }
  function rcol() { return CLRS[Math.floor(Math.random() * CLRS.length)]; }

  // ── Scramble: innerHTML, no width locking needed ───────────
  // The .ident-name has white-space:nowrap and a min-width set in CSS
  // to the measured natural width of TARGET in Syne, so the container
  // never reflows. We just write innerHTML each frame.
  function renderChars(chars, colors) {
    if (!markEl) return;
    var h = "";
    for (var i = 0; i < chars.length; i++) {
      if (colors && colors[i]) {
        h += '<span style="color:' + colors[i] + '">' + chars[i] + '</span>';
      } else {
        h += chars[i];
      }
    }
    markEl.innerHTML = h;
  }

  function scrambleOut(done) {
    var n = TARGET.length, frame = 0;
    var chars  = TARGET.split("");
    var colors = new Array(n).fill(null);
    var unlocked = new Array(n).fill(false);
    function tick() {
      frame++;
      var allDone = true;
      for (var j = 0; j < n; j++) {
        if (!unlocked[j]) {
          allDone = false;
          if (frame >= j * 4 && Math.random() < .6) unlocked[j] = true;
        }
        if (unlocked[j]) { chars[j] = rf(POOL); colors[j] = rcol(); }
      }
      if (frame >= n * 4 + 12) {
        for (var k = 0; k < n; k++) { chars[k] = rf(POOL); colors[k] = rcol(); }
        allDone = true;
      }
      renderChars(chars, colors);
      if (!allDone) glitchT = requestAnimationFrame(tick);
      else { glitchT = null; done && done(); }
    }
    glitchT = requestAnimationFrame(tick);
  }

  function scrambleIn(done) {
    var n = TARGET.length, frame = 0;
    var chars  = [];
    var colors = [];
    for (var i = 0; i < n; i++) { chars.push(rf(POOL)); colors.push(rcol()); }
    var locked = new Array(n).fill(false);
    function tick() {
      frame++;
      var allDone = true;
      for (var j = 0; j < n; j++) {
        var rev = n - 1 - j;
        if (!locked[rev]) {
          allDone = false;
          if (frame >= j * 5 && Math.random() < .5) {
            locked[rev] = true; chars[rev] = TARGET[rev]; colors[rev] = null;
          } else {
            chars[rev] = rf(POOL); colors[rev] = rcol();
          }
        }
      }
      if (frame >= n * 5 + 16) {
        for (var k = 0; k < n; k++) { locked[k]=true; chars[k]=TARGET[k]; colors[k]=null; }
        allDone = true;
      }
      renderChars(chars, colors);
      if (!allDone) glitchT = requestAnimationFrame(tick);
      else { glitchT = null; done && done(); }
    }
    glitchT = requestAnimationFrame(tick);
  }

  if (markEl) {
    markEl.textContent = TARGET; // show immediately while fonts load
    function doGlitch() {
      if (glitchT) cancelAnimationFrame(glitchT);
      scrambleOut(function() {
        setTimeout(function() {
          scrambleIn(function() { setTimeout(doGlitch, 5000); });
        }, 200);
      });
    }
    setTimeout(doGlitch, 900);
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
  var ctrlTheme    = document.getElementById("ctrl-theme");
  var ctrlTerminal = document.getElementById("ctrl-terminal");
  if (ctrlTerminal) {
    ctrlTerminal.addEventListener("click", function(){ termOpen ? closeTerminal() : openTerminal(); });
  }
  // Hide desktop ctrl-fs terminal button on mobile handled by CSS
  var ctrlTermRef = ctrlTerminal;
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
    "help          — 显示指令列表",
    "clear         — 清空终端",
    "rain on/off   — 矩阵雨开关",
    "speed s/n/f   — 雨速 slow/normal/fast",
    "theme d/l     — 主题 dark/light",
    "time          — 当前时间",
    "echo <txt>    — 回显文字",
    "matrix        — 随机矩阵语录",
    "cyber         — 随机赛博未来语句",
    "fps           — 当前帧率",
    "capsule       — 打开时间胶囊",
    "about         — 关于",
    "lyrics        — 随机歌词",
    "go / birds / bestpart / oblivion / realiti",
    "episode33 / aboutyou / makeok / lipstick — 歌词",
  ];

  var LYRICS = {
    go: [
      "Hold in position, it\'s gonna blow.",
      "You only move when, when I say so.",
      "You could stop and be alone.",
    ],
    birds: [
      "AND I DON\'T KNOW WHAT I\'M CRYING FOR",
      "THINK I WASN\'T BETTER ALONE",
      "IF I\'M TURNING BLUE, PLEASE DON\'T SAVE ME",
    ],
    bestpart: [
      "Where you go I\'ll follow, no matter how far",
      "You\'re the one that I desire",
      "If you love me won\'t you say something?",
    ],
    oblivion: [
      "See you on the dark night",
      "I would ask if you help me out",
      "I never looked behind all the time",
    ],
    realiti: [
      "I wanna peer over the edge of the death",
      "If we are always the same",
      "Oh baby every morning there are mountains to climb",
    ],
    episode33: [
      "真夜中生まれる 感情をうまく纏えたら",
      "何度目のあやかり 受け身が続いてく",
    ],
    aboutyou: [
      "I know a place, it\'s somewhere I go when I need to remember your face",
      "Do you think I have forgotten about you?",
      "Hold on and hope that we\'ll find the way back in the end",
      "I think about you",
    ],
    makeok: [
      "I just want you to be happy",
      "But to live in fear, isn\'t to live at all",
      "How do we sell you the world?",
      "Let it in, embrace and uncurl",
      "Had life before, been so slow?",
    ],
    lipstick: [
      "And the full moon rising, but it\'s me who makes myself mad",
      "I\'ll take you back",
    ],
  };
  // All lyrics flat pool for random pick
  var ALL_LYRICS = [];
  Object.keys(LYRICS).forEach(function(k){ ALL_LYRICS = ALL_LYRICS.concat(LYRICS[k]); });

  var CYBER_LINES = [
    "Signal authenticated. Identity unverified.",
    "The future arrived quietly — no one was watching.",
    "Every packet of data is a ghost passing through walls.",
    "Memory is just another form of storage. Both can be wiped.",
    "In 2087, nostalgia was patched out.",
    "You are the wetware. Act accordingly.",
    "Connection lost. Searching for meaning on port 443.",
    "Error 404: Certainty not found.",
    "Your consciousness is now buffering.",
    "We are all running legacy code.",
    "The last true secret is that there are no more secrets.",
    "Entropy increases. So does the signal.",
    "Low orbit satellite drift: nominal. Existential drift: critical.",
    "Time is a local variable. Scope: undefined.",
    "城市是人类最大的神经网络。",
    "在数字雨中，每一滴都是别人的记忆。",
    "孤独是最稳定的加密算法。",
    "连接中断，但某些事物永远不会完全断线。",
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
    else if (cmd === "matrix") {
      termLine(MATRIX_QUOTES[Math.floor(Math.random()*MATRIX_QUOTES.length)], "ok");
    }
    else if (cmd === "cyber") {
      termLine(CYBER_LINES[Math.floor(Math.random()*CYBER_LINES.length)], "ok");
    }
    else if (cmd === "lyrics") {
      termLine(ALL_LYRICS[Math.floor(Math.random()*ALL_LYRICS.length)], "ok");
    }
    else if (["go","birds","bestpart","oblivion","realiti","episode33","aboutyou","makeok","lipstick"].indexOf(cmd) !== -1) {
      // Alias handling
      var lkey = cmd === "birds" ? "birds" : cmd;
      var pool = LYRICS[lkey];
      if (pool && pool.length) termLine(pool[Math.floor(Math.random()*pool.length)], "ok");
      else termLine("no lyrics found for: " + cmd, "err");
    }
    else if (cmd === "capsule") { closeTerminal(); openCapsule(); }
    else if (cmd === "echo") { termLine(parts.slice(1).join(" ") || "…", "sys"); }
    else if (cmd === "birdsofafeather" || cmd === "birds of a feather") {
      var pool2 = LYRICS["birds"];
      termLine(pool2[Math.floor(Math.random()*pool2.length)], "ok");
    }
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
    { title:"How Can I Make It OK?",artist:"Wolf Alice",          src:"music/Wolf Alice - How Can I Make It OK_.mp3" },
    { title:"Lipstick On The Glass",artist:"Wolf Alice",          src:"music/Wolf Alice - Lipstick On The Glass.mp3" },
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
    if (playBtn) {
      var pi = playBtn.querySelector(".play-icon");
      var pa = playBtn.querySelector(".pause-icon");
      if (pi) pi.style.display = playing ? "none" : "";
      if (pa) pa.style.display = playing ? "" : "none";
    }
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
  /* Clicking/tapping the bar (not a control button) toggles expand */
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

  loadTrack(0, false);

  /* Trigger entrance animation after a short delay (replaces CSS animation
     so no transform conflict can occur) */
  setTimeout(function(){ if (playerEl) playerEl.classList.add("player-ready"); }, 1100);

  /* ════════════════════════════════════════════════
     CUSTOM CURSOR
  ════════════════════════════════════════════════ */
  var cursorEl = document.getElementById("cursor");
  if (cursorEl && window.matchMedia("(pointer:fine)").matches) {
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var tx = cx, ty = cy;
    var curRaf;
    // Smooth lag for ring, instant for dot
    function moveCursor() {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      cursorEl.style.transform = "translate(" + tx + "px," + ty + "px)";
      // ring trails slightly
      cursorEl.querySelector(".cursor-ring").style.transform =
        "translate(calc(-50% + " + Math.round((cx - tx) * 0.7) + "px), calc(-50% + " + Math.round((cy - ty) * 0.7) + "px))";
      curRaf = requestAnimationFrame(moveCursor);
    }
    moveCursor();

    document.addEventListener("mousemove", function(e) {
      tx = e.clientX; ty = e.clientY;
    });
    document.addEventListener("mousedown", function() {
      document.body.classList.add("cursor-click");
    });
    document.addEventListener("mouseup", function() {
      document.body.classList.remove("cursor-click");
    });
    // Hover state on interactables
    document.addEventListener("mouseover", function(e) {
      if (e.target.closest("button,a,input,textarea,[role='button'],.player-seek,.ident-name")) {
        document.body.classList.add("cursor-hover");
      }
    });
    document.addEventListener("mouseout", function(e) {
      if (e.target.closest("button,a,input,textarea,[role='button'],.player-seek,.ident-name")) {
        document.body.classList.remove("cursor-hover");
      }
    });
  }

  /* ════════════════════════════════════════════════
     GLITCH BURST — click on name triggers RGB glitch
  ════════════════════════════════════════════════ */
  var glitchOverlay = document.getElementById("glitch-overlay");
  var identNameEl   = document.querySelector(".ident-name");
  if (identNameEl && glitchOverlay) {
    identNameEl.addEventListener("click", function() {
      if (glitchOverlay.classList.contains("active-r")) return; // debounce
      // Trigger R channel glitch
      glitchOverlay.className = "active-r";
      setTimeout(function() { glitchOverlay.classList.add("active-b"); }, 40);
      setTimeout(function() {
        glitchOverlay.className = "";
        // Also trigger a fast extra scramble
        if (glitchT) cancelAnimationFrame(glitchT);
        if (typeof scrambleOut === "function") {
          scrambleOut(function() {
            setTimeout(function() {
              scrambleIn(function() {
                if (typeof doGlitch === "function") setTimeout(doGlitch, 5000);
              });
            }, 80);
          });
        }
      }, 260);
    });
  }

  /* ════════════════════════════════════════════════
     BOOT SEQUENCE
  ════════════════════════════════════════════════ */
  (function () {
    var overlay  = document.getElementById("boot-overlay");
    var linesEl  = document.getElementById("boot-lines");
    var barEl    = document.getElementById("boot-bar");
    var statusEl = document.getElementById("boot-status");
    if (!overlay) return;
    var BOOT_MSGS = [
      { t:"sy", msg:"QWERTLEXI_SYS v2.4.1 — BIOS integrity check" },
      { t:"ok", msg:"memory modules verified · entropy nominal" },
      { t:"ok", msg:"GPU · MATRIX_RAIN_ENGINE loaded" },
      { t:"sy", msg:"establishing local session…" },
      { t:"ok", msg:"signal authenticated — identity unverified" },
      { t:"er", msg:"WARNING: uplink unavailable — ghost mode active" },
      { t:"ok", msg:"identity scrambler · waveform monitor: online" },
      { t:"sy", msg:"mounting local capsule store…" },
      { t:"ok", msg:"qwl-capsule-v1 mounted · " + (function(){ try{ return JSON.parse(localStorage.getItem("qwl-capsule-v1")||"[]").length; }catch(e){ return 0; } })() + " entries" },
      { t:"ok", msg:"audio: codec PCM 44.1kHz / stereo · idle" },
      { t:"ok", msg:"all systems nominal — welcome back, qwertlexi" },
    ];
    var STATUSES = ["MEMORY CHECK…","LOADING MODULES…","HANDSHAKE…","PARSING IDENTITY…","BOOT COMPLETE"];
    var delay = 0, total = BOOT_MSGS.length;
    BOOT_MSGS.forEach(function(m, i) {
      delay += 55 + i * 130 + Math.random() * 55;
      (function(msg, type, at, idx) {
        setTimeout(function() {
          if (!linesEl) return;
          var el = document.createElement("span");
          el.className = "bl " + type;
          el.textContent = msg;
          linesEl.appendChild(el);
          linesEl.scrollTop = linesEl.scrollHeight;
          var pct = Math.round((idx + 1) / total * 100);
          if (barEl) barEl.style.width = pct + "%";
          if (statusEl) statusEl.textContent = STATUSES[Math.min(Math.floor(pct / 25), STATUSES.length - 1)];
        }, at);
      })(m.msg, m.t, delay, i);
    });
    setTimeout(function() { overlay.classList.add("done"); }, 5200);
  })();

  /* ════════════════════════════════════════════════
     WAVEFORM MINI-GRAPH (top-right HUD)
  ════════════════════════════════════════════════ */
  var waveCanvas = document.getElementById("wavegraph");
  if (waveCanvas) {
    var wctx = waveCanvas.getContext("2d");
    var WAVE_W = 56, WAVE_H = 16;
    var waveSamples = [];
    for (var i = 0; i < WAVE_W; i++) waveSamples.push(0.5 + Math.sin(i * 0.4) * 0.3);

    function drawWave() {
      wctx.clearRect(0, 0, WAVE_W, WAVE_H);
      // Push new sample
      waveSamples.push(0.3 + Math.random() * 0.65);
      if (waveSamples.length > WAVE_W) waveSamples.shift();

      wctx.beginPath();
      var clr = isDark ? "rgba(127,217,208," : "rgba(1,32,40,";
      for (var j = 0; j < waveSamples.length; j++) {
        var x = j;
        var y = WAVE_H - waveSamples[j] * WAVE_H;
        j === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
      }
      wctx.strokeStyle = clr + "0.7)";
      wctx.lineWidth = 1;
      wctx.stroke();

      // Filled area
      wctx.lineTo(waveSamples.length - 1, WAVE_H);
      wctx.lineTo(0, WAVE_H);
      wctx.closePath();
      wctx.fillStyle = clr + "0.12)";
      wctx.fill();
    }
    setInterval(drawWave, 120);
    drawWave();
  }

})();
