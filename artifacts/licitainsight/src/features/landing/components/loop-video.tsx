import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/common/action-button';

const play = (video: HTMLVideoElement) =>
  video.play().catch((error: unknown) => {
    // Our own pause (scrolled away, button) interrupting a pending play is not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error(`LoopVideo: não foi possível tocar ${video.currentSrc || 'o vídeo'}.`, error);
  });

export type LoopVideoProps = {
  /** Base path under `public/motion/`: `<name>.mp4`, `<name>-720.mp4`, `<name>-capa.avif` and, when `webm`, `<name>.webm`. */
  name: string;
  /** Accessible name of the video. */
  label: string;
  /** Caption below the video; also its accessible description. */
  description: string;
  /** What the play/pause button controls, e.g. "o teaser". */
  subject: string;
  testId: string;
  toggleTestId: string;
  reducedMotion: boolean;
  webm?: boolean;
  className?: string;
};

/**
 * A silent video in a loop. Nothing downloads, poster included, until it nears the screen; it plays while at least
 * half visible and pauses outside. With reduced motion it never starts by itself: the poster shows and the button
 * plays it. The button's choice wins over scrolling back into view.
 */
export function LoopVideo({ name, label, description, subject, testId, toggleTestId, reducedMotion, webm = false, className }: LoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userWantsPlay = useRef<boolean | null>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const descriptionId = `${testId}-descricao`;

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

  const file = `${import.meta.env.BASE_URL}motion/${name}`;
  return (
    <figure className={className}>
      <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-petroleo-profundo">
        <video
          ref={videoRef}
          data-testid={testId}
          aria-label={label}
          aria-describedby={descriptionId}
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
          {webm && <source src={`${file}.webm`} type='video/webm; codecs="vp9"' />}
          <source src={`${file}.mp4`} type="video/mp4" />
        </video>
      </div>
      <figcaption className="mt-4 flex items-center justify-between gap-4">
        <p id={descriptionId} className="type-meta text-muted-foreground">
          {description}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          data-testid={toggleTestId}
          aria-label={playing ? `Pausar ${subject}` : `Reproduzir ${subject}`}
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          {playing ? 'Pausar' : 'Reproduzir'}
        </Button>
      </figcaption>
    </figure>
  );
}
