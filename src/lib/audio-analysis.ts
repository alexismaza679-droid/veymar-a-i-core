// Análisis 100% local con Web Audio API: estima BPM y tonalidad de un archivo.
// Sin librerías externas. Funciona offline.

export type AudioAnalysis = {
  bpm: number;
  key: string;
  durationSec: number;
};

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export async function analyzeAudioFile(file: File): Promise<AudioAnalysis> {
  const arrayBuf = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 44100 * Math.min(60, 30), 44100);
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const buffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
  audioCtx.close();

  const channel = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const durationSec = buffer.duration;

  // ---- BPM via energy peaks on a lowpass-filtered envelope ----
  const bpm = estimateBpm(channel, sr);
  // ---- Key via chroma + Krumhansl correlation ----
  const key = estimateKey(channel, sr);

  void ctx; // not actually used; kept for ergonomics
  return { bpm, key, durationSec };
}

function estimateBpm(samples: Float32Array, sr: number): number {
  // Downsample to ~ 2.2kHz energy envelope
  const windowSize = Math.floor(sr / 100); // 10ms
  const energy: number[] = [];
  for (let i = 0; i < samples.length; i += windowSize) {
    let sum = 0;
    const end = Math.min(i + windowSize, samples.length);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    energy.push(Math.sqrt(sum / (end - i)));
  }
  // Peak picking
  const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
  const thresh = mean * 1.5;
  const peaks: number[] = [];
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > thresh && energy[i] > energy[i - 1] && energy[i] > energy[i + 1]) {
      peaks.push(i);
    }
  }
  if (peaks.length < 4) return 0;
  // Interval histogram in 10ms units → bpm = 6000 / intervalUnits
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  const buckets = new Map<number, number>();
  intervals.forEach((iv) => {
    let bpm = 6000 / iv;
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    const r = Math.round(bpm);
    buckets.set(r, (buckets.get(r) || 0) + 1);
  });
  let best = 120;
  let bestCount = -1;
  buckets.forEach((c, b) => {
    if (c > bestCount) {
      bestCount = c;
      best = b;
    }
  });
  return best;
}

function estimateKey(samples: Float32Array, sr: number): string {
  // FFT on a centered slice
  const sliceLen = 1 << 15; // 32768
  const start = Math.max(0, Math.floor((samples.length - sliceLen) / 2));
  const slice = samples.subarray(start, start + sliceLen);
  const mag = fftMagnitude(slice);
  const chroma = new Array(12).fill(0);
  for (let k = 1; k < mag.length; k++) {
    const freq = (k * sr) / sliceLen;
    if (freq < 60 || freq > 5000) continue;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag[k];
  }
  // Correlate against all 24 keys
  let bestKey = "C major";
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const major = correlate(chroma, rotate(MAJOR_PROFILE, i));
    const minor = correlate(chroma, rotate(MINOR_PROFILE, i));
    if (major > bestScore) {
      bestScore = major;
      bestKey = `${KEY_NAMES[i]} major`;
    }
    if (minor > bestScore) {
      bestScore = minor;
      bestKey = `${KEY_NAMES[i]} minor`;
    }
  }
  return bestKey;
}

function rotate(arr: number[], n: number): number[] {
  return arr.map((_, i) => arr[(i - n + 12) % 12]);
}
function correlate(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < 12; i++) s += a[i] * b[i];
  return s;
}

// Tiny iterative Cooley-Tukey FFT, returns magnitude spectrum (size/2).
function fftMagnitude(input: Float32Array): Float32Array {
  const n = input.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  // Hann window
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = input[i] * w;
  }
  // Bit reversal
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const tableStep = (2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const angle = -k * tableStep;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tre = re[i + k + half] * cos - im[i + k + half] * sin;
        const tim = re[i + k + half] * sin + im[i + k + half] * cos;
        re[i + k + half] = re[i + k] - tre;
        im[i + k + half] = im[i + k] - tim;
        re[i + k] = re[i + k] + tre;
        im[i + k] = im[i + k] + tim;
      }
    }
  }
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}
