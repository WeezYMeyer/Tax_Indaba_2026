import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Stream() {
  const [embedUrl, setEmbedUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.streamAccess()
      .then((data) => setEmbedUrl(data.embedUrl))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="stream-wrap">
      <div className="eyebrow">Live now</div>
      {error && <div className="error-msg">{error}</div>}
      <div className="stream-frame">
        {embedUrl ? (
          <iframe src={embedUrl} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="Event stream" />
        ) : (
          !error && <div style={{ color: 'var(--text-dim)', textAlign: 'center', paddingTop: '20%' }}>Loading stream…</div>
        )}
      </div>
    </div>
  );
}
