import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Mr Sqoop Express — Online Shopping & Delivery to Uganda';

export default async function OgImage() {
  const logo = await readFile(join(process.cwd(), 'public/logo-white.png'));
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <img src={`data:image/png;base64,${logo.toString('base64')}`} width={740} height={354} alt="Mr Sqoop Express" />
      <div style={{ fontSize: 36, marginTop: 28 }}>Online Shopping &amp; Delivery to Uganda</div>
    </div>,
    size
  );
}
