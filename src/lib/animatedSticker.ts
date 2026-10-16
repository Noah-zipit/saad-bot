/**
 * Purpose-built animated sticker encoder.
 *
 * Why this exists: wa-sticker-formatter's video path (mp4 -> ffmpeg default
 * gif -> sharp webp) produced multi-MB animated webps. Anything over
 * WhatsApp's ~500KB animated-sticker ceiling arrives as a static first
 * frame, and upscaling small GIFs to 512 blurred them. This encoder goes
 * straight from the source (mp4/gif/webp) to animated webp via ffmpeg's
 * upscaling small sources to 512 with lanczos at encode time, and walks a ladder until the
 * output fits comfortably under the limit.
 *
 * Quality strategy (2026-10-15 rework — "video stickers are not crystal
 * clear, really badly encoded"):
 *  1. Duration is the dominant size lever for video, so videos longer than
 *     VIDEO_TRIM_SECONDS are pre-trimmed to the first 5 seconds BEFORE the
 *     ladder. A crisp 5s sticker at 512px/15fps/q84 beats a mushy full-length
 *     one at 384px/10fps/q70 every time — and every major sticker app trims
 *     to a short loop anyway. GIFs are left alone (they are already short).
 *  1b. UPSCALE RULE (2026-10-16, "gifs are still looking really bad"): small
 *     GIFs are lanczos-upscaled to 512 at encode time. Sending a 240px webp
 *     and letting the phone's scaler blow it up ~3x is what made GIF
 *     stickers look smeared; the upscale costs bytes (the ladder's duration
 *     rung absorbs it) but the edges stay crisp.
 *  2. The ladder starts at quality 88 and holds 512px/15fps through the first
 *     five rungs, stepping quality down in 2-point increments (88/86/84/82/80)
 *     so mid-busy content lands on a higher rung instead of jumping 88->84->80.
 *     When quality alone cannot fit the 480KB ceiling, size is shed via
 *     DURATION next (a crisp 2s loop at 15fps), then fps, then width — in
 *     that order. Dropping to 8-10fps is what made stickers look like they
 *     were "buffering", so fps never goes below 12: smooth short motion
 *     beats long jerky motion every time. Quality is the LAST thing
 *     sacrificed, never the first. (Earlier versions started at q75 and
 *     dropped to 448px by rung 4 on ordinary busy phone video — that was
 *     the "badly encoded" look.)
 *  3. The byte ceiling is 480KB — safely under WhatsApp's ~500KB rejection
 *     line, ~7% more budget than the old 450KB, worth roughly one rung.
 *  4. Deeper rungs exist for pathological content, but trimming happens
 *     before resolution/fps collapse, so the common case never sees them.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import webpmux from 'node-webpmux'
const { Image } = webpmux

const execFileAsync = promisify(execFile)

// WhatsApp rejects animated stickers near ~500KB; 480KB keeps a safe
// margin while giving the encoder ~7% more byte budget than the old 450KB,
// which is roughly one quality rung on mid-busy content.
const MAX_BYTES = 480 * 1024

// Videos longer than this are trimmed to their first N seconds before the
// quality ladder runs. Duration dominates output size for video, so this is
// what lets ordinary phone clips stay on the 512px / 15fps / high-quality
// rungs instead of collapsing to 384px mush.
const VIDEO_TRIM_SECONDS = 5

/**
 * Pack/author metadata carried inside the sticker's EXIF chunk.
 * This is what WhatsApp reads to show the pack name under the sticker.
 */
export interface StickerMetadata {
  id: string
  pack: string
  author: string
  emojis?: string[]
}

/**
 * Build the WhatsApp sticker EXIF payload (same layout wa-sticker-formatter uses).
 */
function buildStickerExif(meta: StickerMetadata): Buffer {
  const data = JSON.stringify({
    'sticker-pack-id': meta.id,
    'sticker-pack-name': meta.pack,
    'sticker-pack-publisher': meta.author,
    emojis: meta.emojis ?? []
  })
  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x16, 0x00, 0x00, 0x00
    ]),
    Buffer.from(data, 'utf-8')
  ])
  exif.writeUIntLE(Buffer.byteLength(data, 'utf-8'), 14, 4)
  return exif
}

