// src/lib/logoFonts.ts
// Shared text-render engine for the !logo and !font commands.
// Renders display text to PNG (IMG format) via SVG + sharp, using the
// bundled cool-font pack in asset/fonts (OFL-licensed Google Fonts,
// installed system-wide via ~/.fonts so fontconfig/sharp can see them).

import sharp from 'sharp'

export interface CoolFont {
  key: string        // style key used in commands
  family: string     // fontconfig family name
  label: string      // display name
  desc: string       // one-line vibe description
  ratio: number      // avg glyph advance width as a fraction of font size
}

export const COOL_FONTS: CoolFont[] = [
  { key: 'bungee',   family: 'Bungee',            label: 'Bungee',           desc: 'Chunky poster / gaming', ratio: 0.74 },
  { key: 'neon',     family: 'Monoton',           label: 'Neon Sign',        desc: 'Glowing neon tube sign', ratio: 0.80 },
  { key: 'luxury',   family: 'Cinzel Decorative', label: 'Luxury Gold',      desc: 'Elegant gold serif', ratio: 0.68 },
  { key: 'future',   family: 'Audiowide',         label: 'Futuristic',       desc: 'Sci-fi / tech', ratio: 0.82 },
  { key: 'pixel',    family: 'Press Start 2P',    label: 'Pixel Retro',      desc: 'Arcade / 8-bit', ratio: 1.04 },
  { key: 'army',     family: 'Black Ops One',     label: 'Army Ops',         desc: 'Military / esports', ratio: 0.80 },
  { key: 'script',   family: 'Pacifico',          label: 'Handwritten',      desc: 'Casual script signature', ratio: 0.56 },
  { key: 'bold',     family: 'Righteous',         label: 'Bold Pop',         desc: 'Rounded bold display', ratio: 0.70 },
]

export interface LogoStyle {
  key: string
  name: string
  font: CoolFont
  baseSize: number
  /** svg <defs> fragment: gradients/filters for this style */
  defs: string
  /** svg background fragment (rects) */
  bg: string
  /** fill used on the text (gradient ref or color) */
  fill: string
  /** optional extra filter attr applied to the text element */
  textFilter?: string
  /** optional stroke on text */
  stroke?: string
}

const font = (key: string): CoolFont => COOL_FONTS.find(f => f.key === key)!

export const LOGO_STYLES: LogoStyle[] = [
  {
    key: 'neon', name: 'Neon', font: font('neon'), baseSize: 118,
    defs: `<linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#00f5ff"/><stop offset="1" stop-color="#ff00e5"/></linearGradient>
      <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="14" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="bgv" cx="0.5" cy="0.45" r="0.9">
        <stop offset="0" stop-color="#141428"/><stop offset="1" stop-color="#06060f"/></radialGradient>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgv)"/>`,
    fill: 'url(#tg)', textFilter: 'filter="url(#glow)"',
  },
  {
    key: 'gold', name: 'Gold Luxury', font: font('luxury'), baseSize: 104,
    defs: `<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff3b0"/><stop offset="0.5" stop-color="#d4af37"/><stop offset="1" stop-color="#8a6508"/></linearGradient>
      <radialGradient id="bgv" cx="0.5" cy="0.4" r="1">
        <stop offset="0" stop-color="#171208"/><stop offset="1" stop-color="#060402"/></radialGradient>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgv)"/>`,
    fill: 'url(#tg)', stroke: '#3a2c05',
  },
  {
    key: 'fire', name: 'Fire', font: font('bungee'), baseSize: 128,
    defs: `<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe45e"/><stop offset="0.55" stop-color="#ff6a00"/><stop offset="1" stop-color="#e01000"/></linearGradient>
      <filter id="heat" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="18" flood-color="#ff4400" flood-opacity="0.8"/></filter>
      <radialGradient id="bgv" cx="0.5" cy="0.6" r="1">
        <stop offset="0" stop-color="#2a0d05"/><stop offset="1" stop-color="#0a0302"/></radialGradient>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgv)"/>`,
    fill: 'url(#tg)', textFilter: 'filter="url(#heat)"',
  },
  {
    key: 'ice', name: 'Ice', font: font('future'), baseSize: 118,
    defs: `<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f2feff"/><stop offset="0.6" stop-color="#59d7ff"/><stop offset="1" stop-color="#2b7fff"/></linearGradient>
      <filter id="frost" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="4" stdDeviation="16" flood-color="#59d7ff" flood-opacity="0.7"/></filter>
      <radialGradient id="bgv" cx="0.5" cy="0.4" r="1">
        <stop offset="0" stop-color="#0a2233"/><stop offset="1" stop-color="#020a12"/></radialGradient>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgv)"/>`,
    fill: 'url(#tg)', textFilter: 'filter="url(#frost)"',
  },
  {
    key: 'retro', name: 'Retro Sunset', font: font('pixel'), baseSize: 62,
    defs: `<linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b1055"/><stop offset="0.55" stop-color="#ff2e88"/><stop offset="1" stop-color="#ff9a3c"/></linearGradient>
      <filter id="px" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="6" dy="6" stdDeviation="0" flood-color="#1a1a2e"/></filter>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgg)"/>
      <circle cx="540" cy="430" r="220" fill="#ffd319" opacity="0.9"/>`,
    fill: '#fff200', textFilter: 'filter="url(#px)"',
  },
  {
    key: 'gaming', name: 'Esports', font: font('army'), baseSize: 126,
    defs: `<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e4ff7a"/><stop offset="0.6" stop-color="#7ee000"/><stop offset="1" stop-color="#2f9e00"/></linearGradient>
      <filter id="eg" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#000000" flood-opacity="0.9"/></filter>
      <radialGradient id="bgv" cx="0.5" cy="0.4" r="1">
        <stop offset="0" stop-color="#16200f"/><stop offset="1" stop-color="#050805"/></radialGradient>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgv)"/>`,
    fill: 'url(#tg)', textFilter: 'filter="url(#eg)"', stroke: '#0e2a00',
  },
  {
    key: 'script', name: 'Signature', font: font('script'), baseSize: 150,
    defs: `<linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7b2ff7"/><stop offset="1" stop-color="#f107a3"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/></filter>`,
    bg: `<rect width="1080" height="1080" fill="url(#bgg)"/>`,
    fill: '#ffffff', textFilter: 'filter="url(#soft)"',
  },
  {
    key: 'bold', name: 'Bold Pop', font: font('bold'), baseSize: 138,
    defs: `<filter id="pop" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="0" flood-color="#4a0511"/>
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.4"/></filter>`,
    bg: `<rect width="1080" height="1080" fill="#a31226"/>`,
    fill: '#ffffff', textFilter: 'filter="url(#pop)"',
  },
]

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Shrink-to-fit font size for a single line on a 1080 canvas. */
function fitSize(text: string, base: number, maxWidth = 940, charRatio = 0.62): number {
  if (!text.length) return base
  const fitted = Math.floor(maxWidth / (text.length * charRatio))
  return Math.max(28, Math.min(base, fitted))
}

