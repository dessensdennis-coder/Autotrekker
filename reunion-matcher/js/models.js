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
      onStatus && onStatus('Gezichtsmodel laden…');
      await ensureBackend();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    })();
    return ready;
  }

  // Leest de EXIF-oriëntatie (1..8) uit een JPEG; 1 = geen rotatie.
  function readOrientation(buf) {
    const view = new DataView(buf);
    if (view.byteLength < 2 || view.getUint16(0, false) !== 0xFFD8) return 1;
    let off = 2;
    while (off + 4 < view.byteLength) {
      const marker = view.getUint16(off, false);
      off += 2;
      if (marker === 0xFFE1) {
        if (view.getUint32(off + 2, false) !== 0x45786966) return 1;
        const little = view.getUint16(off + 8, false) === 0x4949;
        const tiff = off + 8;
        const dir = tiff + view.getUint32(tiff + 4, little);
        const n = view.getUint16(dir, little);
        for (let i = 0; i < n; i++) {
          const entry = dir + 2 + i * 12;
          if (view.getUint16(entry, little) === 0x0112) {
            return view.getUint16(entry + 8, little) || 1;
          }
        }
        return 1;
      } else if ((marker & 0xFF00) !== 0xFF00) {
        break;
      } else {
        off += view.getUint16(off, false);
      }
    }
    return 1;
  }

  // Tekent een afbeelding op een canvas met de juiste EXIF-rotatie toegepast.
  function orientCanvas(img, o) {
    const w = img.width, h = img.height;
    const swap = o >= 5 && o <= 8;
    const c = document.createElement('canvas');
    c.width = swap ? h : w;
    c.height = swap ? w : h;
    const ctx = c.getContext('2d');
    switch (o) {
      case 2: ctx.translate(w, 0); ctx.scale(-1, 1); break;
      case 3: ctx.translate(w, h); ctx.rotate(Math.PI); break;
      case 4: ctx.translate(0, h); ctx.scale(1, -1); break;
      case 5: ctx.rotate(-0.5 * Math.PI); ctx.translate(-w, 0); ctx.scale(-1, 1); break;
      case 6: ctx.rotate(-0.5 * Math.PI); ctx.translate(-w, 0); break;
      case 7: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); ctx.scale(-1, 1); break;
      case 8: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); break;
      default: break;
    }
    ctx.drawImage(img, 0, 0);
    return c;
  }

  // Laadt een bestand/blob, past EXIF-rotatie toe en schaalt naar maxW.
  // Dit is dé manier om een geüploade foto in te lezen (telefoons zetten vaak
  // een rotatievlag op de foto in plaats van de pixels echt te draaien).
  async function fileToCanvas(file, maxW) {
    const buf = await file.arrayBuffer();
    const o = readOrientation(buf);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = URL.createObjectURL(file);
    });
    const oriented = o === 1 ? img : orientCanvas(img, o);
    return toCanvas(oriented, maxW);
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

  const detectorOpts = () => new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 });

  return { load, toCanvas, fileToCanvas, cropFace, detectorOpts };
})();
