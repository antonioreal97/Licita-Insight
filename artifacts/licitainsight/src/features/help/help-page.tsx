import React, { useEffect, useId, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Check,
  Flame,
  Info,
  Lightbulb,
  RotateCcw,
  Search,
  Star,
  Target,
  Trophy,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-icon';
import { Input } from '@/components/ui/input';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  FIRST_STEPS,
  GLOSSARY,
  GLOSSARY_DISCLAIMER,
  glossaryById,
  type GlossaryCategory,
  type GlossaryEntry,
} from './glossary';
import { glossaryAnchor } from './components/glossary-term';
import { GlossaryScope, GlossaryText } from './components/glossary-text';
import {
  GLOSSARY_ROUND_GOAL,
  GLOSSARY_TOPICS,
  glossaryQuizFor,
  glossaryReward,
  learningNoteFor,
  simpleGlossaryDefinition,
} from './glossary-learning';
import { searchGlossary } from './lib/glossary-search';
import { HELP_FAQ, HELP_PATHS, PROCESS_TRACKS, SOURCE_GUIDES, type SourceGuide } from './guide-data';

export const HELP_TITLE = 'Ajuda para vender ao governo e captar recursos · Pardal Digital';
export const HELP_DESCRIPTION =
  'Aprenda a participar de pregões, dispensas e chamadas de fomento. Consulte termos do PNCP, Mapas Culturais, FINEP, CNPq, CAPES e fontes internacionais.';

/** SPA route: sets the description while the page is open and puts the previous one back on the way out. */
function useMetaDescription(content: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = content;
    return () => {
      meta.content = previous;
    };
  }, [content]);
}

/** Opens and focuses a glossary entry reached from another part of the app. */
function useHashFocus() {
  useEffect(() => {
    const focusHash = () => {
      if (!window.location.hash) return;
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.scrollIntoView({ block: 'start' });
      const focusTarget = target.querySelector<HTMLElement>('summary') ?? target;
      focusTarget.focus({ preventScroll: true });
    };
    const timer = window.setTimeout(focusHash, 0);
    window.addEventListener('hashchange', focusHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('hashchange', focusHash);
    };
  }, []);
}

const linkClass = 'inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

