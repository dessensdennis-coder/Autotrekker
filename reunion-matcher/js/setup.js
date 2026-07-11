/* Setup-modus: jaarboekpagina inlezen -> gezichten + namen -> controle -> opslaan. */
const Setup = (() => {
  const els = {};
  let _worker = null;
  let pending = [];   // {thumb, name, descriptor:Array, include:bool}

  // werkresolutie: leesbaar voor OCR, behapbaar voor de telefoon.
  // Via localStorage 'klas76_maxw' te verlagen (bv. voor tragere apparaten/tests).
  const MAX_W = +localStorage.getItem('klas76_maxw') || 2200;

  /* ---------- Tesseract ---------- */
  async function getWorker(onStatus) {
    if (_worker) return _worker;
    onStatus && onStatus('Tekstherkenning laden…');
    _worker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'vendor/tesseract-worker.min.js',
      corePath: 'vendor/tesseract-core',
      langPath: 'vendor/tessdata',
      gzip: true,
    });
    return _worker;
  }

  // Losse woorden mét positie uit de OCR trekken. Woord-niveau is nodig omdat
  // Tesseract een hele rij namen soms als één brede regel samenvoegt.
  function extractWords(data) {
    const words = [];
    const visitLine = l => (l.words || []).forEach(w => {
      if (w && w.text && w.text.trim() && w.bbox) {
        words.push({ text: w.text.trim(), bbox: w.bbox, conf: w.confidence });
      }
    });
    if (data.blocks && data.blocks.length) {
      for (const b of data.blocks)
        for (const p of (b.paragraphs || []))
          for (const l of (p.lines || [])) visitLine(l);
    } else if (data.lines) {
      data.lines.forEach(visitLine);
    }
    return words;
  }

  // Een woord als "IT'S A MIRACLE"-titel herkennen (aanhalingstekens of
  // een woord in volledige hoofdletters zoals MIRACLE / PRECIOUS).
  function isTitleWord(t) {
    if (/["“”]/.test(t)) return true;
    const letters = t.replace(/[^A-Za-z]/g, '');
    return letters.length >= 4 && letters === letters.toUpperCase();
  }

  function cleanName(raw) {
    let t = raw.replace(/[^A-Za-z .'\-]/g, ' ').replace(/\s+/g, ' ').trim();
    let parts = t.split(' ').filter(Boolean).map(w =>
      w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
    // opeenvolgende dubbele woorden weghalen ("Charles Charles" -> "Charles")
    parts = parts.filter((w, i) => i === 0 || w.toLowerCase() !== parts[i - 1].toLowerCase());
    return parts.join(' ');
  }

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : 0;
  }

  /* ---------- gezichten -> namen koppelen ----------
     Elk OCR-woord wordt toegewezen aan het dichtstbijzijnde gezicht eronder;
     de woorden van een gezicht vormen samen (op x gesorteerd) de naam. */
  // Overlapt een woord-bbox (deels) een gezichtsvakje? Namen staan in de
  // witruimte eronder; ruis die Tesseract ín de foto "leest" overlapt wél.
  function overlapsAnyFace(wb, boxes) {
    for (const b of boxes) {
      const ix = Math.max(0, Math.min(wb.x1, b.x + b.width) - Math.max(wb.x0, b.x));
      const iy = Math.max(0, Math.min(wb.y1, b.y + b.height) - Math.max(wb.y0, b.y));
      if (ix > 0 && iy > 0) return true;
    }
    return false;
  }

  function namesForFaces(boxes, words) {
    const medH = median(boxes.map(b => b.height)) || 150;
    const buckets = boxes.map(() => []);
    const cand = words.filter(w => {
      const t = w.text;
      if (!/[A-Za-z]/.test(t)) return false;          // moet letters bevatten
      if (t.replace(/[^A-Za-z]/g, '').length < 3) return false; // 1-2 letters = ruis
      if (isTitleWord(t)) return false;               // sectietitels
      if ((w.conf || 0) < 40) return false;           // lage zekerheid = ruis uit de foto
      if (overlapsAnyFace(w.bbox, boxes)) return false; // tekst óp een foto = ruis
      return true;
    });
    for (const w of cand) {
      const wcx = (w.bbox.x0 + w.bbox.x1) / 2;
      const wtop = w.bbox.y0;
      let best = -1, bestCost = Infinity;
      boxes.forEach((box, i) => {
        const gap = wtop - (box.y + box.height);
        if (gap < -0.1 * box.height) return;    // staat niet ónder dit gezicht
        if (gap > 0.9 * box.height) return;     // te ver eronder (andere rij)
        const horiz = Math.abs(wcx - (box.x + box.width / 2));
        if (horiz > box.width * 1.7) return;    // hoort bij een andere kolom
        const cost = Math.max(0, gap) + horiz * 0.8;
        if (cost < bestCost) { bestCost = cost; best = i; }
      });
      if (best >= 0) buckets[best].push(w);
    }
    return buckets.map(ws => {
      ws.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      return cleanName(ws.map(w => w.text).join(' '));
    });
  }

  /* faces netjes op leesvolgorde (rij voor rij) zetten */
  function readingOrder(dets) {
    if (!dets.length) return dets;
    const hs = dets.map(d => d.detection.box.height).sort((a, b) => a - b);
    const medH = hs[hs.length >> 1];
    return dets.slice().sort((a, b) => {
      const ra = Math.round(a.detection.box.y / (medH * 0.9));
      const rb = Math.round(b.detection.box.y / (medH * 0.9));
      if (ra !== rb) return ra - rb;
      return a.detection.box.x - b.detection.box.x;
    });
  }

  /* ---------- hoofdverwerking ---------- */
  async function processImage(file) {
    showProgress('Afbeelding laden…');
    const work = await Models.fileToCanvas(file, MAX_W);

    await Models.load(showProgress);
    showProgress('Gezichten zoeken…');
    let dets = await faceapi
      .detectAllFaces(work, Models.detectorOpts())
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!dets.length) {
      hideProgress();
      alert('Geen gezichten gevonden op deze afbeelding. Probeer een scherpere of rechtere foto van de pagina.');
      return;
    }
    dets = readingOrder(dets);

    const worker = await getWorker(showProgress);
    showProgress(`Namen lezen (${dets.length} gezichten)…`);
    let words = [];
    try {
      const { data } = await worker.recognize(work, {}, { blocks: true, text: false });
      words = extractWords(data);
    } catch (e) {
      console.warn('OCR mislukt', e);
    }

    const boxes = dets.map(d => d.detection.box);
    const names = namesForFaces(boxes, words);
    pending = dets.map((d, i) => ({
      thumb: Models.cropFace(work, boxes[i]),
      name: names[i],
      descriptor: Array.from(d.descriptor),
      include: true,
    }));

    hideProgress();
    renderReview();
  }

  /* ---------- review-UI ---------- */
  function renderReview() {
    els.review.classList.remove('hidden');
    els.grid.innerHTML = '';
    pending.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'review-card' + (p.include ? '' : ' off');
      card.innerHTML = `
        <img src="${p.thumb}" alt="gezicht ${i + 1}">
        <input type="text" value="${escapeHtml(p.name)}" placeholder="Naam…" data-i="${i}">
        <div class="rc-foot">
          <label class="inc"><input type="checkbox" ${p.include ? 'checked' : ''} data-inc="${i}"> meenemen</label>
        </div>`;
      els.grid.appendChild(card);
    });
    els.grid.querySelectorAll('input[type=text]').forEach(inp =>
      inp.addEventListener('input', e => { pending[+e.target.dataset.i].name = e.target.value; }));
    els.grid.querySelectorAll('input[data-inc]').forEach(cb =>
      cb.addEventListener('change', e => {
        const i = +e.target.dataset.inc;
        pending[i].include = e.target.checked;
        e.target.closest('.review-card').classList.toggle('off', !e.target.checked);
      }));
    els.review.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveReview() {
    const keep = pending.filter(p => p.include && p.name.trim());
    if (!keep.length) { alert('Vul minstens één naam in om op te slaan.'); return; }
    await Store.addMany(keep.map(p => ({
      name: p.name.trim(), thumb: p.thumb, descriptor: p.descriptor,
    })));
    pending = [];
    els.review.classList.add('hidden');
    els.file.value = '';
    await refreshRoster();
    App.refreshCount();
    alert(`${keep.length} klasgenoot/klasgenoten toegevoegd! 🎉`);
  }

  /* ---------- roster ---------- */
  async function refreshRoster() {
    const people = await Store.all();
    els.rosterCount.textContent = people.length;
    els.clearBtn.classList.toggle('hidden', people.length === 0);
    els.rosterGrid.innerHTML = '';
    people.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
      const d = document.createElement('div');
      d.className = 'roster-item';
      d.innerHTML = `<img src="${p.thumb}" alt="${escapeHtml(p.name)}">
        <span>${escapeHtml(p.name)}</span>
        <button class="del" title="Verwijderen" data-id="${p.id}">×</button>`;
      els.rosterGrid.appendChild(d);
    });
    els.rosterGrid.querySelectorAll('.del').forEach(b =>
      b.addEventListener('click', async e => {
        await Store.remove(+e.target.dataset.id);
        await refreshRoster();
        App.refreshCount();
      }));
  }

  /* ---------- helpers ---------- */
  function showProgress(t) {
    els.dropzone.classList.add('busy');
    els.progress.classList.remove('hidden');
    els.progressText.textContent = t;
  }
  function hideProgress() {
    els.dropzone.classList.remove('busy');
    els.progress.classList.add('hidden');
  }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- init ---------- */
  function init() {
    els.file = document.getElementById('setup-file');
    els.dropzone = document.getElementById('dropzone');
    els.progress = document.getElementById('setup-progress');
    els.progressText = document.getElementById('setup-progress-text');
    els.review = document.getElementById('setup-review');
    els.grid = document.getElementById('review-grid');
    els.rosterGrid = document.getElementById('roster-grid');
    els.rosterCount = document.getElementById('roster-count');
    els.clearBtn = document.getElementById('btn-clear-all');

    els.file.addEventListener('change', e => {
      if (e.target.files[0]) processImage(e.target.files[0]).catch(err => {
        console.error(err); hideProgress(); alert('Er ging iets mis bij het verwerken.');
      });
    });
    document.getElementById('btn-save-people').addEventListener('click', () =>
      saveReview().catch(err => { console.error(err); alert('Opslaan mislukt.'); }));
    document.getElementById('btn-cancel-review').addEventListener('click', () => {
      pending = []; els.review.classList.add('hidden'); els.file.value = '';
    });
    els.clearBtn.addEventListener('click', async () => {
      if (confirm('Alle klasgenoten uit de app verwijderen?')) {
        await Store.clear(); await refreshRoster(); App.refreshCount();
      }
    });

    refreshRoster();
  }

  return { init, refreshRoster, _extractWords: extractWords, _namesForFaces: namesForFaces };
})();
