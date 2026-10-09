import { Fragment } from 'react';

/**
 * Renders API highlight fragments. Contract guarantees only `<mark>` tags; we still parse
 * instead of using dangerouslySetInnerHTML so a misbehaving backend can't inject markup.
 */
export function HighlightedText({ fragment, fallback }: { fragment?: string; fallback: string }) {
  if (!fragment) return <>{fallback}</>;
  const parts = fragment.split(/(<mark>.*?<\/mark>)/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^<mark>(.*)<\/mark>$/.exec(part);
        return match ? (
          <mark key={index} className="rounded-lg bg-primary/15 px-0.5 text-inherit">
            {decode(match[1])}
          </mark>
        ) : (
          <Fragment key={index}>{decode(part)}</Fragment>
        );
      })}
    </>
  );
}

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text: string) => text.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (entity) => entities[entity]);
