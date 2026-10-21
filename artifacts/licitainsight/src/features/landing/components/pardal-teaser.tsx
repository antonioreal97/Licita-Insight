import { LoopVideo } from './loop-video';

/** The owner's 12 s silent teaser, in a loop (see `LoopVideo` for loading, visibility and reduced motion). */
export function PardalTeaser({ reducedMotion, className }: { reducedMotion: boolean; className?: string }) {
  return (
    <LoopVideo
      name="pardal-teaser"
      label="Teaser do Pardal Digital"
      description="Uma busca por “uniformes escolares” lista os editais abertos e destaca um deles, com órgão, prazo e valor. 12 segundos, sem som."
      subject="o teaser"
      testId="video-landing-teaser"
      toggleTestId="button-landing-teaser-toggle"
      reducedMotion={reducedMotion}
      webm
      className={className}
    />
  );
}
