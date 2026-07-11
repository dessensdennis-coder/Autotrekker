/* Reunion mode: take/choose a photo -> face -> top-3 classmates with a
   playful percentage. We use the phone's native camera (a file input with
   capture) instead of a live getUserMedia preview — that works reliably on
   both iPhone and Android, also as an installed app. */
const Reunion = (() => {
  const els = {};
  let people = [];

  const DET_W = 1000;

  /* ---------- screen state ---------- */
  async function onEnter() {
    people = await Store.all();
    resetResult();
    const has = people.length > 0;
    els.empty.classList.toggle('hidden', has);
    els.actions.classList.toggle('hidden', !has);
  }
  function onLeave() { /* niets meer te stoppen */ }

  function resetResult() {
    els.result.classList.add('hidden');
    els.result.innerHTML = '';
    els.again.classList.add('hidden');
  }

  /* ---------- matching ---------- */
  function distanceToScore(dist) {
    return Math.max(30, Math.min(99, Math.round(100 - (dist - 0.35) * 85)));
  }
  function vibe(dist) {
    if (dist < 0.5) return '🔥 Strong match!';
    if (dist < 0.65) return '😃 Could well be';
    if (dist < 0.8) return '🤔 Maybe…';
    return '🎲 Wild guess';
  }

  async function matchFrom(source) {
    resetResult();
    showBusy('Looking at the face…');
    await Models.load(showBusy);
    const cnv = await Models.uprightCanvas(source, DET_W);
    let det = await faceapi
      .detectSingleFace(cnv, Models.detectorOpts())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) {
      // terugval op het lichte model (helpt op oudere/zwakkere toestellen)
      det = await faceapi
        .detectSingleFace(cnv, Models.tinyOpts())
        .withFaceLandmarks()
        .withFaceDescriptor();
    }
    hideBusy();

    if (!det) {
      renderMessage('🙈 No face detected. Try head-on and with a bit more light.');
      els.again.classList.remove('hidden');
      return;
    }

    const scored = people.map(p => ({
      person: p,
      dist: faceapi.euclideanDistance(det.descriptor, p.descriptor),
    })).sort((a, b) => a.dist - b.dist);

    const top = scored.slice(0, 3);
    renderResults(top, cnv, det.detection.box);
    if (top[0].dist < 0.55) Confetti.burst();
  }

  /* ---------- rendering ---------- */
  function renderResults(top, cnv, box) {
    els.result.innerHTML = '';
    const captured = Models.cropFace(cnv, box);
    const head = document.createElement('div');
    head.innerHTML = `<img class="captured-face" src="${captured}" alt="your photo">
      <p class="result-caption">Most likely from the yearbook:</p>`;
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
          <div class="match-vibe">${i === 0 ? vibe(m.dist) : 'also possible'}</div>
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

  /* ---------- input: neem foto (systeemcamera) of kies uit galerij ---------- */
  async function fromFile(file) {
    els.actions.classList.add('hidden');
    const src = await Models.decodeImage(file);
    matchFrom(src).catch(err => { console.error(err); hideBusy(); renderMessage('Something went wrong.'); });
  }

  function again() {
    resetResult();
    els.actions.classList.remove('hidden');
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
    els.actions = document.getElementById('reunion-actions');
    els.result = document.getElementById('reunion-result');
    els.empty = document.getElementById('reunion-empty');
    els.again = document.getElementById('btn-again');

    document.getElementById('btn-again').addEventListener('click', again);
    const onPick = e => { const f = e.target.files[0]; if (f) fromFile(f); e.target.value = ''; };
    document.getElementById('reunion-camera-file').addEventListener('change', onPick);
    document.getElementById('reunion-file').addEventListener('change', onPick);
  }

  return { init, onEnter, onLeave };
})();
