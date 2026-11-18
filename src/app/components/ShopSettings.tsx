import { FormEvent, useEffect, useState } from 'react'
import {
  fetchShopSettings,
  removePromoBanner,
  saveShopSettings,
  uploadPromoBanner,
  type ShopSettings as Settings,
} from '../lib/ordersApi'

const GOLD = '#E8B923'
const SHOP_URL = (import.meta.env.VITE_SHOP_URL ?? 'https://www.mrsqoopexpress.com').replace(/\/$/, '')

/** Shrink a picked image to a web-friendly JPEG so it loads fast on phones. */
async function toBannerDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (JPG, PNG or WebP).')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1200 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}
const input =
  'w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923]'

/** Pricing and promo controls for the shop: exchange rate, handling %, promo banner. */
export function ShopSettings() {
  const [form, setForm] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  // A new Conversions API token typed in. The saved one is never shown.
  const [capiToken, setCapiToken] = useState('')

  useEffect(() => {
    fetchShopSettings()
      .then((s) => setForm({ ...s, meta: s.meta ?? { pixelId: '', testEventCode: '' } }))
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setMessage(null)
    try {
      const { promoImageVersion, metaCapiTokenSet, ...rest } = form
      void promoImageVersion
      void metaCapiTokenSet
      const token = capiToken.trim()
      setForm(await saveShopSettings({ ...rest, ...(token ? { metaCapiToken: token } : {}) } as Settings))
      setCapiToken('')
      setMessage({
        ok: true,
        text: form.promo.enabled
          ? 'Saved. The shop uses these within about a minute.'
          : 'Saved. The promo banner is switched OFF, so nothing shows on the shop. Tick “Show promo banner” to show it.',
      })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const pickBanners = async (files: File[]) => {
    if (!files.length || !form) return
    setUploading(true)
    setMessage(null)
    let uploaded = 0
    let latest = form
    try {
      // One resized image per request keeps batches within upload limits.
      for (const file of files) {
        const banners = await uploadPromoBanner(await toBannerDataUrl(file))
        latest = { ...latest, promoBanners: banners }
        setForm(latest)
        uploaded++
        setMessage({ ok: true, text: `Uploaded ${uploaded} of ${files.length} flyers…` })
      }
      const saved = await saveShopSettings({ ...latest, promo: { ...latest.promo, enabled: true } })
      setForm(saved)
      setMessage({ ok: true, text: `${uploaded} flyers added. They rotate on the shop after its settings refresh.` })
    } catch (e) {
      setMessage({ ok: false, text: `${uploaded} flyers added. ${e instanceof Error ? e.message : 'Upload failed.'} You can select the remaining files and try again.` })
    } finally {
      setUploading(false)
    }
  }

  const removeCapiToken = async () => {
    if (!form) return
    setSaving(true)
    setMessage(null)
    try {
      const { promoImageVersion, metaCapiTokenSet, ...rest } = form
      void promoImageVersion
      void metaCapiTokenSet
      setForm(await saveShopSettings({ ...rest, metaCapiToken: '' } as Settings))
      setMessage({ ok: true, text: 'Conversions API token removed.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not remove the token.' })
    } finally {
      setSaving(false)
    }
  }

  const dropBanner = async (id: string) => {
    if (!form) return
    setUploading(true)
    try {
      const banners = await removePromoBanner(id)
      setForm({ ...form, promoBanners: banners, ...(id === 'promo-banner' ? { promoImageVersion: 0 } : {}) })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not remove the banner.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
      <h2 className="text-lg font-bold text-white">Shop Settings</h2>
      {loadError && <p className="mt-3 text-sm text-red-400">Could not load settings: {loadError}</p>}
      {!form && !loadError && <p className="mt-3 text-sm text-neutral-400">Loading…</p>}
      {form && (
        <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-neutral-400">
            Exchange rate (UGX per US$1)
            <input
              type="number"
              min={100}
              step="any"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}
              className={input}
            />
          </label>
          <label className="grid gap-1 text-sm text-neutral-400">
            Handling fee (% of product price)
            <input
              type="number"
              min={0}
              max={200}
              step="any"
              value={form.handlingPercent}
              onChange={(e) => setForm({ ...form, handlingPercent: Number(e.target.value) })}
              className={input}
            />
          </label>

          <div className="grid gap-3 md:col-span-2">
            <label className="flex items-center gap-3 text-white">
              <input
                type="checkbox"
                checked={form.promo.enabled}
                onChange={(e) => setForm({ ...form, promo: { ...form.promo, enabled: e.target.checked } })}
                className="h-5 w-5 accent-[#E8B923]"
              />
              Show promo banner on the shop
            </label>
            <div className="grid gap-3 md:grid-cols-[1fr_200px]">
              <input
                value={form.promo.text}
                maxLength={120}
                onChange={(e) => setForm({ ...form, promo: { ...form.promo, text: e.target.value } })}
                placeholder="Offer text, e.g. UGX 10,000 off your order"
                className={input}
              />
              <input
                value={form.promo.code}
                maxLength={30}
                onChange={(e) => setForm({ ...form, promo: { ...form.promo, code: e.target.value.toUpperCase() } })}
                placeholder="CODE"
                className={input}
              />
            </div>
            <div className="grid gap-3 text-sm text-neutral-400" aria-busy={uploading}>
              <p>Flyers — shown in upload order on the home page and product pages. Add as many as you need.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(form.promoBanners ?? (form.promoImageVersion > 0 ? [{ id: 'promo-banner', url: `/api/promo-banner?v=${form.promoImageVersion}` }] : [])).map((banner, index) => (
                  <div key={banner.id} className="grid gap-2 rounded-xl border border-neutral-800 p-3">
                    <img src={`${SHOP_URL}${banner.url}`} alt={`Flyer ${index + 1}`} className="max-h-40 w-full object-contain" />
                    <button type="button" disabled={uploading || saving} onClick={() => void dropBanner(banner.id)}
                      className="rounded-full border border-red-500/60 px-4 py-2 text-red-400 disabled:opacity-60">
                      Remove flyer {index + 1}
                    </button>
                  </div>
                ))}
              </div>
              <label className="grid gap-2 text-white">
                Add flyers (select one or more images)
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploading || saving}
                  className="block w-full rounded-xl border border-neutral-700 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B923]"
                  onChange={(e) => { void pickBanners(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              </label>
              <label className="grid gap-1">
                Change flyer every (seconds)
                <input type="number" min={1} max={86400} step={1} required value={form.promoRotationSeconds ?? 5}
                  disabled={uploading || saving}
                  onChange={(e) => setForm({ ...form, promoRotationSeconds: Number(e.target.value) })} className={input} />
              </label>
              <p>Click Save settings to apply the timing. With one flyer, the image stays still. Offer text and discount code apply to all flyers.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-neutral-400">
                Discount for this code (UGX taken off the order)
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={form.promo.discountUGX ?? 0}
                  onChange={(e) => setForm({ ...form, promo: { ...form.promo, discountUGX: Number(e.target.value) } })}
                  className={input}
                />
              </label>
              <label className="grid gap-1 text-sm text-neutral-400">
                Last day the code works (optional)
                <input
                  type="date"
                  value={form.promo.endsAt ?? ''}
                  onChange={(e) => setForm({ ...form, promo: { ...form.promo, endsAt: e.target.value } })}
                  className={input}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm text-neutral-400">
              Condition: minimum order total (UGX, 0 = no condition)
              <input
                type="number"
                min={0}
                step={1000}
                value={form.promo.minOrder}
                onChange={(e) => setForm({ ...form, promo: { ...form.promo, minOrder: Number(e.target.value) } })}
                className={input}
              />
            </label>
            <p className="text-xs text-neutral-500">
              Customers type the code at checkout. It takes the discount amount off the product prices (shipping and
              handling are charged in full; the discount never exceeds the items' cost), only on orders at or above the minimum, and stops working after the
              last day. Set the discount to 0 to show the banner without a working code.
            </p>
          </div>

          <div className="grid gap-3 border-t border-neutral-800 pt-4 md:col-span-2">
            <p className="font-semibold text-white">Card payments (Absa)</p>
            <label className="grid gap-1 text-sm text-neutral-400">
              Card payment link
              <input
                value={form.cardPayLink ?? ''}
                onChange={(e) => setForm({ ...form, cardPayLink: e.target.value.trim() })}
                placeholder="https://ebc2.cybersource.com/ebc2/payByLink/pay/…"
                className={input}
              />
            </label>
          </div>

          <div className="grid gap-3 border-t border-neutral-800 pt-4 md:col-span-2">
            <p className="font-semibold text-white">Meta Pixel (Facebook &amp; Instagram ads)</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-neutral-400">
                Pixel ID
                <input
                  value={form.meta.pixelId}
                  inputMode="numeric"
                  maxLength={20}
                  onChange={(e) => setForm({ ...form, meta: { ...form.meta, pixelId: e.target.value.replace(/\D/g, '') } })}
                  placeholder="e.g. 1234567890123456"
                  className={input}
                />
              </label>
              <label className="grid gap-1 text-sm text-neutral-400">
                Test event code (only while testing)
                <input
                  value={form.meta.testEventCode}
                  maxLength={40}
                  onChange={(e) =>
                    setForm({ ...form, meta: { ...form.meta, testEventCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') } })
                  }
                  placeholder="TEST12345"
                  className={input}
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm text-neutral-400">
              Conversions API access token
              <input
                type="password"
                autoComplete="off"
                value={capiToken}
                onChange={(e) => setCapiToken(e.target.value)}
                placeholder={form.metaCapiTokenSet ? 'Saved. Paste a new one only to replace it.' : 'Paste the token from Events Manager'}
                className={input}
              />
            </label>
            {form.metaCapiTokenSet && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-green-400">Token saved</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeCapiToken()}
                  className="rounded-full border border-red-500/60 px-4 py-2 text-red-400 disabled:opacity-60"
                >
                  Remove token
                </button>
              </div>
            )}
          </div>

          {message && (
            <p role="status" className={`text-sm md:col-span-2 ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>
          )}
          <button
            type="submit"
            disabled={saving || uploading}
            className="rounded-full py-3 font-bold text-black disabled:opacity-60 md:col-span-2"
            style={{ backgroundColor: GOLD }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}
    </section>
  )
}
