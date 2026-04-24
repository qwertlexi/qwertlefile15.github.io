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
  // Rainbow mode (Konami easter egg)
  var rainbowMode = 0; // 0=off, >0 = frames remaining, fades out over ~600 frames
  // Feature toggles
  var beatOn = true;   // music beat reaction
  var partOn = true;   // mouse/touch particle parting
  // Mouse parting
  var mouseX = -9999, mouseY = -9999;
  var PART_RADIUS = 120;  // px — how far mouse pushes cols
  var PART_FORCE  = 22;   // max pixel displacement per char
  document.addEventListener("mousemove", function(e) { mouseX = e.clientX; mouseY = e.clientY; });
  document.addEventListener("mouseleave", function() { mouseX = -9999; mouseY = -9999; });
  // Touch support — finger parting the rain
  document.addEventListener("touchmove", function(e) {
    var t = e.touches[0];
    mouseX = t.clientX; mouseY = t.clientY;
  }, { passive: true });
  document.addEventListener("touchend", function() { mouseX = -9999; mouseY = -9999; });

  // FPS: rolling average over last 60 frames
  var fpsFrameTimes = [], fpsVal = 0;

  function rc() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }

  function makeCol(h, scatter) {
    var sp = SPEEDS[speedIdx];
    var tl = Math.floor(10 + Math.random() * 20);
    return {
      y:        scatter ? Math.random() * h * 1.5 - h * 0.4 : -FS * (2 + Math.random() * 6),
      speed:    (0.8 + Math.random() * 2.0) * sp,
      trailLen: tl,
      trail:    [],
      mt: 0,
      mr: Math.floor(2 + Math.random() * 5),
      bright: Math.random() < 0.10,
      // Per-character particle offsets (length = trailLen, grown on demand)
      cox: [],  // char x offsets
      coy: [],  // char y offsets
      cvx: [],  // char x velocities
      cvy: [],  // char y velocities
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

    // Beat-reactive: onset detection with local average comparison
    var _energy = getBeatEnergy();
    // Slow average tracks background level, fast tracks instant level
    beatEnergy += (_energy - beatEnergy) * 0.08;   // slow background average
    var _delta = _energy - lastBeatEnergy;
    // Only fire if instant energy is significantly above the background average
    // This avoids false triggers on sustained bass, only catches sharp onsets
    var _above = _energy - beatEnergy;
    if (_delta > 0.06 && _above > 0.04 && beatFlash < 0.3) {
      beatFlash = Math.min(1.0, _above * 6.0 + _delta * 4.0);
    }
    lastBeatEnergy = _energy * 0.6 + lastBeatEnergy * 0.4; // smoothed last
    beatFlash *= 0.72;  // decay
    if (rainbowMode > 0) rainbowMode--;

    // On strong beat: near-zero fade so ALL trails stay bright for a moment
    var _fade = isDark
      ? Math.max(0.02, 0.13 - beatFlash * 0.11 - beatEnergy * 0.06)
      : Math.max(0.02, 0.06 - beatFlash * 0.04 - beatEnergy * 0.03);
    octx.fillStyle = "rgba(0,0,0," + _fade + ")";
    octx.fillRect(0, 0, w, h);
    octx.font = FS + "px 'Courier Prime','Courier New',monospace";
    octx.textBaseline = "top";

    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      var baseX = i * FS; // canonical x (no column-level offset anymore)

      // Advance trail
      col.mt++;
      if (col.mt >= col.mr) {
        col.mt = 0;
        col.trail.push(rc());
        if (col.trail.length > col.trailLen) col.trail.shift();
        // Grow particle arrays to match trail length
        col.cox.push(0); col.coy.push(0);
        col.cvx.push(0); col.cvy.push(0);
      }
      if (!col.trail.length) {
        col.trail.push(rc());
        col.cox.push(0); col.coy.push(0);
        col.cvx.push(0); col.cvy.push(0);
      }
      // Trim particle arrays to trail length
      while (col.cox.length > col.trail.length) {
        col.cox.shift(); col.coy.shift();
        col.cvx.shift(); col.cvy.shift();
      }

      var tL = col.trail.length;
      for (var t = 0; t < tL; t++) {
        var homeX = baseX;
        var homeY = col.y - (tL - 1 - t) * FS;
        if (homeY < -FS * 4 || homeY > h + FS) continue;

        // Per-char spring physics toward home position + mouse repulsion
        var cx2 = homeX + col.cox[t];
        var cy2 = homeY + col.coy[t];

        // Mouse repulsion on both axes
        var mdx = cx2 - mouseX;
        var mdy = cy2 - mouseY;
        var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        var fx = 0, fy = 0;
        if (partOn && mdist < PART_RADIUS && mdist > 0.5) {
          var strength = (1 - mdist / PART_RADIUS);
          strength = strength * strength * PART_FORCE * 2.2;
          fx = (mdx / mdist) * strength;
          fy = (mdy / mdist) * strength * 0.7; // slightly less vertical push
        }

        // Spring back to home
        col.cvx[t] += fx + (0 - col.cox[t]) * 0.22;
        col.cvy[t] += fy + (0 - col.coy[t]) * 0.22;
        col.cvx[t] *= 0.58; // damping
        col.cvy[t] *= 0.58;
        col.cox[t] += col.cvx[t];
        col.coy[t] += col.cvy[t];

        // Clamp max displacement
        var maxD = PART_FORCE * 2.8;
        col.cox[t] = Math.max(-maxD, Math.min(maxD, col.cox[t]));
        col.coy[t] = Math.max(-maxD, Math.min(maxD, col.coy[t]));

        var rx = homeX + col.cox[t];
        var ry = homeY + col.coy[t];
        if (ry < -FS || ry > h) continue;

        var frac = t / Math.max(1, tL - 1);
        var r, g, b, alpha;
        if (t === tL - 1) {
          if (rainbowMode > 0) {
            var hue = (i * 137.5 + Date.now() * 0.04) % 360;
            var rbFade = Math.min(1, rainbowMode / 60);
            octx.fillStyle = "hsla(" + hue + ",100%,70%," + rbFade + ")";
            octx.shadowColor = "hsla(" + hue + ",100%,80%,0.9)";
            octx.shadowBlur = 14 + beatFlash * 20;
            octx.fillText(col.trail[t], rx, ry);
            octx.shadowBlur = 0;
            continue;
          }
          if (window._specialDateRGB) {
            var _sd = window._specialDateRGB;
            r = Math.min(255, _sd[0] + Math.round(beatFlash*(255-_sd[0])));
            g = Math.min(255, _sd[1] + Math.round(beatFlash*(255-_sd[1])));
            b = Math.min(255, _sd[2] + Math.round(beatFlash*(255-_sd[2])));
          } else {
            r = Math.min(255, 180 + Math.round(beatFlash * 75));
            g = 255;
            b = Math.min(255, (col.bright ? 255 : 180) + Math.round(beatFlash * 75));
          }
          alpha = 1;
          octx.shadowColor = beatFlash > 0.3 ? "rgba(200,255,220,1)" : "rgba(100,255,140,1)";
          octx.shadowBlur = 9 + beatFlash * 38;
        } else if (t >= tL - 4) {
          var nf = (t - (tL - 4)) / 3;
          r = Math.round(nf * 180); g = Math.round(200 + nf * 55); b = Math.round(60 + nf * 120);
          alpha = 0.5 + nf * 0.5 + beatFlash * 0.35;
          octx.shadowColor = "rgba(0,255,80,.45)"; octx.shadowBlur = 5 + beatFlash * 10;
        } else {
          var tf = frac * frac;
          r = 0; g = Math.round(80 + tf * 120); b = Math.round(20 + tf * 40);
          alpha = 0.06 + tf * 0.65; octx.shadowBlur = 0;
        }
        octx.fillStyle = "rgba("+r+","+g+","+b+","+alpha+")";
        octx.fillText(col.trail[t], rx, ry);
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

  /* ════════════════════════════════════════════════
     TT · TYPEWRITER MODE  (light theme compatible)
  ════════════════════════════════════════════════ */
  var twActive = false, twIdleTimer = null, twText = "";

  function openTypewriter() {
    if (twActive) return;
    twActive = true;
    closeTerminal();
    logEvent("TYPEWRITER_OPEN", "");
    var ov = document.createElement("div");
    ov.id = "tw-overlay";
    ov.style.cssText = [
      "position:fixed;inset:0;z-index:300;background:var(--bg);",
      "display:flex;flex-direction:column;align-items:center;justify-content:center;",
      "opacity:0;transition:opacity .4s;"
    ].join("");
    var hint = document.createElement("div");
    hint.style.cssText = "font-family:var(--font);font-size:.44rem;letter-spacing:.2em;color:var(--ink-dim);margin-bottom:1.4rem;text-transform:uppercase;text-align:center;";
    hint.textContent = "// typewriter mode · esc to close · 30s idle → saves to capsule";
    var display = document.createElement("div");
    display.style.cssText = [
      "font-family:var(--font);font-size:clamp(.85rem,2.2vw,1.3rem);",
      "color:var(--ink);letter-spacing:.06em;line-height:1.8;",
      "text-align:center;max-width:min(36rem,80vw);",
      "text-shadow:0 0 18px color-mix(in srgb,var(--accent) 40%,transparent);",
      "min-height:2em;white-space:pre-wrap;word-break:break-word;"
    ].join("");
    display.textContent = "▌";
    ov.appendChild(hint); ov.appendChild(display);
    document.body.appendChild(ov);
    setTimeout(function(){ ov.style.opacity = "1"; }, 20);
    twText = "";

    function resetIdle() {
      clearTimeout(twIdleTimer);
      twIdleTimer = setTimeout(function() {
        if (twText.trim()) {
          var arr = loadCapsules();
          arr.unshift({ text: twText.trim(), t: Date.now() });
          if (arr.length > 20) arr = arr.slice(0, 20);
          saveCapsules(arr);
          logEvent("TYPEWRITER_SAVED", twText.slice(0,30));
          display.style.transition = "opacity 1.2s";
          display.style.opacity = "0";
        }
        setTimeout(closeTypewriter, 1400);
      }, 30000);
    }
    resetIdle();

    function onKey(e) {
      if (e.key === "Escape") { closeTypewriter(); return; }
      if (e.key === "Backspace") { twText = twText.slice(0,-1); }
      else if (e.key === "Enter") { twText += "\n"; }
      else if (e.key.length === 1) { twText += e.key; }
      else { return; }
      display.textContent = twText + "▌";
      resetIdle();
      playTick(e.key === "Enter");
    }
    ov._onKey = onKey;
    document.addEventListener("keydown", onKey);
  }

  function closeTypewriter() {
    if (!twActive) return;
    twActive = false;
    clearTimeout(twIdleTimer);
    var ov = document.getElementById("tw-overlay");
    if (ov) {
      if (ov._onKey) document.removeEventListener("keydown", ov._onKey);
      ov.style.opacity = "0";
      setTimeout(function(){ if(ov.parentNode) ov.remove(); }, 400);
    }
  }

  /* ════════════════════════════════════════════════
     VV · COUNTDOWN CAPSULE
     seal YYYY-MM-DD <message>
  ════════════════════════════════════════════════ */
  var COUNTDOWN_KEY = "qwl-countdown-v1";
  function loadCountdowns() {
    try { var d = localStorage.getItem(COUNTDOWN_KEY); return d ? JSON.parse(d) : []; }
    catch(e) { return []; }
  }
  function saveCountdowns(arr) {
    try { localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(arr)); } catch(e){}
  }

  function sealCapsule(dateStr, msg) {
    var unlockDate = new Date(dateStr + "T00:00:00");
    if (isNaN(unlockDate.getTime())) { termLine("// invalid date · use YYYY-MM-DD", "err"); return; }
    if (unlockDate <= new Date()) { termLine("// that date is in the past", "err"); return; }
    var arr = loadCountdowns();
    arr.push({ text: msg, unlock: unlockDate.getTime(), sealed: Date.now() });
    saveCountdowns(arr);
    var days = Math.ceil((unlockDate - new Date()) / 86400000);
    termLine("// sealed · unlocks in " + days + " day" + (days===1?"":"s") + " · " + dateStr, "ok");
    logEvent("COUNTDOWN_SEALED", dateStr + " · " + msg.slice(0,20));
  }

  function checkCountdowns() {
    var arr = loadCountdowns();
    var now = Date.now();
    var due = arr.filter(function(c){ return c.unlock <= now; });
    var future = arr.filter(function(c){ return c.unlock > now; });
    if (!due.length) return;
    saveCountdowns(future);
    due.forEach(function(c, idx) {
      setTimeout(function() {
        var ov = document.createElement("div");
        ov.style.cssText = [
          "position:fixed;inset:0;z-index:400;",
          "background:rgba(0,0,0,.88);backdrop-filter:blur(14px);",
          "display:flex;flex-direction:column;align-items:center;justify-content:center;",
          "gap:1.2rem;cursor:pointer;opacity:0;transition:opacity .5s;"
        ].join("");
        var label = document.createElement("div");
        label.style.cssText = "font-family:var(--font);font-size:.46rem;letter-spacing:.3em;color:var(--ink-dim);text-transform:uppercase;";
        label.textContent = "// 时间胶囊已解封 · 封存于 " + new Date(c.sealed).toLocaleDateString("zh-CN");
        var msgEl = document.createElement("div");
        msgEl.style.cssText = [
          "font-family:var(--font);font-size:clamp(.8rem,2.2vw,1.2rem);",
          "color:var(--ink);letter-spacing:.06em;text-align:center;",
          "max-width:min(32rem,80vw);line-height:1.8;",
          "text-shadow:0 0 28px var(--accent);"
        ].join("");
        msgEl.textContent = "";
        var closeHint = document.createElement("div");
        closeHint.style.cssText = "font-family:var(--font);font-size:.4rem;letter-spacing:.2em;color:var(--ink-dim);margin-top:.5rem;";
        closeHint.textContent = "// 点击任意位置关闭";
        ov.appendChild(label); ov.appendChild(msgEl); ov.appendChild(closeHint);
        document.body.appendChild(ov);
        setTimeout(function(){ ov.style.opacity = "1"; }, 20);
        var full = c.text, ci = 0;
        function typeReveal() {
          if (ci <= full.length) {
            msgEl.textContent = full.slice(0,ci) + (ci < full.length ? "▌" : "");
            ci++;
            setTimeout(typeReveal, 45 + Math.random()*25);
          }
        }
        setTimeout(typeReveal, 600);
        ov.addEventListener("click", function() {
          ov.style.opacity = "0";
          setTimeout(function(){ if(ov.parentNode) ov.remove(); }, 400);
        });
      }, idx * 800);
    });
  }
  setTimeout(checkCountdowns, 4000);

  /* ════════════════════════════════════════════════
     WHOAMI — fullscreen typewriter self-intro
  ════════════════════════════════════════════════ */
  // ── Edit your intro lines here ──────────────────
  var WHOAMI_LINES = [
    "qwertlexi",
    "signal from the noise.",
    "music · code · 低轨道漂流",
    "this terminal is a window.",
    "the rain never stops.",
  ];
  // ────────────────────────────────────────────────

  function showWhoami() {
    // Remove any existing overlay
    var old = document.getElementById("whoami-overlay");
    if (old) old.remove();

    var ov = document.createElement("div");
    ov.id = "whoami-overlay";
    ov.style.cssText = [
      "position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;",
      "align-items:center;justify-content:center;gap:1.1rem;",
      "pointer-events:none;opacity:0;transition:opacity .4s;"
    ].join("");
    document.body.appendChild(ov);
    setTimeout(function(){ ov.style.opacity = "1"; }, 20);

    var lineEls = [];
    WHOAMI_LINES.forEach(function(_, i) {
      var el = document.createElement("div");
      el.style.cssText = [
        "font-family:" + (i === 0 ? "var(--disp)" : "var(--font)") + ";",
        "font-size:" + (i === 0 ? "clamp(1.6rem,5vw,3rem)" : "clamp(.55rem,1.6vw,.85rem)") + ";",
        "font-weight:" + (i === 0 ? "700" : "400") + ";",
        "letter-spacing:" + (i === 0 ? ".08em" : ".2em") + ";",
        "color:var(--ink);opacity:.0;",
        "text-shadow:0 0 24px color-mix(in srgb,var(--accent) 60%,transparent);",
        "text-align:center;"
      ].join("");
      ov.appendChild(el);
      lineEls.push(el);
    });

    // Type each line sequentially
    var lineDelay = 0;
    WHOAMI_LINES.forEach(function(line, li) {
      var delay = lineDelay;
      lineDelay += line.length * 48 + 320;
      setTimeout(function() {
        var el = lineEls[li];
        el.style.opacity = "1";
        var ci = 0;
        function typeChar() {
          if (ci <= line.length) {
            el.textContent = line.slice(0, ci) + (ci < line.length ? "▌" : "");
            ci++;
            setTimeout(typeChar, 42 + Math.random() * 24);
          }
        }
        typeChar();
      }, delay);
    });

    // Fade out after all lines done
    setTimeout(function() {
      ov.style.opacity = "0";
      setTimeout(function(){ ov.remove(); }, 500);
    }, lineDelay + 2800);
  }

  /* ════════════════════════════════════════════════
     SHARED AUDIO CONTEXT + BEAT-REACTIVE RAIN
  ════════════════════════════════════════════════ */
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
    return audioCtx;
  }

  var beatAnalyser = null, beatBuf = null, beatSrc = null;
  var beatEnergy = 0, beatFlash = 0, lastBeatEnergy = 0;

  function initBeatAnalyser() {
    if (beatSrc) return; // already wired
    try {
      var bac = getAudioCtx();
      if (!bac) return;
      // Resume context if suspended (browser autoplay policy)
      if (bac.state === "suspended") bac.resume();
      beatAnalyser = bac.createAnalyser();
      beatAnalyser.fftSize = 512;
      beatAnalyser.smoothingTimeConstant = 0.2;  // less smoothing = sharper transients
      beatSrc = bac.createMediaElementSource(audio);
      beatSrc.connect(beatAnalyser);
      beatAnalyser.connect(bac.destination);
      beatBuf = new Uint8Array(beatAnalyser.frequencyBinCount);
    } catch(e) { beatAnalyser = null; beatSrc = null; }
  }

  function getBeatEnergy() {
    if (!beatAnalyser || !beatBuf || !beatOn) return 0;
    beatAnalyser.getByteFrequencyData(beatBuf);
    // bins 1-10 (skip DC bin 0), kick lives ~40-120Hz
    var sum = 0, n = 10;
    for (var i = 1; i <= n; i++) sum += beatBuf[i];
    return sum / n / 255;
  }

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

  /* ════════════════════════════════════════════════
     LL · DATE / ANNIVERSARY EASTER EGGS
     Edit SPECIAL_DATES below — MM-DD format.
     Each entry: phrase shown + optional rain color
     (null = keep current green).
  ════════════════════════════════════════════════ */
  // ── Edit your special dates here ────────────────
  var SPECIAL_DATES = [
  { md: "01-11", phrase: "happy birthday to me", color: "#00ffea" },
  { md: "04-24", phrase: "always a catch", color: null },
];
    // { md: "01-01", phrase: "新年快乐 · new signal, new year",   color: null },
    // { md: "10-31", phrase: "// ghost mode: maximum",            color: "#b44fff" },
    // { md: "02-14", phrase: "love is just signal with high snr", color: "#ff3b6b" },
    // Your birthday — uncomment and change MM-DD:
    // { md: "MM-DD", phrase: "happy birthday, qwertlexi",         color: "#ffe600" },

  // ────────────────────────────────────────────────

  (function checkSpecialDate() {
    if (!SPECIAL_DATES.length) return;
    var now = new Date();
    var md = (now.getMonth()+1 < 10 ? "0" : "") + (now.getMonth()+1)
           + "-" + (now.getDate()   < 10 ? "0" : "") + now.getDate();
    var match = null;
    for (var si = 0; si < SPECIAL_DATES.length; si++) {
      if (SPECIAL_DATES[si].md === md) { match = SPECIAL_DATES[si]; break; }
    }
    if (!match) return;

    // Show special phrase after boot settles
    setTimeout(function() {
      var pe = document.getElementById("ident-phrase");
      if (pe) {
        pe.style.opacity = "0";
        setTimeout(function() {
          pe.textContent = match.phrase;
          pe.style.opacity = "0.7";
          if (match.color) pe.style.color = match.color;
        }, 400);
      }
      // Tint rain head chars with custom color
      if (match.color) {
        var hex = match.color.replace("#","");
        window._specialDateRGB = [
          parseInt(hex.slice(0,2),16),
          parseInt(hex.slice(2,4),16),
          parseInt(hex.slice(4,6),16)
        ];
        document.documentElement.style.setProperty("--accent", match.color);
      }
      logEvent("SPECIAL_DATE", md + " · " + match.phrase.slice(0,30));
      termLine("// special date detected · " + md, "sys");
    }, 3500);
  })();

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
    logEvent("THEME_CHANGE", dark ? "dark" : "light");
  }

  if (ctrlTheme) ctrlTheme.addEventListener("click", function(){ setTheme(!isDark); });

  if (ctrlRain) {
    ctrlRain.addEventListener("click", function() {
      rainOn = !rainOn;
      rainEl.style.opacity = rainOn ? "1" : "0";
      ctrlRain.classList.toggle("is-off", !rainOn);
      logEvent("RAIN_TOGGLE", rainOn ? "on" : "off");
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

  // Inject beat + parting toggle buttons into ctrl strip
  (function() {
    var ctrlEl = document.querySelector(".ctrl");
    if (!ctrlEl) return;

    // Beat toggle button
    var btnBeat = document.createElement("button");
    btnBeat.className = "ctrl-btn";
    btnBeat.title = "音画联动 [B]";
    btnBeat.setAttribute("aria-label", "音画联动开关");
    btnBeat.innerHTML = "♫";
    btnBeat.addEventListener("click", function() {
      beatOn = !beatOn;
      btnBeat.classList.toggle("is-off", !beatOn);
      if (!beatOn) { beatFlash = 0; beatEnergy = 0; }
      logEvent("BEAT_TOGGLE", beatOn ? "on" : "off");
    });
    ctrlEl.appendChild(btnBeat);

    // Particle parting toggle button
    var btnPart = document.createElement("button");
    btnPart.className = "ctrl-btn";
    btnPart.title = "粒子拨开 [P]";
    btnPart.setAttribute("aria-label", "粒子拨开开关");
    btnPart.innerHTML = "⋮";
    btnPart.addEventListener("click", function() {
      partOn = !partOn;
      btnPart.classList.toggle("is-off", !partOn);
      // Reset all char offsets when turning off
      if (!partOn) {
        cols.forEach(function(col) {
          for (var j = 0; j < col.cox.length; j++) {
            col.cox[j] = 0; col.coy[j] = 0;
            col.cvx[j] = 0; col.cvy[j] = 0;
          }
        });
      }
      logEvent("PART_TOGGLE", partOn ? "on" : "off");
    });
    ctrlEl.appendChild(btnPart);

    // Keyboard shortcuts B and P
    document.addEventListener("keydown", function(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() === "b") btnBeat.click();
      if (e.key.toLowerCase() === "p") btnPart.click();
    });
  })();

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
    "// qwertlexi terminal · 指令列表",
    "─────────────────────────────────",
    "clear          清空终端",
    "time           当前时间",
    "fps            当前帧率",
    "about          关于本站",
    "whoami         自我介绍",
    "─────────────────────────────────",
    "rain on|off    矩阵雨 开/关",
    "speed s|n|f    雨速 慢/正常/快",
    "theme d|l      主题 暗/亮",
    "─────────────────────────────────",
    "visitors       访客计数",
    "leave <内容>   在留言墙留言",
    "history        本次访问记录",
    "capsule        时间胶囊",
    "typewriter     全屏打字机模式",
    "seal <日期> <内容>  倒计时胶囊",
    "lyrics         随机歌词",
    "ping <url>     连通性检测",
    "─────────────────────────────────",
    "Tab 自动补全  ·  ↑↓ 历史记录",
    "↑↑↓↓←→←→BA  — ???",
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
    // ── EDITABLE LYRICS SECTION: add / remove songs freely below ─
    girlsandboys: [
      "Love in the nineties is paranoid",
      "Always should be someone you really love",
    ],
    song2: [
      "All of the time but I\'m never sure if I need you, pleased to meet you!",
      "It wasn\'t easy, nothing is, no",
      "Well I lie and I\'m easy",
    ],
    // ── END EDITABLE LYRICS SECTION ──────────────────────────────
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
    logEvent("TERMINAL_OPEN", "");
  }
  function closeTerminal() {
    termOpen = false;
    termEl.classList.remove("is-open");
    termBackdrop.classList.remove("is-open");
    termEl.setAttribute("aria-hidden","true");
    if (termInput) termInput.blur();
    document.body.focus();
  }

  if (termClose) termClose.addEventListener("click", closeTerminal);
  if (termBackdrop) termBackdrop.addEventListener("click", closeTerminal);

  /* ════════════════════════════════════════════════
     U · HIDDEN WORD TRIGGERS
     These words aren't in help — discovery only.
  ════════════════════════════════════════════════ */
  var HIDDEN_WORDS = {
    "ghost":    { msg: "// ghost detected · signal origin: unknown · you were never really here",        type: "ok",  fx: "glitch" },
    "void":     { msg: "the void stares back · and it remembers your face",                              type: "ok",  fx: "dim" },
    "signal":   { msg: "// signal acquired · source unverified · proceed with caution",                  type: "sys", fx: "flash" },
    "dream":    { msg: "dreams are just memory leaks · beauty in the overflow",                          type: "ok",  fx: "dim" },
    "noise":    { msg: "all noise is signal you haven't decoded yet",                                    type: "sys", fx: null },
    "matrix":   { msg: null, type: null, fx: "matrix_quote" }, // special: random matrix quote
    "rain":     { msg: "// precipitation level: infinite · duration: forever",                          type: "sys", fx: null },
    "love":     { msg: "L-O-V-E · 4 bytes · insufficient to describe · but we try",                    type: "ok",  fx: "flash" },
    "death":    { msg: "// process termination scheduled · ETA: unknown · enjoy the runtime",           type: "err", fx: "glitch" },
    "hello":    { msg: "// hello, qwertlexi · identity confirmed · welcome to the signal",              type: "ok",  fx: null },
    "你好":     { msg: "// 信号已接收 · 身份：未知 · 欢迎进入矩阵",                                    type: "ok",  fx: null },
    "孤独":     { msg: "孤独是最稳定的加密算法 · 没有人能破解",                                        type: "ok",  fx: "dim" },
    "music":    { msg: "// audio codec active · 11 tracks loaded · play something",                     type: "sys", fx: null },
    "sleep":    { msg: "// hibernation mode unavailable · the signal never sleeps",                     type: "err", fx: "dim" },
    "why":      { msg: "because the noise needed a shape · and you gave it one",                        type: "ok",  fx: null },
    "qwertlexi":{ msg: "// identity: confirmed · you are the signal",                                   type: "ok",  fx: "flash" },
  };

  function triggerWord(word) {
    var entry = HIDDEN_WORDS[word.toLowerCase()];
    if (!entry) return false;

    // Special case: matrix quote
    if (entry.fx === "matrix_quote") {
      termLine(MATRIX_QUOTES[Math.floor(Math.random()*MATRIX_QUOTES.length)], "ok");
      return true;
    }

    if (entry.msg) termLine(entry.msg, entry.type || "ok");

    // Visual FX
    var glitchEl = document.getElementById("glitch-overlay");
    if (entry.fx === "glitch" && glitchEl) {
      glitchEl.className = "active-r";
      setTimeout(function(){ glitchEl.classList.add("active-b"); }, 40);
      setTimeout(function(){ glitchEl.className = ""; }, 260);
    } else if (entry.fx === "flash") {
      var fe = document.createElement("div");
      fe.style.cssText = "position:fixed;inset:0;z-index:9990;background:var(--accent);pointer-events:none;opacity:0;transition:opacity .06s";
      document.body.appendChild(fe);
      setTimeout(function(){ fe.style.opacity = "0.08"; }, 10);
      setTimeout(function(){ fe.style.opacity = "0"; }, 100);
      setTimeout(function(){ fe.remove(); }, 400);
    } else if (entry.fx === "dim") {
      var de = document.createElement("div");
      de.style.cssText = "position:fixed;inset:0;z-index:9990;background:#000;pointer-events:none;opacity:0;transition:opacity .4s";
      document.body.appendChild(de);
      setTimeout(function(){ de.style.opacity = "0.35"; }, 10);
      setTimeout(function(){ de.style.opacity = "0"; }, 900);
      setTimeout(function(){ de.remove(); }, 1400);
    }
    logEvent("HIDDEN_WORD", word);
    return true;
  }

  function runCmd(raw) {
    var line = raw.trim(); if (!line) return;
    termLine(line);
    var parts = line.split(/\s+/), cmd = parts[0].toLowerCase();
    // Log every command (except clear/help which are meta)
    if (cmd !== "clear" && cmd !== "help") logEvent("CMD", line);

    if (cmd === "help") { CMD_HELP.forEach(function(l){ termLine(l, "sys"); }); }
    else if (cmd === "clear") { if(termOutput) termOutput.innerHTML = ""; termLine("cleared.", "sys"); }
    else if (cmd === "time") { termLine(new Date().toString(), "sys"); }
    else if (cmd === "fps")  { termLine("current FPS: " + fpsVal, "sys"); }
    else if (cmd === "about") { termLine("qwertlexi · signal from the noise · local session · " + new Date().getFullYear(), "sys"); }
    else if (cmd === "visitors") {
      if (visitorCount !== null) {
        termLine("// " + visitorCount + " signals have entered this system", "ok");
        logEvent("CMD_VISITORS", String(visitorCount));
      } else {
        termLine("// querying the signal log…", "sys");
        fetchVisitorCount(false, function(n) {
          termLine("// " + n + " signals have entered this system", "ok");
        });
      }
    }
    else if (cmd === "wall") { showWall(); }
    else if (cmd === "leave") {
      var msg = parts.slice(1).join(" ").trim();
      postWall(msg);
    }
    else if (cmd === "history") { showHistory(); }
    else if (cmd === "whoami") { showWhoami(); }
    else if (cmd === "typewriter" || cmd === "tw") { openTypewriter(); }
    else if (cmd === "seal") {
      var dateArg = parts[1] || "";
      var msgArg  = parts.slice(2).join(" ").trim();
      if (!dateArg || !msgArg) {
        termLine("// usage: seal YYYY-MM-DD <内容>", "err");
        termLine("// 例：seal 2027-01-01 给未来的自己", "sys");
      } else {
        sealCapsule(dateArg, msgArg);
      }
    }
    else if (cmd === "matrix") {
      termLine(MATRIX_QUOTES[Math.floor(Math.random()*MATRIX_QUOTES.length)], "ok");
    }
    else if (cmd === "cyber") {
      termLine(CYBER_LINES[Math.floor(Math.random()*CYBER_LINES.length)], "ok");
    }
    else if (cmd === "lyrics") {
      termLine(ALL_LYRICS[Math.floor(Math.random()*ALL_LYRICS.length)], "ok");
    }
    else if (["go","birds","bestpart","oblivion","realiti","episode33","aboutyou","makeok","lipstick","girlsandboys","song2"].indexOf(cmd) !== -1) {
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
    else if (cmd === "ping") {
      var target = (parts[1]||"").trim();
      if (!target) { termLine("usage: ping <url>  e.g. ping google.com", "err"); }
      else {
        var pingUrl = target.match(/^https?:\/\//) ? target : "https://" + target;
        termLine("pinging " + pingUrl + " …", "sys");
        var t0 = performance.now();
        fetch(pingUrl, { method:"HEAD", mode:"no-cors", cache:"no-cache" })
          .then(function() {
            var ms = Math.round(performance.now() - t0);
            termLine("reply from " + target + " · " + ms + "ms · status: reachable", "ok");
          })
          .catch(function() {
            var ms = Math.round(performance.now() - t0);
            termLine("no reply from " + target + " · " + ms + "ms · host unreachable", "err");
          });
      }
    }
    else {
      // Check hidden word triggers first (full input, not just cmd)
      var fullLower = line.toLowerCase().trim();
      if (!triggerWord(fullLower) && !triggerWord(cmd)) {
        termLine("unknown signal: " + cmd, "err");
      }
    }
  }

  /* ════════════════════════════════════════════════
     KEYBOARD CLICK SOUNDS (Web Audio — no files)
  ════════════════════════════════════════════════ */
  function playTick(isEnter) {
    var ac = getAudioCtx(); if (!ac) return;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    if (isEnter) {
      osc.type = "square"; osc.frequency.setValueAtTime(180, ac.currentTime);
      gain.gain.setValueAtTime(0.08, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
      osc.start(); osc.stop(ac.currentTime + 0.12);
    } else {
      osc.type = "square"; osc.frequency.setValueAtTime(420 + Math.random()*80, ac.currentTime);
      gain.gain.setValueAtTime(0.03, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
      osc.start(); osc.stop(ac.currentTime + 0.04);
    }
  }



  /* ════════════════════════════════════════════════
     TERMINAL INPUT — with Tab autocomplete & sounds
  ════════════════════════════════════════════════ */
  var ALL_CMDS = ["help","clear","rain","speed","theme","time","echo","matrix","cyber","fps","capsule","about","lyrics",
    "go","birds","bestpart","oblivion","realiti","episode33","aboutyou","makeok","lipstick","girlsandboys","song2",
    "rain on","rain off","speed s","speed n","speed f","theme d","theme l","whoami","history","visitors","wall","leave","typewriter","tw","seal"];

  if (termInput) {
    var cmdHistory = [], histIdx = -1;
    termInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        playTick(true);
        var v = termInput.value;
        if (v.trim()) { cmdHistory.unshift(v); histIdx = -1; runCmd(v); }
        termInput.value = "";
      } else if (e.key === "Tab") {
        e.preventDefault();
        var val = termInput.value.trim().toLowerCase();
        if (!val) return;
        var matches = ALL_CMDS.filter(function(c){ return c.indexOf(val) === 0; });
        if (matches.length === 1) {
          termInput.value = matches[0];
        } else if (matches.length > 1) {
          termLine(matches.join("  "), "sys");
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (histIdx < cmdHistory.length - 1) { histIdx++; termInput.value = cmdHistory[histIdx]; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (histIdx > 0) { histIdx--; termInput.value = cmdHistory[histIdx]; }
        else { histIdx=-1; termInput.value=""; }
      } else if (e.key === "Escape") { closeTerminal(); }
      else if (e.key.length === 1) { playTick(false); }
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
      logEvent("CAPSULE_SAVED", text.slice(0, 24) + (text.length > 24 ? "…" : ""));
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
     SESSION LOG — S · history command
     Records every meaningful action this visit.
     `history` in terminal reveals the full log.
  ════════════════════════════════════════════════ */
  var SESSION_LOG = [];
  var SESSION_START = Date.now();

  function logEvent(action, detail) {
    var elapsed = Math.floor((Date.now() - SESSION_START) / 1000);
    var mm = Math.floor(elapsed / 60), ss = elapsed % 60;
    var ts = (mm > 0 ? mm + "m " : "") + ss + "s";
    var now = new Date();
    var hhmm = (now.getHours()<10?"0":"")+now.getHours()+":"+(now.getMinutes()<10?"0":"")+now.getMinutes()+":"+(now.getSeconds()<10?"0":"")+now.getSeconds();
    SESSION_LOG.push({ ts: ts, hhmm: hhmm, action: action, detail: detail || "" });
  }

  function showHistory() {
    if (!SESSION_LOG.length) { termLine("no events recorded yet.", "sys"); return; }
    termLine("// session log — " + new Date().toLocaleDateString() + " · " + SESSION_LOG.length + " events", "sys");
    SESSION_LOG.forEach(function(e) {
      var line = "[+" + e.ts + "]  " + e.hhmm + "  " + e.action + (e.detail ? "  · " + e.detail : "");
      termLine(line, "ok");
    });
    termLine("// end of log", "sys");
  }

  // Log session start
  logEvent("SESSION_START", "identity: qwertlexi");

  /* ════════════════════════════════════════════════
     Z · VISITOR COUNTER
     Uses counterapi.com V1 — free, no signup needed.
     Each unique visitor (tracked via localStorage)
     increments the count once per browser.
     Terminal: `visitors` to query.
  ════════════════════════════════════════════════ */
  var VISITOR_NS  = "qwertlexi";       // your namespace
  var VISITOR_KEY = "signal-count";    // your counter key
  var VISITOR_API = "https://api.counterapi.com/v1/" + VISITOR_NS + "/" + VISITOR_KEY;

  var visitorCount = null; // cached after first fetch

  function fetchVisitorCount(hit, cb) {
    // hit=true increments, hit=false just reads
    var url = hit ? VISITOR_API + "/up" : VISITOR_API;
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        visitorCount = d.count !== undefined ? d.count : (d.value || "?");
        if (cb) cb(visitorCount);
      })
      .catch(function() { if (cb) cb("signal lost"); });
  }

  // On page load: increment only if first visit from this browser
  (function() {
    var key = "qwl-visited-v1";
    var hasVisited = false;
    try { hasVisited = !!localStorage.getItem(key); } catch(e) {}
    if (!hasVisited) {
      fetchVisitorCount(true, function(n) {
        try { localStorage.setItem(key, "1"); } catch(e) {}
        visitorCount = n;
      });
    } else {
      fetchVisitorCount(false, function(n) { visitorCount = n; });
    }
  })();

  /* ════════════════════════════════════════════════
     PP · VISITOR WALL
     Messages stored as GitHub Issue comments.
     Terminal: `wall` to read · `leave <msg>` to post
     ── CONFIG ─────────────────────────────────────
     Set WALL_ISSUE to your Issue number after creating
     a "// WALL · signal log" issue in your repo.
  ════════════════════════════════════════════════ */
  var WALL_REPO   = "qwertlexi/qwertlefile15.github.io";
  var WALL_ISSUE  = 1;  // ← change to your issue number
  var WALL_PROXY  = "https://qwl-proxy.altojane173.workers.dev";
  var WALL_API    = "https://api.github.com/repos/" + WALL_REPO + "/issues/" + WALL_ISSUE + "/comments";

  function wallFetch(method, body, cb) {
    var url = WALL_PROXY + "?target=" + encodeURIComponent(WALL_API);
    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify({ body: body }) : undefined
    })
    .then(function(r) { return r.json(); })
    .then(function(d) { cb(null, d); })
    .catch(function(e) { cb(e); });
  }

  function showWall() {
    termLine("// fetching signal wall…", "sys");
    wallFetch("GET", null, function(err, data) {
      if (err || !Array.isArray(data)) {
        termLine("// wall unreachable · " + (err ? err.message : "bad response"), "err");
        return;
      }
      if (!data.length) {
        termLine("// wall is empty · be the first signal", "sys");
        return;
      }
      termLine("// signal wall · last " + Math.min(data.length, 8) + " entries", "sys");
      var recent = data.slice(-8).reverse();
      recent.forEach(function(c) {
        var d = new Date(c.created_at);
        var ds = d.getFullYear() + "·" + (d.getMonth()+1<10?"0":"") + (d.getMonth()+1)
               + "·" + (d.getDate()<10?"0":"") + d.getDate();
        termLine("[" + ds + "]  " + c.body, "ok");
      });
      logEvent("WALL_READ", data.length + " entries");
    });
  }

  function postWall(msg) {
    if (!msg || msg.length < 1) { termLine("usage: leave <your message>", "err"); return; }
    if (msg.length > 140) { termLine("// max 140 chars · " + msg.length + " given", "err"); return; }
    termLine("// transmitting signal…", "sys");
    wallFetch("POST", msg, function(err, data) {
      if (err || data.message) {
        termLine("// transmission failed · " + (data && data.message ? data.message : "unknown error"), "err");
        return;
      }
      termLine("// signal received · wall updated", "ok");
      logEvent("WALL_POST", msg.slice(0, 30));
    });
  }

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
    { title:"GO",                   artist:"BLACKPINK",              src:"music/BLACKPINK - GO.mp3",                         lyricsKey:"go" },
    { title:"BIRDS OF A FEATHER",   artist:"Billie Eilish",          src:"music/Billie Eilish - BIRDS OF A FEATHER.mp3",     lyricsKey:"birds" },
    { title:"Girls & Boys",         artist:"blur",                   src:"music/Blur - Girls & Boys (2012 Remaster).mp3",    lyricsKey:"girlsandboys" },
    { title:"Song 2",               artist:"blur",                   src:"music/Blur - Song 2 (2012 Remaster).mp3",          lyricsKey:"song2" },
    { title:"Best Part",            artist:"Daniel Caesar / H.E.R.", src:"music/Daniel Caesar; H.E.R. - Best Part.mp3",      lyricsKey:"bestpart" },
    { title:"Oblivion",             artist:"Grimes",                 src:"music/Grimes - Oblivion.mp3",                      lyricsKey:"oblivion" },
    { title:"REALiTi",              artist:"Grimes",                 src:"music/Grimes - Realiti.mp3",                       lyricsKey:"realiti" },
    { title:"Episode 33",           artist:"She Her Her Hers",       src:"music/She Her Her Hers - Episode 33.mp3",          lyricsKey:"episode33" },
    { title:"About You",            artist:"The 1975",               src:"music/The 1975 - About You.mp3",                   lyricsKey:"aboutyou" },
    { title:"How Can I Make It OK?",artist:"Wolf Alice",             src:"music/Wolf Alice - How Can I Make It OK_.mp3",     lyricsKey:"makeok" },
    { title:"Lipstick On The Glass",artist:"Wolf Alice",             src:"music/Wolf Alice - Lipstick On The Glass.mp3",     lyricsKey:"lipstick" },
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

  audio.addEventListener("play",  function(){
    setPlayUI(true);
    if (TRACKS[curIdx]) logEvent("MUSIC_PLAY", TRACKS[curIdx].title + " — " + TRACKS[curIdx].artist);
  });
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
     H · TYPEWRITER LYRICS — shows on ident-phrase
     Cycles through current track's lyrics while playing
  ════════════════════════════════════════════════ */
  var lyricT = null, lyricIdx = 0, lyricDeleteT = null;

  function showLyricLine(line) {
    var pe = document.getElementById("ident-phrase");
    if (!pe) return;
    // clear any pending timers
    clearTimeout(lyricT); clearTimeout(lyricDeleteT);
    // typewriter in
    pe.style.opacity = "0.7";
    pe.textContent = "";
    var i = 0;
    function typeIn() {
      if (i <= line.length) {
        pe.textContent = line.slice(0, i) + (i < line.length ? "▌" : "");
        i++;
        lyricT = setTimeout(typeIn, 38 + Math.random()*22);
      } else {
        // hold, then fade out
        lyricDeleteT = setTimeout(function() {
          pe.style.opacity = "0";
        }, 3200);
      }
    }
    typeIn();
  }

  function scheduleLyric() {
    clearTimeout(lyricT); clearTimeout(lyricDeleteT);
    if (audio.paused || curIdx < 0) return;
    var t = TRACKS[curIdx];
    var pool = t.lyricsKey && LYRICS[t.lyricsKey];
    if (!pool || !pool.length) return;
    showLyricLine(pool[lyricIdx % pool.length]);
    lyricIdx++;
    // next lyric in 7-12s
    lyricT = setTimeout(scheduleLyric, 7000 + Math.random()*5000);
  }

  audio.addEventListener("play", function() {
    initBeatAnalyser();
    lyricIdx = 0;
    lyricT = setTimeout(scheduleLyric, 1800);
  });
  audio.addEventListener("pause", function() {
    clearTimeout(lyricT); clearTimeout(lyricDeleteT);
    var pe = document.getElementById("ident-phrase");
    if (pe) pe.style.opacity = "";
  });

  /* ════════════════════════════════════════════════
     I · TERMINAL ping COMMAND
  ════════════════════════════════════════════════ */
  // Hooked in via runCmd — see patch below

  /* ════════════════════════════════════════════════
     J · KONAMI CODE → RGB GLITCH STORM
  ════════════════════════════════════════════════ */
  var KONAMI = [38,38,40,40,37,39,37,39,66,65];
  var konamiPos = 0;
  document.addEventListener("keydown", function(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.keyCode === KONAMI[konamiPos]) {
      konamiPos++;
      if (konamiPos === KONAMI.length) {
        konamiPos = 0;
        logEvent("KONAMI", "ghost protocol activated");
        triggerKonami();
      }
    } else {
      konamiPos = (e.keyCode === KONAMI[0]) ? 1 : 0;
    }
  });

  function triggerKonami() {
    // 1. Full-screen flash overlay
    var flashEl = document.createElement("div");
    flashEl.style.cssText = "position:fixed;inset:0;z-index:9998;background:#7fd9d0;pointer-events:none;opacity:0;transition:opacity .08s";
    document.body.appendChild(flashEl);
    setTimeout(function(){ flashEl.style.opacity = "0.18"; }, 10);
    setTimeout(function(){ flashEl.style.opacity = "0"; }, 120);
    setTimeout(function(){ flashEl.remove(); }, 600);

    // 2. Show big centred ghost-protocol message
    var msgEl = document.createElement("div");
    msgEl.style.cssText = [
      "position:fixed;inset:0;z-index:9997;display:flex;flex-direction:column;",
      "align-items:center;justify-content:center;pointer-events:none;",
      "font-family:var(--font);color:var(--accent);text-align:center;",
      "text-shadow:0 0 40px var(--accent),0 0 80px var(--accent2);"
    ].join("");
    msgEl.innerHTML = [
      "<div style=\"font-size:clamp(.55rem,1.8vw,.9rem);letter-spacing:.4em;opacity:.5;margin-bottom:.6rem\">// SEQUENCE ACCEPTED</div>",
      "<div style=\"font-family:var(--disp);font-size:clamp(1.4rem,5vw,3.2rem);font-weight:700;letter-spacing:.1em\">GHOST PROTOCOL</div>",
      "<div style=\"font-size:clamp(.45rem,1.4vw,.7rem);letter-spacing:.3em;opacity:.4;margin-top:.5rem\">IDENTITY · VERIFIED · CLEARANCE · MAX</div>"
    ].join("");
    document.body.appendChild(msgEl);
    // fade in
    msgEl.style.opacity = "0";
    msgEl.style.transition = "opacity .3s";
    setTimeout(function(){ msgEl.style.opacity = "1"; }, 20);
    setTimeout(function(){ msgEl.style.opacity = "0"; }, 2200);
    setTimeout(function(){ msgEl.remove(); }, 2600);

    // 3. Rapid-fire glitch bursts — more intense
    var glitchEl = document.getElementById("glitch-overlay");
    var count = 0;
    function burstGlitch() {
      if (!glitchEl || count > 28) return;
      glitchEl.className = count % 2 === 0 ? "active-r" : "active-b";
      setTimeout(function() { glitchEl.className = ""; }, 50);
      count++;
      setTimeout(burstGlitch, 55 + Math.random()*50);
    }
    burstGlitch();

    // 4. Rain: flood with columns, max speed, then restore
    var prevSpeed = speedIdx;
    speedIdx = 2;
    var h2 = window.innerHeight;
    // triple density for 5s
    var extraCols = [];
    for (var ei = 0; ei < cols.length * 2; ei++) extraCols.push(makeCol(h2, true));
    cols = cols.concat(extraCols);
    setTimeout(function() {
      speedIdx = prevSpeed;
      initRain();
    }, 5000);

    // 5. Scramble name 5 times fast
    var sc = 0;
    function doKonamiScramble() {
      if (sc++ >= 5) return;
      if (typeof scrambleOut === "function") {
        scrambleOut(function() {
          setTimeout(function() {
            scrambleIn(function() { setTimeout(doKonamiScramble, 200); });
          }, 60);
        });
      }
    }
    doKonamiScramble();

    // 6. Rainbow rain for ~10s (600 frames @ 60fps)
    rainbowMode = 600;

    // 7. Log to terminal silently (don't open it)
    termLine("// GHOST PROTOCOL ACTIVATED · identity: qwertlexi", "ok");
  }

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
    // Use animationend for reliable removal, with a fallback timeout
    function removeBoot() { overlay.classList.add("done"); }
    overlay.addEventListener("animationend", removeBoot, { once: true });
    setTimeout(removeBoot, 6000); // fallback in case animationend doesn't fire
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

  /* ════════════════════════════════════════════════
     X · DYNAMIC PAGE TITLE
  ════════════════════════════════════════════════ */
  (function() {
    var BASE = "qwertlexi · sys";
    var IDLE_TITLES = [
      "// signal fading…",
      "// idle · noise only",
      "// where did you go",
      "// still here · waiting",
    ];
    var RETURN_TITLES = [
      "// signal restored",
      "// you came back",
      "// reconnecting…",
    ];
    var titleCycle = ["qwertlexi · sys", "qwertlexi · online", "signal from the noise", "// sys · nominal"];
    var cycleIdx = 0;

    // Slow ambient title cycling while on page
    setInterval(function() {
      if (!document.hidden) {
        cycleIdx = (cycleIdx + 1) % titleCycle.length;
        document.title = titleCycle[cycleIdx];
      }
    }, 4000);

    // Tab hidden/visible
    document.addEventListener("visibilitychange", function() {
      if (document.hidden) {
        document.title = IDLE_TITLES[Math.floor(Math.random() * IDLE_TITLES.length)];
      } else {
        var t = RETURN_TITLES[Math.floor(Math.random() * RETURN_TITLES.length)];
        document.title = t;
        setTimeout(function() { document.title = BASE; }, 2000);
      }
    });
  })();

  /* ════════════════════════════════════════════════
     IOS INPUT ZOOM PREVENTION
     iOS zooms when input font-size < 16px on focus.
     Temporarily set 16px on focus, restore on blur.
  ════════════════════════════════════════════════ */
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    document.addEventListener("focusin", function(e) {
      var el = e.target;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.dataset.origFontSize = el.style.fontSize || "";
        el.style.fontSize = "16px";
      }
    });
    document.addEventListener("focusout", function(e) {
      var el = e.target;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.style.fontSize = el.dataset.origFontSize || "";
        delete el.dataset.origFontSize;
      }
    });
  }

})();
