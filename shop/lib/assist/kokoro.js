/**
 * Kokoro-82M (Apache-2.0): a free, open-source text-to-speech model that
 * runs on this server, so every visitor hears the same natural voice at no
 * per-answer cost. The model downloads to /tmp on a cold start and is then
 * reused by that instance.
 *
 * Full precision (fp32, 326 MB) is the default: on a single CPU it generates
 * about 3x faster than the 8-bit model (1.6 s vs 4.6 s for 5.8 s of speech),
 * which is the difference between speaking faster or slower than real time.
 */

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const VOICE = process.env.ASSIST_KOKORO_VOICE || 'af_heart';
const DTYPE = process.env.ASSIST_KOKORO_DTYPE || 'fp32';

let loading = null;

export function getKokoro() {
  if (!loading) {
    loading = (async () => {
      const { env } = await import('@huggingface/transformers');
      // The deployment is read-only; /tmp is the only writable place on Vercel.
      env.cacheDir = '/tmp/hf-cache';
      const { KokoroTTS } = await import('kokoro-js');
      return KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' });
    })().catch((error) => {
      loading = null; // let the next request retry
      throw error;
    });
  }
  return loading;
}

/**
 * One sentence in, a 16-bit PCM WAV out. Kokoro returns 32-bit float samples;
 * 16-bit halves the download on mobile data and plays in every browser,
 * including Safari, which can refuse float WAV.
 */
export async function speak(text) {
  const tts = await getKokoro();
  const audio = await tts.generate(text, { voice: VOICE });
  return toWav16(audio.audio, audio.sampling_rate);
}

function toWav16(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset, str) => [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return buffer;
}
