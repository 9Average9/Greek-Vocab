/* ══════════════════════════════════════════════════════════════════════════
   SERMON TRANSCRIBE WORKER  —  on-device speech-to-text for verse catching.

   A module Web Worker that runs OpenAI Whisper entirely in the browser via
   transformers.js. It exists so a phone that has NO live speech recognition
   (every iPhone / iOS PWA) can still catch spoken Bible references: after a
   recording stops, the page decodes the audio to 16 kHz mono PCM and hands it
   here; we transcribe it and post the text back, and the page runs it through
   the same reference parser the live catcher uses.

   • Runs off the main thread, so the UI never freezes during transcription.
   • Prefers WebGPU (fast on modern devices) and falls back to WASM everywhere.
   • The model is fetched once from a CDN and cached by the browser, so repeat
     scans — and offline use at church — work with no further download.
   • Nothing is uploaded: audio never leaves the device.

   Message protocol
     page → worker : { audio: Float32Array(16kHz mono), model?, device? }
     worker → page : { type:'progress', stage:'download'|'transcribe', pct }
                     { type:'result',   text, chunks:[{text,timestamp:[s,e]}] }
                     { type:'error',    error }
   ══════════════════════════════════════════════════════════════════════════ */

const LIB_URLS = [
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js',
  'https://unpkg.com/@huggingface/transformers@3/dist/transformers.min.js'
];

let _lib = null;
async function loadLib() {
  if (_lib) return _lib;
  let lastErr;
  for (const url of LIB_URLS) {
    try { _lib = await import(url); return _lib; }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Could not load the transcription library');
}

// One pipeline per (model + device). Building it downloads (or reads from cache)
// the model weights; progress is reported so the UI can show a real percentage.
let _pipe = null, _pipeKey = '';
async function getPipe(model, device) {
  const key = model + '|' + device;
  if (_pipe && _pipeKey === key) return _pipe;
  const T = await loadLib();
  T.env.allowLocalModels = false;   // always fetch from the hub/CDN
  T.env.useBrowserCache = true;     // …but cache it for offline + repeat use

  // Aggregate per-file download progress into one overall percentage.
  const files = {};
  const progress_callback = p => {
    if (!p) return;
    if (p.status === 'progress' && p.file != null) {
      files[p.file] = typeof p.progress === 'number' ? p.progress
        : (p.total ? (p.loaded / p.total) * 100 : 0);
      const vals = Object.values(files);
      const pct = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      self.postMessage({ type: 'progress', stage: 'download', pct: Math.min(99, pct) });
    } else if (p.status === 'ready' || p.status === 'done') {
      self.postMessage({ type: 'progress', stage: 'download', pct: 100 });
    }
  };

  const dtype = device === 'webgpu' ? 'fp16' : 'q8';
  _pipe = await T.pipeline('automatic-speech-recognition', model, { device, dtype, progress_callback });
  _pipeKey = key;
  return _pipe;
}

self.onmessage = async (e) => {
  const { audio, model, device } = e.data || {};
  const wantModel = model || 'Xenova/whisper-tiny.en';
  const wantDevice = device || 'wasm';
  try {
    let transcriber;
    try {
      transcriber = await getPipe(wantModel, wantDevice);
    } catch (err) {
      // WebGPU can be reported as available yet fail to build the pipeline on
      // some devices — fall back to WASM so scanning still works.
      if (wantDevice !== 'wasm') { _pipe = null; _pipeKey = ''; transcriber = await getPipe(wantModel, 'wasm'); }
      else throw err;
    }
    self.postMessage({ type: 'progress', stage: 'transcribe', pct: 0 });
    const out = await transcriber(audio, {
      chunk_length_s: 30,   // long-form: window the audio so a full sermon fits
      stride_length_s: 5,   // overlap so references on a boundary aren't split
      return_timestamps: true
    });
    self.postMessage({ type: 'result', text: out.text || '', chunks: out.chunks || [] });
  } catch (err) {
    self.postMessage({ type: 'error', error: String((err && err.message) || err) });
  }
};
