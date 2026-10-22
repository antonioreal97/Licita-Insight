import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const CLIPS = {
  'pardal-assinatura': { width: 736, height: 660 },
  'pardal-raio-x': { width: 960, height: 600 },
};

/**
 * Pre-rendered HyperFrames clip (`motion/`, rendered by `motion:render` into `public/motion/`). Plays once when it
 * scrolls into view and stays on its last frame; with reduced motion only that last frame shows. It sits on
 * `bg-superficie-inversa`, so the ink is the opposite of the theme: lima on Gelo, petróleo on Petróleo.
 */
export function PardalClip({
  clip,
  reducedMotion,
  className,
}: {
  clip: keyof typeof CLIPS;
  reducedMotion: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || reducedMotion) return;
    // The hidden ink variant is `display: none`, never intersects and so never downloads or plays.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const video = entry.target as HTMLVideoElement;
          observer.unobserve(video);
          video.play().catch((error: unknown) => {
            console.error(`PardalClip: não foi possível tocar ${video.currentSrc || clip}.`, error);
          });
        }
      },
      { threshold: 0.6 },
    );
    container.querySelectorAll('video').forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [clip, reducedMotion]);

  const { width, height } = CLIPS[clip];
  const variant = (ink: 'lima' | 'petroleo', visibility: string) => {
    const file = `${import.meta.env.BASE_URL}motion/${clip}-${ink}`;
    return (
      <video
        key={`${ink}-${reducedMotion}`}
        width={width}
        height={height}
        muted
        playsInline
        preload="none"
        poster={`${file}.png`}
        className={cn('h-auto w-full', visibility)}
      >
        <source src={`${file}.mov`} type='video/quicktime; codecs="hvc1"' />
        <source src={`${file}.webm`} type="video/webm" />
      </video>
    );
  };

  return (
    <div ref={containerRef} aria-hidden className={className}>
      {variant('lima', 'dark:hidden')}
      {variant('petroleo', 'hidden dark:block')}
    </div>
  );
}
