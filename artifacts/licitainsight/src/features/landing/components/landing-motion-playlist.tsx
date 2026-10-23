import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/common/action-button';

const clips = [
  {
    id: 'funcionalidades',
    file: 'landing-funcionalidades',
    label: 'Como acompanhar cada edital no Pardal Digital',
  },
  {
    id: 'recomendacao',
    file: 'landing-recomendacao',
    label: 'Do perfil da empresa às recomendações',
  },
  {
    id: 'ajuda',
    file: 'landing-ajuda',
    label: 'Ajuda, glossário e prontidão para licitar',
  },
] as const;

const play = (video: HTMLVideoElement) =>
  video.play().catch((error: unknown) => {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
      return;
    }
    console.error(`LandingMotionPlaylist: não foi possível tocar ${video.currentSrc || 'o clipe'}.`, error);
  });

/**
 * Três clipes de motion design da plataforma em sequência (sem áudio): ao terminar um, começa o próximo;
 * ao terminar o último, volta ao primeiro. Só baixa perto da viewport; pausa fora dela.
 * Com reduced motion, não inicia sozinho — só pelo botão.
 */
export function LandingMotionPlaylist({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userWantsPlay = useRef<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

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
        if (!entry.isIntersecting) {
          video.pause();
          return;
        }
        if (userWantsPlay.current ?? !reducedMotion) play(video);
      },
      { threshold: 0.4 },
    );
    nearObserver.observe(video);
    visibleObserver.observe(video);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [reducedMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near) return;
    video.load();
    if (userWantsPlay.current === false) return;
    if (userWantsPlay.current === true || !reducedMotion) play(video);
  }, [index, near, reducedMotion]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    userWantsPlay.current = video.paused;
    if (video.paused) play(video);
    else video.pause();
  };

  const clip = clips[index];
  const src = near ? `${import.meta.env.BASE_URL}motion/${clip.file}.mp4` : undefined;

  return (
    <figure className={className}>
      <div className="landing-journey-media">
        <video
          ref={videoRef}
          data-testid="video-landing-motion-playlist"
          aria-label={clip.label}
          aria-describedby="journey-motion-descricao"
          width={1920}
          height={1080}
          muted
          playsInline
          preload={near ? 'metadata' : 'none'}
          src={src}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setIndex((current) => (current + 1) % clips.length)}
        />
      </div>
      <figcaption className="landing-journey-media-caption">
        <p id="journey-motion-descricao" className="type-meta">
          {clip.label}. {index + 1} de {clips.length} — em sequência contínua.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          data-testid="button-landing-motion-playlist-toggle"
          aria-label={playing ? 'Pausar o vídeo' : 'Reproduzir o vídeo'}
        >
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          {playing ? 'Pausar' : 'Reproduzir'}
        </Button>
      </figcaption>
    </figure>
  );
}
