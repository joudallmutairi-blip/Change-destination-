(function () {
  "use strict";
  var C = window.CONFIG, D = C.destinations, KEY = "tgw_progress_v1";
  var $ = function (id) { return document.getElementById(id); };
  var state = { started: false, opened: [], final: false };
  var map = null, markers = [], routeLayers = [], finalMarker = null, current = -1, muted = false, shown = true, audioCtx = null;

  /* ===== التحليلات: جاهزة للربط (GA4 / GTM) ===== */
  function track(name, params) {
    params = params || {};
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params);
      if (window.dataLayer && window.dataLayer.push) window.dataLayer.push(Object.assign({ event: name }, params));
    } catch (e) {}
    if (window.console) console.log("[event]", name, params);
  }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s) state = Object.assign(state, s); } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function beep(f) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f || 660; g.gain.value = 0.08; o.connect(g); g.connect(audioCtx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4); o.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  }

  function initMap() {
    if (typeof L === "undefined") return false;
    try {
      map = L.map("map", { zoomControl: false, attributionControl: true }).setView(C.center, C.zoom);
      var layer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
      var errs = 0; layer.on("tileerror", function () { if (++errs === 6) showFallback(); });
      L.marker(C.userStart, { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18] }), interactive: false }).addTo(map);
      C.decoRoutes.forEach(function (r) { L.polyline(r.pts, { color: r.color, weight: 4, opacity: .55, dashArray: "2 10", lineCap: "round" }).addTo(map); });
      D.forEach(function (d, i) {
        var m = L.marker(d.pos, { icon: pinIcon(d, i) }).addTo(map);
        m.on("click", function () { openCard(i); }); markers.push(m);
      });
      return true;
    } catch (e) { map = null; return false; }
  }
  function pinIcon(d, i) {
    var cls = "pin" + (state.opened.indexOf(i) > -1 ? " done" : "");
    return L.divIcon({ className: "", html: '<div class="' + cls + '" style="background:' + d.color + '"><span>' + d.icon + '</span></div>', iconSize: [44, 44], iconAnchor: [22, 44] });
  }
  function path() { var p = [C.userStart]; state.opened.forEach(function (i) { p.push(D[i].pos); }); return p; }
  function drawRoutes(animateLast) {
    if (!map) return;
    routeLayers.forEach(function (l) { map.removeLayer(l); }); routeLayers = [];
    var p = path();
    for (var k = 1; k < p.length; k++) {
      var l = L.polyline([p[k - 1], p[k]], { color: C.colors.green, weight: 7, opacity: .95, lineCap: "round", className: (animateLast && k === p.length - 1) ? "route-new" : "" }).addTo(map);
      routeLayers.push(l);
    }
  }
  function updateProgress() {
    var n = state.opened.length;
    $("progText").textContent = n + " من 3 وجهات";
    $("progBar").style.width = (n / 3 * 100) + "%";
    markers.forEach(function (m, i) { m.setIcon(pinIcon(D[i], i)); });
    renderFallback();
  }

  function openCard(i) {
    if (!state.started) return;
    current = i; var d = D[i];
    $("cardIcon").textContent = d.icon; $("cardTitle").textContent = d.name;
    $("cardPlace").textContent = d.place; $("cardText").textContent = d.card;
    var done = state.opened.indexOf(i) > -1;
    $("discoverBtn").textContent = done ? "تم اكتشافها ✓" : "اكتشف الوجهة";
    $("discoverBtn").disabled = done;
    $("card").classList.add("open");
    if (map) map.flyTo(d.pos, 13, { duration: .8 });
    track("destination_open", { destination: d.id });
  }
  function closeCard() { $("card").classList.remove("open"); }
  function discover() {
    if (current < 0 || state.opened.indexOf(current) > -1) return;
    state.opened.push(current); save();
    track("destination_discovered", { destination: D[current].id, count: state.opened.length });
    beep(520 + state.opened.length * 140); closeCard();
    drawRoutes(true); updateProgress();
    if (map) map.flyToBounds(L.latLngBounds(path()), { padding: [60, 60], duration: 1 });
    if (state.opened.length < 3) toast(C.text.teasers[state.opened.length - 1]);
    else { track("all_destinations_complete"); toast("اكتملت الوجهات الثلاث!"); setTimeout(revealFinal, 1800); }
  }

  function revealFinal() {
    if (state.opened.length < 3) return; /* حماية: لا مفاجأة قبل اكتمال الوجهات */
    state.final = true; save();
    if (map) {
      var f = C.final.pos;
      if (!finalMarker) finalMarker = L.marker(f, { icon: L.divIcon({ className: "", html: '<div class="pin pulse" style="background:' + C.colors.green + '"><span>🏁</span></div>', iconSize: [44, 44], iconAnchor: [22, 44] }) }).addTo(map);
      L.polyline([D[2].pos, f], { color: C.colors.green, weight: 7, className: "route-new" }).addTo(map);
      map.flyTo(f, 14, { duration: 1.6 });
    }
    beep(880);
    setTimeout(function () { $("final").classList.add("open"); track("final_reached"); }, map ? 2000 : 300);
  }

  function renderFallback() {
    var box = $("fbList"); if (!box) return; box.innerHTML = "";
    D.forEach(function (d, i) {
      var b = document.createElement("button");
      b.textContent = d.icon + " " + d.name + (state.opened.indexOf(i) > -1 ? " ✓" : "");
      b.onclick = function () { openCard(i); }; box.appendChild(b);
    });
  }
  function showFallback() { $("fbMsg").textContent = C.text.mapError; $("fallback").hidden = false; renderFallback(); }

  function begin() {
    state.started = true; save(); track("exploration_start");
    $("start").classList.remove("open"); $("topbar").hidden = false; $("tools").hidden = false;
    updateProgress(); beep(440);
    setTimeout(function () { toast(C.text.alert); }, 500);
    if (map) map.flyTo(C.center, 12, { duration: 1 });
  }

  function setup() {
    var r = document.documentElement.style; r.setProperty("--g", C.colors.green); r.setProperty("--dark", C.colors.dark); r.setProperty("--bg", C.colors.bg);
    $("clubLogo").src = C.clubLogo; $("fClub").src = C.clubLogo; $("fHack").src = C.hackathonLogo;
    $("startLine").textContent = C.text.startLine; $("startBtn").textContent = C.text.startBtn;
    $("fTitle").textContent = C.text.title; $("fNext").textContent = C.text.finalNext; $("fName").textContent = C.text.finalName;
    $("fLine").textContent = C.text.finalLine; $("fSlogan").textContent = C.text.slogan;
    $("regBtn").textContent = C.text.registerBtn; $("regBtn").href = C.registerUrl;
    $("regBtn").addEventListener("click", function () { track("register_click"); });
    $("startBtn").onclick = begin; $("discoverBtn").onclick = discover; $("closeBtn").onclick = closeCard;
    $("muteBtn").onclick = function () { muted = !muted; this.textContent = muted ? "🔇" : "🔊"; };
    $("recenterBtn").onclick = function () { if (map) map.flyTo(C.center, C.zoom, { duration: .8 }); };
    $("toggleBtn").onclick = function () {
      shown = !shown;
      markers.forEach(function (m) { shown ? m.addTo(map) : map.removeLayer(m); });
      if (!map) { $("fallback").hidden = !shown; }
      toast(shown ? "تم إظهار الوجهات" : "تم إخفاء الوجهات");
    };
  }

  load(); setup(); track("page_view");
  if (!initMap()) showFallback();
  if (state.started) { $("start").classList.remove("open"); $("topbar").hidden = false; $("tools").hidden = false; drawRoutes(false); updateProgress(); if (state.final && state.opened.length >= 3) revealFinal(); }
  else if (!map) { $("fallback").hidden = true; }
  /* في حال فشل الخريطة قبل البدء تظهر القائمة بعد الضغط على ابدأ */
  var _b = begin; begin = function () { _b(); if (!map) $("fallback").hidden = false; };
  $("startBtn").onclick = begin;
})();
