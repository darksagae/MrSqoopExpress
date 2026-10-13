'use client';

import { useEffect, useState } from 'react';
import { optOut, optedOut } from '@/lib/meta-pixel';

/** Lets a visitor turn ads tracking off on this device at any time. */
export default function TrackingChoice() {
  const [off, setOff] = useState(null);
  useEffect(() => setOff(optedOut()), []);
  if (off === null) return null;
  return off ? (
    <p><strong>Ads tracking is off on this device.</strong></p>
  ) : (
    <p>
      <button
        type="button"
        className="btn-dark"
        onClick={() => {
          optOut();
          setOff(true);
        }}
      >
        Turn off ads tracking on this device
      </button>
    </p>
  );
}
