import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default async function Icon() {
  const logo = await readFile(join(process.cwd(), 'public/logo-white.png'));
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={`data:image/png;base64,${logo.toString('base64')}`} width={444} height={212} alt="Mr Sqoop Express" />
    </div>,
    size
  );
}