/**
 * Stamp pack/author metadata into an existing webp buffer's EXIF chunk.
 * Preserves animation — this is the piece the ffmpeg path never had, which is
 * why GIF stickers showed no name underneath while static ones did.
 */
export async function addStickerMetadata(webp: Buffer, meta: StickerMetadata): Promise<Buffer> {
  const img = new Image()
  await img.load(webp)
  img.exif = buildStickerExif(meta)
  const out = Buffer.from(await img.save(null))
  // node-webpmux recomputes the VP8X feature flags on save and drops the
  // animation bit — WhatsApp then shows the sticker as a static image, which
  // is why GIF stickers stopped moving once names were stamped in. Restore
  // the source's original flags and set the EXIF bit (0x04) for the chunk
  // we just appended.
  const vp8x = out.indexOf('VP8X')
  if (vp8x >= 0 && out.length > vp8x + 8 && webp.length > vp8x + 8) {
    out[vp8x + 8] = webp[vp8x + 8] | 0x04
  }
  return out
}

/**
 * Structural validation for an encoded animated sticker.
 * Walks the RIFF chunk list and confirms: valid WEBP container, size field
 * matches the buffer, VP8X present with the animation bit set, an ANIM
 * chunk, and at least two ANMF frames. Anything failing this is something
 * a phone cannot display — the caller must not send it as a sticker.
 */
export interface StickerValidation {
  ok: boolean
  reason?: string
}

export function validateAnimatedSticker(buf: Buffer): StickerValidation {
  if (buf.length < 32) return { ok: false, reason: 'too small' }
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') {
    return { ok: false, reason: 'not a webp container' }
  }
  if (buf.readUInt32LE(4) + 8 !== buf.length) return { ok: false, reason: 'truncated file' }
  let off = 12
  let hasAnim = false
  let frames = 0
  while (off + 8 <= buf.length) {
    const fourcc = buf.subarray(off, off + 4).toString('latin1')
    if (!/^[\x20-\x7e]{4}$/.test(fourcc)) return { ok: false, reason: 'corrupt chunk header' }
    const size = buf.readUInt32LE(off + 4)
    if (off + 8 + size > buf.length) return { ok: false, reason: 'chunk overruns file' }
    if (fourcc === 'VP8X') {
      if (size < 10) return { ok: false, reason: 'bad VP8X chunk' }
      if (!(buf[off + 8] & 0x10)) return { ok: false, reason: 'animation flag missing' }
    } else if (fourcc === 'ANIM') {
      hasAnim = true
    } else if (fourcc === 'ANMF') {
      frames++
    }
    off += 8 + size + (size & 1)
  }
  if (off !== buf.length) return { ok: false, reason: 'trailing garbage' }
  if (!hasAnim) return { ok: false, reason: 'no animation chunk' }
  if (frames < 2) return { ok: false, reason: 'fewer than 2 frames' }
  return { ok: true }
}

interface SourceProbe {
  fps: number | null
  duration: number | null
  format: string | null
}

/**
 * Last-resort path for the !gif command: if the encoded sticker ever fails
 * structural validation (something the phone cannot display), the caller
 * sends the source back as a plain looping GIF video instead of a broken
 * sticker. A visible GIF always beats an invisible sticker.
 */
