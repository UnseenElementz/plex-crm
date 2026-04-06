type CosmicBackdropProps = {
  variant?: 'default' | 'landing' | 'portal'
}

export default function CosmicBackdrop({ variant = 'default' }: CosmicBackdropProps) {
  return (
    <div className={`cosmic-backdrop cosmic-backdrop--${variant}`} aria-hidden="true">
      <div className="cosmic-stars" />
      <div className="cosmic-grid-glow" />
      <div className="cosmic-nebula cosmic-nebula-a" />
      <div className="cosmic-nebula cosmic-nebula-b" />
      <div className="cosmic-nebula cosmic-nebula-c" />
      <div className="cosmic-orbit cosmic-orbit-a" />
      <div className="cosmic-orbit cosmic-orbit-b" />
      <div className="cosmic-planet cosmic-planet-a" />
      <div className="cosmic-planet cosmic-planet-b" />
      <div className="cosmic-planet cosmic-planet-c" />
      <div className="cosmic-film-cloud">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`cosmic-poster cosmic-poster-${index + 1}`}>
            <div className="cosmic-poster-glow" />
            <div className="cosmic-poster-label">{index % 2 === 0 ? 'Cinema' : 'Series'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
