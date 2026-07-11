/* Laadt de face-api modellen (eenmalig) en biedt gedeelde helpers. */
const Models = (() => {
  const MODEL_URL = 'vendor/models';
  let ready = null;

  // Kies een werkende tfjs-backend in volgorde van snelheid:
  //   webgl  -> snel op telefoons met GPU
  //   wasm   -> snel zonder GPU (bijbehorende .wasm-bestanden staan in vendor/)
  //   cpu    -> pure JS, altijd beschikbaar, traag (laatste redmiddel)
  let wasmConfigured = false;
  async function ensureBackend() {
    const tf = faceapi.tf;
    // debug: forceer een backend via localStorage 'klas76_backend'
    const forced = (typeof localStorage !== 'undefined') && localStorage.getItem('klas76_backend');
    const order = forced ? [forced] : ['webgl', 'wasm', 'cpu'];
    for (const b of order) {
      try {
        if (b === 'wasm' && !wasmConfigured) {
          const setPaths = tf.setWasmPaths || (tf.wasm && tf.wasm.setWasmPaths);
          if (setPaths) {
            setPaths('vendor/tfjs-wasm/');
            wasmConfigured = true;
          } else {
            continue; // wasm-backend niet in deze build
          }
        }
        const ok = await tf.setBackend(b);
        if (ok) { await tf.ready(); console.log('[Models] tfjs-backend:', b); return b; }
      } catch (e) { /* volgende proberen */ }
    }
    await tf.ready();
    return tf.getBackend();
  }

  function load(onStatus) {
    if (ready) return ready;
    ready = (async () => {
      onStatus && onStatus('Loading face model…');
      await ensureBackend();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL); // lichte terugval
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })();
    return ready;
  }

  // Tekent een bron in een canvas, gedraaid over 0/90/180/270°, geschaald op maxW.
  function toCanvasRot(source, maxW, rot) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    const swap = rot === 90 || rot === 270;
    const ow0 = swap ? sh : sw, oh0 = swap ? sw : sh;
    const scale = maxW && ow0 > maxW ? maxW / ow0 : 1;
    const ow = Math.round(ow0 * scale), oh = Math.round(oh0 * scale);
    const sWt = Math.round(sw * scale), sHt = Math.round(sh * scale);
    const c = document.createElement('canvas');
    c.width = ow; c.height = oh;
    const ctx = c.getContext('2d');
    if (rot === 90) { ctx.translate(ow, 0); ctx.rotate(Math.PI / 2); }
    else if (rot === 180) { ctx.translate(ow, oh); ctx.rotate(Math.PI); }
    else if (rot === 270) { ctx.translate(0, oh); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(source, 0, 0, sWt, sHt);
    return c;
  }

  // Zet een bron rechtop zonder op de (onbetrouwbare) EXIF-vlag te vertrouwen:
  // we proberen 0/90/180/270° en kiezen de stand waarin de meeste gezichten
  // gevonden worden. Werkt op elk toestel, ongeacht hoe de browser de foto laadt.
  async function uprightCanvas(source, maxW) {
    let best = { rot: 0, n: -1, s: 0 };
    for (const rot of [0, 90, 180, 270]) {
      const probe = toCanvasRot(source, 480, rot);
      let dets = [];
      try { dets = await faceapi.detectAllFaces(probe, tinyOpts()); } catch (e) { /* negeer */ }
      const n = dets.length;
      const s = dets.reduce((a, d) => a + (d.score || 0), 0);
      if (n > best.n || (n === best.n && s > best.s)) best = { rot, n, s };
    }
    return toCanvasRot(source, maxW, best.rot);
  }

  async function fileToUpright(file, maxW) {
    const src = await decodeImage(file);
    return uprightCanvas(src, maxW);
  }

  function loadImageEl(file) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = URL.createObjectURL(file);
    });
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'none' }); }
      catch (e) {
        try { return await createImageBitmap(file); } catch (e2) { /* val terug op <img> */ }
      }
    }
    return loadImageEl(file);
  }

  // Tekent een bron (img/canvas/video) op een canvas met een maximale breedte,
  // zodat gezichtsdetectie en OCR in exact dezelfde coördinaten werken.
  function toCanvas(source, maxW) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    const scale = maxW && sw > maxW ? maxW / sw : 1;
    const w = Math.round(sw * scale);
    const h = Math.round(sh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(source, 0, 0, w, h);
    return c;
  }

  // Snijdt een gezicht uit een canvas met wat marge en levert een jpeg-dataURL.
  function cropFace(canvas, box, marginRatio = 0.35, outW = 200, outH = 250) {
    const mx = box.width * marginRatio;
    const my = box.height * marginRatio;
    let x = Math.max(0, box.x - mx);
    let y = Math.max(0, box.y - my * 0.8);
    let w = Math.min(canvas.width - x, box.width + mx * 2);
    let h = Math.min(canvas.height - y, box.height + my * 2);
    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, outW, outH);
    return out.toDataURL('image/jpeg', 0.82);
  }

  const detectorOpts = () => new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
  // Lichte detector als terugval op zwakke/oudere toestellen.
  const tinyOpts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });

  return { load, toCanvas, toCanvasRot, uprightCanvas, fileToUpright, decodeImage,
           cropFace, detectorOpts, tinyOpts };
})();