export function renderLogoSvg(style: LogoStyle, text: string): string {
  const size = fitSize(text, style.baseSize, 940, style.font.ratio)
  const stroke = style.stroke ? ` stroke="${style.stroke}" stroke-width="${Math.max(1, size / 40)}"` : ''
  const filter = style.textFilter ? ` ${style.textFilter}` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>${style.defs}</defs>
  ${style.bg}
  <text x="540" y="540" text-anchor="middle" dominant-baseline="central"
    font-family="'${style.font.family}'" font-size="${size}" fill="${style.fill}"${stroke}${filter}>${escapeXml(text)}</text>
</svg>`
}

/** Simple single-font render on a clean dark card (IMG format). */
export function renderFontSvg(cf: CoolFont, text: string): string {
  const size = fitSize(text, 110, 940, cf.ratio)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="640" viewBox="0 0 1080 640">
  <rect width="1080" height="640" fill="#0d0d14"/>
  <text x="80" y="90" font-family="sans-serif" font-size="40" fill="#8b8b9e">${escapeXml(cf.label)}</text>
  <text x="540" y="360" text-anchor="middle" dominant-baseline="central"
    font-family="'${cf.family}'" font-size="${size}" fill="#ffffff">${escapeXml(text)}</text>
</svg>`
}

/** Preview sheet: the same text rendered in every cool font, one row each. */
export function renderFontSheetSvg(text: string): string {
  const rowH = 150
  const rows = COOL_FONTS.map((cf, i) => {
    const y = i * rowH
    const bg = i % 2 === 0 ? '#101018' : '#16161f'
    const size = Math.min(80, fitSize(text, 80, 700, cf.ratio))
    return `<rect x="0" y="${y}" width="1080" height="${rowH}" fill="${bg}"/>
      <text x="36" y="${y + rowH / 2}" dominant-baseline="central" font-family="sans-serif" font-size="32" fill="#8b8b9e">${escapeXml(cf.label)}</text>
      <text x="640" y="${y + rowH / 2 + 4}" text-anchor="middle" dominant-baseline="central"
        font-family="'${cf.family}'" font-size="${size}" fill="#ffffff">${escapeXml(text)}</text>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${COOL_FONTS.length * rowH}" viewBox="0 0 1080 ${COOL_FONTS.length * rowH}">
  ${rows}
</svg>`
}

export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 150 }).png().toBuffer()
}
