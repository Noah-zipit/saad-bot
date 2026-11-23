import download from './download.js'

/**
 * !instagram — alias for the real downloader.
 *
 * The old !instagram / !ig / !insta command only sent a mock
 * "acknowledged" message and never downloaded anything, so anyone
 * typing !instagram <link> got no media at all. This replaces it with
 * the real !download handler (Cobalt), so !instagram <link> downloads
 * the same way !download <link> does.
 *
 * Honest limit, inherited from !download: Instagram blocks anonymous
 * downloads for some posts (login-only reels, private or age-gated
 * accounts). Those still fail with a plain explanation, not a fake
 * success message.
 */

export default {
  ...download,
  pattern: /^(instagram|ig|insta)$/i,
  help: 'Download an Instagram video/photo (!instagram <link>)',
  usage: '!instagram <instagram link>',
  example: '!instagram https://www.instagram.com/reel/abcdefg/'
}
