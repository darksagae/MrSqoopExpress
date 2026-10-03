/**
 * AliExpress's image server resizes on request when a size is appended to the
 * file name. Listing photos are shown at roughly 200px, so asking for 480px
 * (sharp on 2x phone screens) instead of the full original cuts each image
 * from ~100 KB to ~15 KB. Anything that isn't a plain AliExpress image URL, or
 * that already carries a size, is returned untouched.
 */
const RESIZABLE = /^https:\/\/[^/?#]+\.(?:aliexpress-media|alicdn)\.com\/[^?#]+\.(?:jpe?g|png)$/i;

export function thumb(url, size = 480) {
  if (!url || !RESIZABLE.test(url) || /_\d+x\d+/.test(url)) return url;
  return `${url}_${size}x${size}q75.jpg`;
}
