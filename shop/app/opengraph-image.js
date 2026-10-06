import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Mr Sqoop Express: online shopping and delivery in Uganda';

// The picture shown when the site is shared in WhatsApp, Facebook, X and so on.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', width: 700, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 6, background: '#fff' }} />
          <div style={{ fontSize: 54, fontWeight: 700, margin: '0 28px' }}>MR</div>
          <div style={{ flex: 1, height: 6, background: '#fff' }} />
        </div>
        <div style={{ fontSize: 200, fontWeight: 900, letterSpacing: -4, lineHeight: 1 }}>SQOOP</div>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: 6, marginTop: 4 }}>EXPRESS</div>
        <div style={{ fontSize: 38, color: '#E8B923', marginTop: 40 }}>Online shopping &amp; delivery in Uganda</div>
      </div>
    ),
    size
  );
}
