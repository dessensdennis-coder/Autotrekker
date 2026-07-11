/* Reünie-modus: camera -> gezicht -> top-3 klasgenoten met speels percentage. */
const Reunion = (() => {
  const els = {};
  let stream = null;
  let people = [];

  const DET_W = 1000;

  /* ---------- camera ---------- */
  async function startCamera() {
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      els.video.srcObject = stream;
      await els.video.play();
      els.camera.classList.remove('hidden');
    } catch (e) {
      // geen camera-toegang: dan werkt de galerij-knop nog altijd
      console.warn('Camera niet beschikbaar', e);
      els.camera.classList.add('hidden');
    }
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    els.video.srcObject = null;
  }

  /* ---------- schermstaat ---------- */
  async function onEnter() {
    people = await Store.all();
    resetResult();
    const has = people.length > 0;
    els.empty.classList.toggle('hidden', has);
    els.actions.classList.toggle('hidden', !has);
    els.canvas.classList.add('hidden');
    if (has) startCamera(); else els.camera.classList.add('hidden');
  }
  function onLeave() { stopCamera(); }

  function resetResult() {
    els.result.classList.add('hidden');
    els.result.innerHTML = '';
    els.again.classList.add('hidden');
  }

  /* ---------- matchen ---------- */
  function distanceToScore(dist) {
    return Math.max(30, Math.min(99, Math.round(100 - (dist - 0.35) * 85)));
  }
  function vibe(dist) {
    if (dist < 0.5) return '🔥 Sterke gelijkenis!';
    if (dist < 0.65) return '😃 Zou zomaar kunnen';
    if (dist < 0.8) return '🤔 Misschien…';
    return '🎲 Wilde gok';
  }

  async function matchFrom(source) {
    resetResult();
    showBusy('Gezicht bekijken…');
    await Models.load(showBusy);
    const det = await faceapi
      .detectSingleFace(Models.toCanvas(source, DET_W), Models.detectorOpts())
      .withFaceLandmarks()
      .withFaceDescriptor();
    hideBusy();

    if (!det) {
      renderMessage('🙈 Geen gezicht herkend. Probeer het recht van voren en met wat meer licht.');
      els.again.classList.remove('hidden');
      return;
    }

    const scored = people.map(p => ({
      person: p,
      dist: faceapi.euclideanDistance(det.descriptor, p.descriptor),
    })).sort((a, b) => a.dist - b.dist);

    const top = scored.slice(0, 3);
    renderResults(top, source, det.detection.box);
    if (top[0].dist < 0.55) Confetti.burst();
  }

  /* ---------- rendering ---------- */
  function faceThumbFromSource(source, box, canvasW) {
    // box is in DET_W-coördinaten; herbereken naar de bronresolutie
    const c = Models.toCanvas(source, DET_W);
    return Models.cropFace(c, box);
  }

  function renderResults(top, source, box) {
    els.result.innerHTML = '';
    const captured = faceThumbFromSource(source, box);
    const head = document.createElement('div');
    head.innerHTML = `<img class="captured-face" src="${captured}" alt="jouw foto">
      <p class="result-caption">Meest waarschijnlijk uit het jaarboek:</p>`;
    els.result.appendChild(head);

    top.forEach((m, i) => {
      const pct = distanceToScore(m.dist);
      const card = document.createElement('div');
      card.className = 'match-card' + (i === 0 ? ' top' : '');
      card.style.animationDelay = (i * 0.08) + 's';
      card.innerHTML = `
        <span class="rank">#${i + 1}</span>
        <img class="match-thumb" src="${m.person.thumb}" alt="${esc(m.person.name)}">
        <div class="match-body">
          <div class="match-name">${esc(m.person.name)}</div>
          <div class="match-vibe">${i === 0 ? vibe(m.dist) : 'ook mogelijk'}</div>
          <div class="match-meter"><i style="width:0"></i></div>
        </div>
        <div class="match-pct">${pct}%</div>`;
      els.result.appendChild(card);
      requestAnimationFrame(() =>
        setTimeout(() => { card.querySelector('.match-meter > i').style.width = pct + '%'; }, 60));
    });

    els.result.classList.remove('hidden');
    els.again.classList.remove('hidden');
    els.result.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderMessage(msg) {
    els.result.innerHTML = `<div class="empty-note"><p>${esc(msg)}</p></div>`;
    els.result.classList.remove('hidden');
  }

  /* ---------- capture ---------- */
  function shoot() {
    const v = els.video;
    if (!v.videoWidth) { alert('Camera is nog niet klaar.'); return; }
    const c = els.canvas;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    stopCamera();
    els.camera.classList.add('hidden');
    els.actions.classList.add('hidden');
    els.canvas.classList.remove('hidden');
    matchFrom(c).catch(err => { console.error(err); hideBusy(); renderMessage('Er ging iets mis.'); });
  }

  async function fromFile(file) {
    stopCamera();
    els.camera.classList.add('hidden');
    els.actions.classList.add('hidden');
    // EXIF-correct inlezen; matchFrom werkt met een canvas net zo goed als met een img
    const work = await Models.fileToCanvas(file, DET_W);
    matchFrom(work).catch(err => { console.error(err); hideBusy(); renderMessage('Er ging iets mis.'); });
  }

  function again() {
    resetResult();
    els.canvas.classList.add('hidden');
    els.actions.classList.remove('hidden');
    startCamera();
  }

  /* ---------- busy overlay (hergebruikt result-gebied) ---------- */
  function showBusy(t) {
    els.result.innerHTML = `<div class="progress"><div class="spinner"></div><span>${esc(t)}</span></div>`;
    els.result.classList.remove('hidden');
  }
  function hideBusy() { /* renderResults/Message overschrijft het */ }

  function esc(s) {
    return (s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init() {
    els.video = document.getElementById('video');
    els.camera = document.getElementById('reunion-camera');
    els.canvas = document.getElementById('capture-canvas');
    els.actions = document.getElementById('reunion-actions');
    els.result = document.getElementById('reunion-result');
    els.empty = document.getElementById('reunion-empty');
    els.again = document.getElementById('btn-again');

    document.getElementById('btn-shoot').addEventListener('click', shoot);
    document.getElementById('btn-again').addEventListener('click', again);
    document.getElementById('reunion-file').addEventListener('change', e => {
      if (e.target.files[0]) fromFile(e.target.files[0]);
    });
  }

  return { init, onEnter, onLeave };
})();
