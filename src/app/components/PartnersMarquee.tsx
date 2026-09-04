type Partner = {
  name: string
  slug?: string
  domain: string
}

const PARTNERS: Partner[] = [
  { name: 'Amazon', slug: 'amazon', domain: 'amazon.com' },
  { name: 'Shein', slug: 'shein', domain: 'shein.com' },
  { name: 'AliExpress', slug: 'aliexpress', domain: 'aliexpress.com' },
  { name: 'Noon', domain: 'noon.com' },
  { name: 'Temu', slug: 'temu', domain: 'temu.com' },
  { name: 'eBay', slug: 'ebay', domain: 'ebay.com' },
]

function iconSrc(partner: Partner) {
  if (partner.slug) return `https://cdn.simpleicons.org/${partner.slug}/ffffff`
  return `https://www.google.com/s2/favicons?domain=${partner.domain}&sz=128`
}

export function PartnersMarquee() {
  const items = [...PARTNERS, ...PARTNERS]

  return (
    <div
      className="partners-marquee"
      aria-label="We deliver from Amazon, Shein, AliExpress, Noon, Temu, and eBay"
    >
      <div className="partners-marquee-track">
        {items.map((partner, i) => (
          <span key={`${partner.name}-${i}`} className="partners-marquee-item">
            <img
              src={iconSrc(partner)}
              alt=""
              className="partners-marquee-logo"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <span className="partners-marquee-name">{partner.name}</span>
            <span className="partners-marquee-sep" aria-hidden="true">
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
