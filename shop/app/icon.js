import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

// The site icon shown in browser tabs and next to the site name in Google
// results: the brand's black tile with the two-letter mark.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000',
          borderRadius: 96,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 300,
          fontWeight: 800,
          letterSpacing: -12,
        }}
      >
        SQ
      </div>
    ),
    size
  );
}