export async function sourceToGifVideo(input: Buffer, ext: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'gifvideo-'))
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`
  const inp = join(dir, `in${safeExt}`)
  const out = join(dir, 'out.mp4')
  await writeFile(inp, input)
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-v', 'error', '-y', '-i', inp,
        '-vf', "scale='min(512,iw)':-2",
        // Explicit quality: the x264 default (crf 23, medium) came out soft
        // and WhatsApp's own recompress on top turned it blocky. crf 20
        // gives headroom for that second compression; veryfast keeps the
        // encode quick on large sources.
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an', out
      ],
      { timeout: 120_000 }
    )
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Probe the source once: average frame rate, duration, container format.
 * Any field may come back null when it can't be determined.
 */
async function probeSource(input: string): Promise<SourceProbe> {
  const probe: SourceProbe = { fps: null, duration: null, format: null }
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0',
       '-show_entries', 'stream=avg_frame_rate:format=duration,format_name',
       '-of', 'default=nw=1', input],
      { timeout: 30_000 }
    )
    for (const line of stdout.split('\n')) {
      const [k, v] = line.split('=')
      if (k === 'avg_frame_rate' && v) {
        const [n, d] = v.trim().split('/').map(Number)
        if (n > 0 && d > 0) probe.fps = n / d
      } else if (k === 'duration' && v) {
        const s = Number(v)
        if (Number.isFinite(s) && s > 0) probe.duration = s
      } else if (k === 'format_name' && v) {
        probe.format = v.trim().toLowerCase()
      }
    }
  } catch {
    // probe failed — fall through with nulls and safe defaults below
  }
  return probe
}

const VIDEO_FORMAT_TOKENS = new Set([
  'mp4', 'mov', 'm4a', 'm4v', '3gp', '3g2', 'mj2',
  'matroska', 'webm', 'avi', 'flv', 'mpeg', 'mpegts'
])

/**
 * True when the source is a video container (not a GIF / still webp).
 * Only videos get the pre-trim — GIFs are already short loops.
 */
function isVideoSource(probe: SourceProbe, ext: string): boolean {
  if (probe.format) {
    const tokens = probe.format.split(',')
    if (tokens.some((t) => VIDEO_FORMAT_TOKENS.has(t))) return true
    if (tokens.includes('gif')) return false
  }
  return ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.3gp', '.avi'].includes(ext.toLowerCase())
}

// Quality ladder: quality is the LAST thing sacrificed, never the first.
// Earlier versions opened at q75 and were already down to 448px/10fps by
// rung 4 on ordinary busy phone video — that was the "badly encoded" look
// users reported. The next failure mode was the fps floor at 8: busy GIFs
// collapsed to 8-10fps and played back jerky, "like something buffering",
// plus the pixelation from the 320-384px rungs. Now the first five rungs
// hold full 512px/15fps and walk quality down from 88; size is then shed
// through DURATION (a 2s loop is still a loop), then fps (floor 12 — never
// 8/10), then width, in that order. Deep rungs exist only for pathological
// content — the 5s pre-trim above keeps real videos on the early rungs.
type Attempt = { fps: number; quality: number; maxWidth: number; maxSeconds?: number }

const LADDER: Attempt[] = [
  { fps: 15, quality: 88, maxWidth: 512 },
  { fps: 15, quality: 86, maxWidth: 512 },
  { fps: 15, quality: 84, maxWidth: 512 },
  { fps: 15, quality: 82, maxWidth: 512 },
  { fps: 15, quality: 80, maxWidth: 512 },
  { fps: 15, quality: 80, maxWidth: 512, maxSeconds: 2 },
  { fps: 15, quality: 78, maxWidth: 512, maxSeconds: 2 },
  { fps: 12, quality: 78, maxWidth: 512, maxSeconds: 2 },
  { fps: 12, quality: 75, maxWidth: 448, maxSeconds: 2 },
  { fps: 12, quality: 72, maxWidth: 384, maxSeconds: 2 },
  { fps: 12, quality: 68, maxWidth: 320, maxSeconds: 2 },
]

// NOTE: the fps step below DOWNSAMPLES only — never forces a low-fps GIF
// up to the target rate. Duplicating frames to reach 15fps made stickers
// visibly "double"/stutter and ate the bytes clarity needed.

/**
 * Encode an animated source buffer (mp4 / gif / animated webp) into an
 * animated webp sticker that WhatsApp will actually animate.
 * @param input raw media bytes
 * @param ext file extension hint for the input ('.mp4' | '.gif' | '.webp')
 */
export async function makeAnimatedSticker(input: Buffer, ext: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'animsticker-'))
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`
  const inp = join(dir, `in${safeExt}`)
  await writeFile(inp, input)

  try {
    // Probe once: knowing the source fps lets the fps filter downsample
    // fast sources and pass slow ones through untouched (no frame doubling);
    // knowing the duration lets long videos get pre-trimmed.
    const probe = await probeSource(inp)

    // Videos: trim to the first VIDEO_TRIM_SECONDS before encoding.
    // Duration is the dominant size lever — this single step is what keeps
    // real phone videos on the crisp 512px rungs instead of collapsing the
    // ladder. Stream copy is near-instant; on failure fall back to the full
    // input and let the ladder handle it.
    let encodeInput = inp
    if (
      isVideoSource(probe, safeExt) &&
      probe.duration !== null &&
      probe.duration > VIDEO_TRIM_SECONDS
    ) {
      const trimmed = join(dir, `trim${safeExt}`)
      try {
        await execFileAsync(
          'ffmpeg',
          ['-v', 'error', '-y', '-t', String(VIDEO_TRIM_SECONDS), '-i', inp,
           '-c', 'copy', '-an', trimmed],
          { timeout: 60_000 }
        )
        encodeInput = trimmed
      } catch {
        // keep the full input; the ladder sheds size another way
      }
    }

    let smallest: Buffer | null = null
    let lastKey = ''
    for (const a of LADDER) {
      // Only trim when the source is actually longer than the rung's cap —
      // a maxSeconds rung on an already-short GIF would just re-encode the
      // identical output and waste time.
      const trim =
        a.maxSeconds !== undefined &&
        probe.duration !== null &&
        probe.duration > a.maxSeconds
          ? a.maxSeconds
          : undefined
      const key = `${a.fps}/${a.quality}/${a.maxWidth}/${trim ?? ''}`
      if (key === lastKey) continue
      lastKey = key
      const out = join(dir, `out-${a.fps}-${a.quality}-${a.maxWidth}${trim ? '-trim' : ''}.webp`)
      // Upscale small sources to the rung's long-side target with lanczos.
      // The earlier "never upscale" rule backfired: a 240px GIF sticker is
      // upscaled ~3x by the phone's own (cheap bilinear-ish) scaler at
      // display time and comes out smeared — that was the persistent "GIFs
      // look really bad" complaint. Encode-time lanczos upscale to 512
      // keeps edges crisp; measured side-by-side, text and shapes stay
      // readable where the display-time upscale smears them. -2 keeps the
      // proportional side even.
      const filters: string[] = []
      if (probe.fps === null || probe.fps > a.fps) filters.push(`fps=${a.fps}`)
      filters.push(
        `scale='if(gt(iw,ih),${a.maxWidth},-2)':'if(gt(iw,ih),-2,${a.maxWidth})':flags=lanczos`
      )
      const vf = filters.join(',')
      const args = ['-v', 'error', '-y', '-i', encodeInput]
      if (trim !== undefined) args.push('-t', String(trim))
      args.push(
        '-vf', vf,
        '-vcodec', 'libwebp_anim',
        '-lossless', '0',
        '-quality', String(a.quality),
        // Digital-picture preset: sharper edges, less blockiness than the
        // default preset, and ~6% smaller at the same quality on busy
        // motion (measured). One rung of size headroom for free.
        '-preset', 'picture',
        // Conditional replenishment: skips re-encoding near-static blocks,
        // so GIFs with still regions use fewer bytes and can stay on the
        // early rungs. (It does nothing for full-motion content — for those
        // the fps/width rungs below are what bring the size down.)
        '-cr_threshold', '4',
        '-cr_size', '16',
        '-loop', '0',
        '-an', '-vsync', '0',
        out
      )
      await execFileAsync('ffmpeg', args, { timeout: 120_000 })
      const buf = await readFile(out)
      if (!smallest || buf.length < smallest.length) smallest = buf
      if (buf.length <= MAX_BYTES) return buf
    }
    // Even the smallest attempt is oversized — return the smallest we got
    // rather than nothing; it still animates on most clients.
    if (!smallest) throw new Error('animated sticker encode produced no output')
    return smallest
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
