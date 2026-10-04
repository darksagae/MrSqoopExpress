import { FormEvent, useEffect, useState } from 'react'
import { fetchShopSettings, saveShopSettings, type ShopSettings as Settings } from '../lib/ordersApi'

const GOLD = '#E8B923'
const input =
  'w-full rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923]'

/** Pricing and promo controls for the shop: exchange rate, handling %, promo banner. */
export function ShopSettings() {
  const [form, setForm] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

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
      setForm(await saveShopSettings(form))
      setMessage({ ok: true, text: 'Saved. The shop uses these within about a minute.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' })
    } finally {
      setSaving(false)
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
            <p className="text-xs text-neutral-500">
              Shown on the home page and under the shipping box on product pages. The banner only displays the code;
              it does not discount the total.
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
