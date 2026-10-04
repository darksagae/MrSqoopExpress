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

  useEffect(() => {
    fetchShopSettings()
      .then(setForm)
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setMessage(null)
    try {
      const { promoImageVersion, ...rest } = form
      void promoImageVersion
      setForm(await saveShopSettings(rest as Settings))
      setMessage({ ok: true, text: 'Saved. The shop uses these within about a minute.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const pickBanner = async (file: File | undefined) => {
    if (!file || !form) return
    setUploading(true)
    setMessage(null)
    try {
      const version = await uploadPromoBanner(await toBannerDataUrl(file))
      setForm({ ...form, promoImageVersion: version })
      setMessage({ ok: true, text: 'Banner uploaded. Make sure “Show promo banner” is ticked and saved.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not upload the banner.' })
    } finally {
      setUploading(false)
    }
  }

  const dropBanner = async () => {
    if (!form) return
    setUploading(true)
    try {
      await removePromoBanner()
      setForm({ ...form, promoImageVersion: 0 })
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
                placeholder="Offer text, e.g. 10% off your first order"
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
            <div className="grid gap-2 text-sm text-neutral-400">
              Banner image (optional) — shown on the home page and product pages
              {form.promoImageVersion > 0 && (
                <img
                  src={`${SHOP_URL}/api/promo-banner?v=${form.promoImageVersion}`}
                  alt="Current banner"
                  className="max-h-40 w-full rounded-xl border border-neutral-800 object-contain"
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className="cursor-pointer rounded-full px-4 py-2 font-bold text-black"
                  style={{ backgroundColor: GOLD, opacity: uploading ? 0.6 : 1 }}
                >
                  {uploading ? 'Uploading…' : form.promoImageVersion > 0 ? 'Replace banner' : 'Upload banner'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    className="hidden"
                    onChange={(e) => {
                      void pickBanner(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                {form.promoImageVersion > 0 && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void dropBanner()}
                    className="rounded-full border border-red-500/60 px-4 py-2 text-red-400 disabled:opacity-60"
                  >
                    Remove banner
                  </button>
                )}
              </div>
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
              Shown on the home page and under the shipping box on product pages. The banner only displays the code;
              it does not discount the total. With a minimum set, it adds “Valid on orders over UGX …” underneath.
            </p>
          </div>

          {message && (
            <p className={`text-sm md:col-span-2 ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>
          )}
          <button
            type="submit"
            disabled={saving}
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
