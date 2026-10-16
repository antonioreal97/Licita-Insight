import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/common/action-button';

const play = (video: HTMLVideoElement) =>
  video.play().catch((error: unknown) => {
    // Our own pause (scrolled away, button) interrupting a pending play is not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error(`PardalTeaser: não foi possível tocar ${video.currentSrc || 'o teaser'}.`, error);
  });

/**
 * The owner's 12 s silent teaser, in a loop. Nothing downloads, poster included, until it nears the screen; it plays
 * while at least half visible and pauses outside. With reduced motion it never starts by itself: the poster shows and
 * the button plays it. The button's choice wins over scrolling back into view.
 */
export function PardalTeaser({ reducedMotion, className }: { reducedMotion: boolean; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userWantsPlay = useRef<boolean | null>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        nearObserver.disconnect();
      },
      { rootMargin: '50% 0px' },
    );
    const visibleObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) video.pause();
        else if (userWantsPlay.current ?? !reducedMotion) play(video);
      },
      { threshold: 0.5 },
    );
    nearObserver.observe(video);
    visibleObserver.observe(video);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [reducedMotion]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    userWantsPlay.current = video.paused;
    if (video.paused) play(video);
    else video.pause();
  };

  const file = `${import.meta.env.BASE_URL}motion/pardal-teaser`;
  return (
    <figure className={className}>
      <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-petroleo-profundo">
        <video
          ref={videoRef}
          data-testid="video-landing-teaser"
          aria-label="Teaser do Pardal Digital"
          aria-describedby="teaser-descricao"
          width={1920}
          height={1080}
          muted
          loop
          playsInline
          preload="none"
          poster={near ? `${file}-capa.avif` : undefined}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="size-full object-cover"
        >
          <source src={`${file}-720.mp4`} type="video/mp4" media="(max-width: 767px)" />
          <source src={`${file}.webm`} type='video/webm; codecs="vp9"' />
          <source src={`${file}.mp4`} type="video/mp4" />
        </video>
      </div>
      <figcaption className="mt-4 flex items-center justify-between gap-4">
        <p id="teaser-descricao" className="type-meta text-muted-foreground">
          Uma busca por “uniformes escolares” lista os editais abertos e destaca um deles, com órgão, prazo e valor.
          12 segundos, sem som.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          data-testid="button-landing-teaser-toggle"
          aria-label={playing ? 'Pausar o teaser' : 'Reproduzir o teaser'}
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          {playing ? 'Pausar' : 'Reproduzir'}
        </Button>
      </figcaption>
    </figure>
  );
}