function OfficialLinks({ sources, label }: { sources: GlossaryEntry['sources']; label: string }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 type-meta">
      {sources.map((source) => (
        <li key={`${source.url}-${source.label}`}>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {source.label}
            <ArrowUpRight size={13} aria-hidden="true" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function EntryArticle({ entry, headingLevel, expanded }: { entry: GlossaryEntry; headingLevel: 'h3' | 'h4'; expanded: boolean }) {
  const Heading = headingLevel;
  const note = learningNoteFor(entry);
  return (
    <details
      id={glossaryAnchor(entry.id)}
      open={expanded || undefined}
      className="group scroll-mt-24 border-b border-border-subtle py-1 last:border-0"
      data-testid="glossary-entry"
      data-id={entry.id}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg px-2 py-3.5 text-left hover:bg-muted focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <Heading className="type-ui font-semibold text-foreground">{entry.term}</Heading>
          <span className="mt-1 block type-meta font-normal text-muted-foreground">{simpleGlossaryDefinition(entry)}</span>
        </span>
        <span aria-hidden="true" className="mt-0.5 shrink-0 type-ui text-muted-foreground group-open:hidden">+</span>
        <span aria-hidden="true" className="mt-0.5 hidden shrink-0 type-ui text-muted-foreground group-open:inline">▴</span>
      </summary>
      <div className="max-w-3xl px-2 pb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-primary-subtle p-4 text-primary-subtle-foreground">
            <p className="flex items-center gap-2 type-ui font-semibold">
              <Lightbulb size={16} aria-hidden="true" /> Na prática
            </p>
            <p className="mt-2 type-meta">{note.example}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted p-4 text-foreground">
            <p className="flex items-center gap-2 type-ui font-semibold">
              <Check size={16} aria-hidden="true" /> Guarde esta ideia
            </p>
            <p className="mt-2 type-meta">{note.remember}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="type-ui font-semibold text-foreground">Entenda melhor</p>
          <p className="mt-1 type-body text-foreground/90">{entry.definition}</p>
        </div>
        <div className="mt-4 border-l-4 border-primary pl-4">
          <p className="type-ui font-semibold text-foreground">Agora faça assim</p>
          <p className="mt-1 type-body text-foreground/90">{entry.whatToDo}</p>
        </div>
        <div className="mt-3">
          <OfficialLinks sources={entry.sources} label={`Fontes oficiais sobre ${entry.term}`} />
        </div>
      </div>
    </details>
  );
}

function GlossaryLearningStudio() {
  const [topic, setTopic] = useState<GlossaryCategory>('basics');
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [newlyCompletedId, setNewlyCompletedId] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [roundCorrect, setRoundCorrect] = useState(0);
  const [lastReward, setLastReward] = useState<ReturnType<typeof glossaryReward> | null>(null);
  const entries = GLOSSARY.filter((entry) => entry.category === topic);
  const entry = entries[cardIndex] ?? entries[0]!;
  const topicCopy = GLOSSARY_TOPICS[topic];
  const note = learningNoteFor(entry);
  const quiz = glossaryQuizFor(entry, entries);
  const completedInTopic = entries.filter((item) => completed.has(item.id)).length;
  const completedTopics = CATEGORY_ORDER.filter((item) => {
    const topicEntries = GLOSSARY.filter((entryItem) => entryItem.category === item);
    return topicEntries.every((entryItem) => completed.has(entryItem.id));
  });
  const achievementCount = Number(completed.size >= 1) + Number(completed.size >= 10) + completedTopics.length;
  const answerIsCorrect = selectedAnswer === quiz.correctAnswer;
  const roundComplete = roundCorrect >= GLOSSARY_ROUND_GOAL;
  const achievementsUnlockedNow = newlyCompletedId === entry.id
    ? [
        ...(completed.size === 1 ? ['Primeiro acerto'] : []),
        ...(completed.size === 10 ? ['Em ritmo de estudo'] : []),
        ...(completedInTopic === entries.length ? [topicCopy.badge] : []),
      ]
    : [];
  const mascotMessage = !revealed
    ? `Sua missão: escolha a ideia que melhor explica “${entry.term}”.`
    : selectedAnswer === null
      ? 'Aqui vai uma pista. Leia o exemplo e faça sua escolha.'
      : answerIsCorrect
        ? roundComplete
          ? 'Rodada completa! Cinco desafios vencidos. Você quer jogar mais uma?'
          : achievementsUnlockedNow.length > 0
          ? `Mandou bem! Você liberou ${achievementsUnlockedNow.join(' e ')}.`
          : streak > 1
            ? `Boa! Você chegou a ${streak} acertos seguidos.`
            : 'Mandou bem! Mais um desafio concluído. Vamos para o próximo?'
        : 'Boa tentativa! Compare as respostas destacadas e tente mais uma vez.';

  const resetChallenge = () => {
    setRevealed(false);
    setSelectedAnswer(null);
    setNewlyCompletedId(null);
    setLastReward(null);
  };

  const chooseTopic = (nextTopic: GlossaryCategory) => {
    const nextEntries = GLOSSARY.filter((item) => item.category === nextTopic);
    const firstPending = nextEntries.findIndex((item) => !completed.has(item.id));
    setTopic(nextTopic);
    setCardIndex(firstPending >= 0 ? firstPending : 0);
    resetChallenge();
  };

  const move = (direction: -1 | 1) => {
    setCardIndex((current) => (current + direction + entries.length) % entries.length);
    resetChallenge();
  };

  const continueGame = () => {
    if (roundComplete) setRoundCorrect(0);
    for (let offset = 1; offset <= entries.length; offset += 1) {
      const nextIndex = (cardIndex + offset) % entries.length;
      if (!completed.has(entries[nextIndex]!.id)) {
        setCardIndex(nextIndex);
        resetChallenge();
        return;
      }
    }
    const topicIndex = CATEGORY_ORDER.indexOf(topic);
    for (let offset = 1; offset <= CATEGORY_ORDER.length; offset += 1) {
      const nextTopic = CATEGORY_ORDER[(topicIndex + offset) % CATEGORY_ORDER.length]!;
      const nextEntries = GLOSSARY.filter((item) => item.category === nextTopic);
      const firstPending = nextEntries.findIndex((item) => !completed.has(item.id));
      if (firstPending >= 0) {
        setTopic(nextTopic);
        setCardIndex(firstPending);
        resetChallenge();
        return;
      }
    }
    move(1);
  };

  const answerChallenge = (answer: string) => {
    const correctOnFirstTry = selectedAnswer === null;
    setSelectedAnswer(answer);
    if (answer !== quiz.correctAnswer) {
      setNewlyCompletedId(null);
      setLastReward(null);
      setStreak(0);
      setRevealed(true);
      return;
    }
    if (completed.has(entry.id)) {
      setNewlyCompletedId(null);
      setLastReward(null);
      return;
    }
    const reward = glossaryReward(streak, correctOnFirstTry);
    setCompleted((current) => new Set(current).add(entry.id));
    setNewlyCompletedId(entry.id);
    setPoints((current) => current + reward.points);
    setStreak(reward.nextStreak);
    setBestStreak((current) => Math.max(current, reward.nextStreak));
    setRoundCorrect((current) => Math.min(GLOSSARY_ROUND_GOAL, current + 1));
    setLastReward(reward);
    setRevealed(true);
  };

  return (
    <div className="mt-6" data-testid="glossary-learning-studio">
      <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div>
            <p className="flex items-center gap-2 type-ui font-semibold text-foreground">
              <Target size={17} aria-hidden="true" className="text-primary" /> Rodada rápida
            </p>
            <p className="mt-1 type-meta text-muted-foreground">Acerte 5 termos de qualquer assunto. Respostas seguidas valem bônus.</p>
            <ol className="mt-4 flex gap-2" aria-label={`${roundCorrect} de ${GLOSSARY_ROUND_GOAL} acertos nesta rodada`}>
              {Array.from({ length: GLOSSARY_ROUND_GOAL }, (_, index) => {
                const finished = index < roundCorrect;
                return (
                  <li
                    key={index}
                    aria-label={finished ? `Acerto ${index + 1} concluído` : `Acerto ${index + 1} pendente`}
                    className={`flex size-9 items-center justify-center rounded-lg border type-meta font-semibold ${
                      finished
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    {finished ? <Check size={16} aria-hidden="true" /> : index + 1}
                  </li>
                );
              })}
            </ol>
          </div>
          <dl className="grid grid-cols-3 gap-x-5 gap-y-2" aria-label="Placar do glossário">
            <div>
              <dt className="type-meta text-muted-foreground">Pontos</dt>
              <dd className="type-title text-foreground" data-testid="glossary-score">{points}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 type-meta text-muted-foreground"><Flame size={14} aria-hidden="true" /> Sequência</dt>
              <dd className="type-title text-foreground" data-testid="glossary-streak">{streak}</dd>
            </div>
            <div>
              <dt className="type-meta text-muted-foreground">Conquistas</dt>
              <dd className="type-title text-foreground">{achievementCount}</dd>
            </div>
          </dl>
        </div>
        <div className={`border-t px-5 py-3 type-meta sm:px-6 ${roundComplete ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border text-muted-foreground'}`}>
          {roundComplete
            ? 'Rodada concluída. Continue para começar outra e manter sua melhor sequência.'
            : `Melhor sequência: ${bestStreak}. O placar fica apenas nesta tela.`}
        </div>
      </div>

      <div className="flex snap-x gap-2 overflow-x-auto pb-2" aria-label="Escolha um assunto para estudar">
        {CATEGORY_ORDER.map((item) => {
          const topicEntries = GLOSSARY.filter((entryItem) => entryItem.category === item);
          const count = topicEntries.length;
          const topicCompleted = topicEntries.filter((entryItem) => completed.has(entryItem.id)).length;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={topic === item}
              onClick={() => chooseTopic(item)}
              className={`shrink-0 snap-start rounded-pill border px-4 py-2 text-left type-meta font-semibold focus-visible:focus-ring active:translate-y-px ${
                topic === item
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {topicCompleted === count && <Check size={14} aria-hidden="true" className="mr-1 inline" />}
              {CATEGORY_LABELS[item]} <span className="font-normal opacity-80">({topicCompleted}/{count})</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b border-border bg-muted p-5 sm:p-6 lg:border-r lg:border-b-0">
          <BookOpen size={22} aria-hidden="true" className="text-primary" />
          <h3 className="mt-4 type-title text-foreground">{topicCopy.title}</h3>
          <p className="mt-2 type-body text-foreground/90">{topicCopy.description}</p>
          <div className="mt-5 rounded-xl border border-border bg-card p-4">
            <p className="type-ui font-semibold text-foreground">Imagine assim</p>
            <p className="mt-2 type-meta text-foreground/90">{topicCopy.analogy}</p>
          </div>
          <div className="mt-4 rounded-xl bg-primary-subtle p-4 text-primary-subtle-foreground" aria-live="polite">
            <p className="flex items-center gap-2 type-ui font-semibold">
              {completedInTopic === entries.length ? <Trophy size={17} aria-hidden="true" /> : <Award size={17} aria-hidden="true" />}
              {completedInTopic === entries.length ? 'Conquista liberada' : 'Missão do assunto'}
            </p>
            <p className="mt-1 type-meta">
              {completedInTopic === entries.length
                ? `Você conquistou “${topicCopy.badge}”.`
                : `Conclua mais ${entries.length - completedInTopic} ${entries.length - completedInTopic === 1 ? 'desafio' : 'desafios'} para liberar “${topicCopy.badge}”.`}
            </p>
          </div>
        </div>

        <div className="flex min-h-96 flex-col p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-primary-subtle p-3 text-primary-subtle-foreground" data-testid="glossary-mascot" role="note">
            <BrandLogo symbol className="h-14" />
            <div className="min-w-0">
              <p className="type-meta font-semibold">Pardal, seu guia</p>
              <p className="mt-1 type-meta">{mascotMessage}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 type-meta text-muted-foreground">
            <span>Desafio {cardIndex + 1} de {entries.length}</span>
            {completed.has(entry.id) && (
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                <Check size={14} aria-hidden="true" /> Concluído
              </span>
            )}
          </div>
          <p className="mt-8 type-meta font-semibold text-primary">Você sabe o que isso quer dizer?</p>
          <h4 className="mt-2 type-titulo-3 text-foreground">{entry.term}</h4>

          <div hidden={!revealed} className="mt-5 border-l-4 border-primary pl-4">
            <p className="type-meta font-semibold text-primary">{selectedAnswer === null ? 'Pista do Pardal' : 'Entenda a resposta'}</p>
            <p className="type-body font-semibold text-foreground">{simpleGlossaryDefinition(entry)}</p>
            <p className="mt-2 type-meta text-foreground/90"><span className="font-semibold text-foreground">Exemplo: </span>{note.example}</p>
          </div>

          <fieldset className="mt-6">
            <legend className="type-ui font-semibold text-foreground">{quiz.prompt}</legend>
            <div className="mt-3 grid gap-2">
              {quiz.options.map((option, optionIndex) => {
                const selected = selectedAnswer === option;
                const correct = option === quiz.correctAnswer;
                const showAsCorrect = selectedAnswer !== null && correct;
                const stateClass = showAsCorrect
                  ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                  : selected
                    ? 'border-destructive bg-destructive-subtle text-destructive-subtle-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary hover:bg-muted';
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${String.fromCharCode(65 + optionIndex)}. ${option}${showAsCorrect ? '. Resposta correta.' : ''}`}
                    disabled={answerIsCorrect || (selected && !correct)}
                    onClick={() => answerChallenge(option)}
                    className={`flex min-h-12 w-full items-start gap-3 rounded-xl border p-3 text-left type-meta transition-[border-color,background-color,transform] duration-fast ease-standard focus-visible:focus-ring active:translate-y-px disabled:cursor-default motion-reduce:transition-none ${stateClass}`}
                  >
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-pill border border-current font-semibold">
                      {showAsCorrect ? <Check size={15} /> : String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span className="pt-1">{option}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {selectedAnswer && (
            <div
              role="status"
              data-testid="glossary-answer-feedback"
              className={`mt-4 rounded-xl border p-4 type-meta ${
                answerIsCorrect
                  ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                  : 'border-destructive bg-destructive-subtle text-destructive-subtle-foreground'
              }`}
            >
              <p className="flex items-center gap-2 font-semibold">
                {answerIsCorrect ? <Star size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
                {answerIsCorrect
                  ? newlyCompletedId === entry.id && lastReward
                    ? `Resposta certa. +${lastReward.points} pontos.`
                    : 'Resposta certa. Este desafio já estava no seu placar.'
                  : 'Quase. A resposta certa ficou destacada para você comparar.'}
              </p>
              {lastReward && lastReward.streakBonus > 0 && (
                <p className="mt-1">Você ganhou {lastReward.streakBonus} pontos extras pela sequência.</p>
              )}
              <p className="mt-2"><span className="font-semibold">Ideia-chave: </span>{note.remember}</p>
              {achievementsUnlockedNow.length > 0 && (
                <p className="mt-2 font-semibold">
                  {achievementsUnlockedNow.length === 1 ? 'Conquista liberada: ' : 'Conquistas liberadas: '}
                  {achievementsUnlockedNow.join(', ')}.
                </p>
              )}
              {answerIsCorrect && roundComplete && (
                <p className="mt-3 flex items-center gap-2 border-t border-current/20 pt-3 font-semibold">
                  <Trophy size={17} aria-hidden="true" /> Rodada completa. Cinco desafios vencidos.
                </p>
              )}
            </div>
          )}

          <div className="mt-auto pt-7">
            {answerIsCorrect ? (
              <button
                type="button"
                onClick={continueGame}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-action px-5 type-ui font-semibold text-action-foreground hover:bg-action-hover focus-visible:focus-ring active:translate-y-px"
              >
                {roundComplete ? 'Começar nova rodada' : 'Próximo desafio'} <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : !revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 type-ui font-semibold text-foreground hover:bg-muted focus-visible:focus-ring active:translate-y-px"
              >
                <Lightbulb size={16} aria-hidden="true" /> Quero uma pista
              </button>
            ) : (
              <button
                type="button"
                onClick={() => move(1)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 type-ui font-semibold text-foreground hover:bg-muted focus-visible:focus-ring active:translate-y-px"
              >
                Pular por enquanto
              </button>
            )}
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <button type="button" onClick={() => move(-1)} className="inline-flex items-center gap-1.5 type-meta font-semibold text-primary hover:underline focus-visible:focus-ring">
                <ArrowLeft size={15} aria-hidden="true" /> Anterior
              </button>
              <button type="button" onClick={() => move(1)} className="inline-flex items-center gap-1.5 type-meta font-semibold text-primary hover:underline focus-visible:focus-ring">
                Próximo <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessGuide() {
  const [activeId, setActiveId] = useState(PROCESS_TRACKS[0]!.id);
  const active = PROCESS_TRACKS.find((track) => track.id === activeId) ?? PROCESS_TRACKS[0]!;
  const moveTab = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + PROCESS_TRACKS.length) % PROCESS_TRACKS.length;
    const next = PROCESS_TRACKS[nextIndex]!;
    setActiveId(next.id);
    document.getElementById(`processo-${next.id}-tab`)?.focus();
  };
  return (
    <div className="mt-8">
      <h3 className="type-title text-foreground">Veja como cada processo acontece</h3>
      <p className="mt-1 max-w-3xl type-meta text-muted-foreground">A sequência abaixo é uma orientação geral. O edital ou a chamada pode prever etapas diferentes.</p>
      <div className="mt-4 border-b border-border" role="tablist" aria-label="Tipo de oportunidade">
        <div className="flex gap-5 overflow-x-auto">
          {PROCESS_TRACKS.map((track, index) => (
            <button
              key={track.id}
              type="button"
              role="tab"
              id={`processo-${track.id}-tab`}
              aria-selected={track.id === active.id}
              aria-controls={`processo-${track.id}-painel`}
              tabIndex={track.id === active.id ? 0 : -1}
              onClick={() => setActiveId(track.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveTab(index, 1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveTab(index, -1);
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  const next = event.key === 'Home' ? PROCESS_TRACKS[0]! : PROCESS_TRACKS[PROCESS_TRACKS.length - 1]!;
                  setActiveId(next.id);
                  document.getElementById(`processo-${next.id}-tab`)?.focus();
                }
              }}
              className={`shrink-0 border-b-2 px-1 pb-3 type-ui font-semibold focus-visible:focus-ring ${
                track.id === active.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {track.title}
            </button>
          ))}
        </div>
      </div>
      {PROCESS_TRACKS.map((track) => (
        <div
          key={track.id}
          id={`processo-${track.id}-painel`}
          role="tabpanel"
          aria-labelledby={`processo-${track.id}-tab`}
          hidden={track.id !== active.id}
          className="rounded-b-2xl border border-t-0 border-border bg-card p-5 sm:p-6"
        >
          <p className="max-w-3xl type-body text-foreground/90">{track.summary}</p>
          <ol className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {track.stages.map((stage, index) => (
              <li key={stage.title} className="grid grid-cols-[1.75rem_1fr] gap-3">
                <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-pill bg-primary-subtle type-ui font-semibold text-primary-subtle-foreground">
                  {index + 1}
                </span>
                <div>
                  <h4 className="type-ui font-semibold text-foreground">{stage.title}</h4>
                  <p className="mt-1 type-meta text-foreground/90">{stage.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p role="note" className="mt-6 border-l-4 border-primary bg-muted px-4 py-3 type-meta text-foreground">
            <span className="font-semibold">Preste atenção: </span>
            {track.attention}
          </p>
        </div>
      ))}
    </div>
  );
}

function SourceTerms({ guide }: { guide: SourceGuide }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 type-meta">
      {guide.termIds.map((termId) => {
        const entry = glossaryById.get(termId);
        if (!entry) return null;
        return (
          <li key={termId}>
            <a href={`#${glossaryAnchor(termId)}`} className="font-semibold text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:focus-ring">
              {entry.term}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SourceGuideSection({ scope }: { scope: 'national' | 'international' }) {
  const national = scope === 'national';
  const guides = SOURCE_GUIDES.filter((guide) => guide.scope === scope);
  return (
    <section id={national ? 'fontes-nacionais' : 'fontes-internacionais'} aria-labelledby={`${scope}-titulo`} className="scroll-mt-24">
      <h2 id={`${scope}-titulo`} className="type-section text-foreground">
        {national ? 'Termos das fontes nacionais' : 'Termos das fontes internacionais'}
      </h2>
      <p className="mt-2 max-w-3xl type-body text-muted-foreground">
        {national
          ? 'Cada portal chama pessoas, etapas e recursos de um jeito. Use este mapa para saber o que você está vendo e onde a inscrição acontece.'
          : 'Nas fontes internacionais, o idioma e as siglas mudam. A página original do aviso define elegibilidade, documentos e canal de envio.'}
      </p>
      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
        {guides.map((guide) => (
          <article key={guide.id} className="grid gap-4 border-b border-border-subtle p-5 last:border-0 sm:p-6 md:grid-cols-[minmax(11rem,0.7fr)_minmax(0,1.8fr)] md:gap-8">
            <div>
              <h3 className="type-title text-foreground">{guide.sources}</h3>
              <div className="mt-3">
                <OfficialLinks sources={guide.officialLinks} label={`Fontes oficiais de ${guide.sources}`} />
              </div>
            </div>
            <div>
              <p className="type-body text-foreground/90">{guide.purpose}</p>
              <p className="mt-2 type-meta text-foreground/90">
                <span className="font-semibold text-foreground">Como participar: </span>
                {guide.howToApply}
              </p>
              <p className="mt-3 type-meta text-muted-foreground">
                <span className="font-semibold text-foreground">Palavras que aparecem: </span>
                {guide.vocabulary.join(', ')}.
              </p>
              <SourceTerms guide={guide} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Public learning page for procurement, funding calls and the searchable glossary. */
export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | GlossaryCategory>('all');
  const inputId = useId();
  const categoryId = useId();
  const resultsId = useId();
  const searching = query.trim().length > 0;
  const searched = searchGlossary(query);
  const results = category === 'all' ? searched : searched.filter((entry) => entry.category === category);
  const primaryPath = HELP_PATHS[0]!;
  useMetaDescription(HELP_DESCRIPTION);
  useHashFocus();

  const clearGlossaryFilters = () => {
    setQuery('');
    setCategory('all');
  };

  return (
    <div className="space-y-14 sm:space-y-16">
      <header className="border-b border-border pb-8">
        <div className="flex items-center gap-2 type-eyebrow text-primary">
          <BookOpen size={15} aria-hidden="true" /> Central de ajuda
        </div>
        <h1 className="mt-3 max-w-4xl type-titulo-3 text-foreground">Ajuda para participar de oportunidades públicas</h1>
        <p className="mt-3 max-w-3xl type-body text-muted-foreground">
          Entenda o caminho para vender ao governo, inscrever projetos de fomento e interpretar os termos de cada fonte acompanhada pelo Pardal Digital.
        </p>
        <p role="note" className="mt-5 flex max-w-4xl gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground" data-testid="text-help-disclaimer">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          {GLOSSARY_DISCLAIMER}
        </p>
      </header>

      <section aria-labelledby="objetivo-titulo">
        <h2 id="objetivo-titulo" className="type-section text-foreground">Por onde você quer começar?</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-[1.25fr_1fr]">
          <a href={primaryPath.href} className="group flex min-h-52 flex-col justify-between rounded-2xl bg-inverse p-6 text-inverse-foreground focus-visible:focus-ring sm:p-7">
            <div>
              <h3 className="type-titulo-3">{primaryPath.title}</h3>
              <p className="mt-3 max-w-xl type-body text-inverse-foreground/90">{primaryPath.description}</p>
            </div>
            <span className="mt-8 inline-flex items-center gap-1.5 type-ui font-semibold underline-offset-4 group-hover:underline">
              {primaryPath.linkLabel}
              <span aria-hidden="true">→</span>
            </span>
          </a>
          <div className="grid gap-4">
            {HELP_PATHS.slice(1).map((path) => (
              <a key={path.href} href={path.href} className="group rounded-xl border border-border bg-card p-5 hover:bg-muted focus-visible:focus-ring sm:p-6">
                <h3 className="type-title text-foreground">{path.title}</h3>
                <p className="mt-2 type-meta text-foreground/90">{path.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 type-meta font-semibold text-primary underline-offset-4 group-hover:underline">
                  {path.linkLabel}
                  <span aria-hidden="true">→</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <GlossaryScope>
        <section id="como-vender" aria-labelledby="como-vender-titulo" className="scroll-mt-24" data-testid="section-first-steps">
          <h2 id="como-vender-titulo" className="type-section text-foreground">Como vender ao governo</h2>
          <p className="mt-2 max-w-3xl type-body text-muted-foreground">
            A preparação é quase a mesma em qualquer portal. Organize a empresa primeiro e depois siga as regras da oportunidade escolhida.
          </p>
          <h3 className="mt-7 type-title text-foreground">Prepare sua base</h3>
          <ol className="mt-4 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
            {FIRST_STEPS.map((step, index) => (
              <li
                key={step.title}
                className={`flex gap-3 border-b border-border-subtle p-4 last:border-0 sm:p-5 ${index % 2 === 0 ? 'sm:border-r' : ''} ${index >= FIRST_STEPS.length - 2 ? 'sm:border-b-0' : ''}`}
              >
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-primary-subtle type-ui font-semibold text-primary-subtle-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="type-ui font-semibold text-foreground">{step.title}</h4>
                  <p className="mt-1 type-meta text-foreground/90">
                    <GlossaryText>{step.text}</GlossaryText>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 type-meta text-muted-foreground">Selecione os termos sublinhados para ver uma explicação rápida.</p>
          <ProcessGuide />
        </section>
      </GlossaryScope>

      <SourceGuideSection scope="national" />
      <SourceGuideSection scope="international" />

      <section aria-labelledby="duvidas-titulo">
        <h2 id="duvidas-titulo" className="type-section text-foreground">Dúvidas comuns</h2>
        <div className="mt-4 max-w-4xl rounded-xl border border-border bg-card px-4 sm:px-6">
          {HELP_FAQ.map((item) => (
            <details key={item.question} className="group border-b border-border-subtle py-1 last:border-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-1 py-4 type-ui font-semibold text-foreground hover:text-primary focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden="true" className="shrink-0 text-muted-foreground group-open:hidden">+</span>
                <span aria-hidden="true" className="hidden shrink-0 text-muted-foreground group-open:inline">▴</span>
              </summary>
              <p className="max-w-3xl px-1 pb-5 type-body text-foreground/90">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="glossario" aria-labelledby="glossario-titulo" className="scroll-mt-24" data-testid="section-glossary">
        <h2 id="glossario-titulo" className="type-section text-foreground">Glossário para aprender, não decorar</h2>
        <p className="mt-2 max-w-3xl type-body text-muted-foreground">
          Escolha um assunto e estude no seu ritmo. Cada cartão explica uma palavra com uma situação concreta e uma ideia fácil de lembrar.
        </p>
        <GlossaryLearningStudio />

        <div className="mt-10 border-t border-border pt-8">
          <h3 className="type-title text-foreground">Consulte todos os termos</h3>
          <p className="mt-2 max-w-3xl type-body text-muted-foreground">
            Encontrou uma palavra no edital? Pesquise aqui. Cada termo começa com a resposta curta e abre para mostrar exemplo, explicação completa e próximo passo.
          </p>
        </div>
        <form role="search" onSubmit={(event) => event.preventDefault()} className="mt-5 grid max-w-4xl gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
          <div>
            <label htmlFor={inputId} className="mb-1.5 block type-meta font-semibold text-foreground">Buscar termo</label>
            <div className="relative">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={inputId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex.: SICAF, captação, EOI ou recurso"
                aria-controls={resultsId}
                className="h-10 pl-9"
                data-testid="input-glossary-search"
              />
            </div>
          </div>
          <div>
            <label htmlFor={categoryId} className="mb-1.5 block type-meta font-semibold text-foreground">Filtrar por assunto</label>
            <select
              id={categoryId}
              value={category}
              onChange={(event) => setCategory(event.target.value as 'all' | GlossaryCategory)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 type-ui text-foreground focus-visible:focus-ring"
              data-testid="select-glossary-category"
            >
              <option value="all">Todos os assuntos</option>
              {CATEGORY_ORDER.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
            </select>
          </div>
        </form>
        <p aria-live="polite" className="mt-3 type-meta text-muted-foreground" data-testid="text-glossary-count">
          {results.length === 0
            ? `Nenhum termo encontrado${query.trim() ? ` para “${query.trim()}”` : ' neste assunto'}.`
            : `${results.length} ${results.length === 1 ? 'termo encontrado' : 'termos encontrados'}.`}
        </p>

        <div id={resultsId} className="mt-2 max-w-4xl">
          {searching || category !== 'all' ? (
            results.map((entry) => <EntryArticle key={entry.id} entry={entry} headingLevel="h3" expanded={searching} />)
          ) : (
            CATEGORY_ORDER.map((item) => {
              const entries = GLOSSARY.filter((entry) => entry.category === item);
              if (entries.length === 0) return null;
              return (
                <section key={item} aria-labelledby={`categoria-${item}`} className="mt-7 first:mt-4">
                  <h3 id={`categoria-${item}`} className="type-eyebrow text-muted-foreground">{CATEGORY_LABELS[item]}</h3>
                  <div className="mt-1">
                    {entries.map((entry) => <EntryArticle key={entry.id} entry={entry} headingLevel="h4" expanded={false} />)}
                  </div>
                </section>
              );
            })
          )}
        </div>
        {results.length === 0 && (
          <button type="button" onClick={clearGlossaryFilters} className="mt-3 type-meta font-semibold text-primary hover:underline focus-visible:focus-ring">
            Limpar busca e filtro
          </button>
        )}
      </section>
    </div>
  );
}
