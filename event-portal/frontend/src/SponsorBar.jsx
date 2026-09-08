const SPONSOR_COUNT = 13;

export default function SponsorBar() {
  return (
    <div className="sponsor-bar">
      <div className="sponsor-bar-label">Proudly Supported By</div>
      <div className="sponsor-bar-logos">
        {Array.from({ length: SPONSOR_COUNT }, (_, i) => i + 1).map((n) => (
          <img
            key={n}
            src={`/sponsors/sponsor-${n}.png`}
            alt={`Sponsor ${n}`}
            className="sponsor-logo"
          />
        ))}
      </div>
    </div>
  );
}
