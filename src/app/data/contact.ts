export const BUSINESS = {
  name: 'Mr Sqoop Express',
  address: 'KAMA KAMU PLAZA FF27, Kampala',
  whatsapp: '0756132911',
  whatsappIntl: '256756132911',
  phone: '+256756132911',
  email: 'info@mrsqoopexpress.com',
  lat: 0.3131,
  lng: 32.5718,
}

export const DEFAULT_WHATSAPP_MESSAGE =
  'Hi Mr Sqoop Express, I would like to make an inquiry'

export function buildWhatsAppUrl(message = DEFAULT_WHATSAPP_MESSAGE) {
  const base = `https://wa.me/${BUSINESS.whatsappIntl}`
  return `${base}?text=${encodeURIComponent(message)}`
}
