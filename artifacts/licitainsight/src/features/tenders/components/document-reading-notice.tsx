import { ExternalLink } from 'lucide-react';
import type { DocumentReadingSummary } from '@/api';

const reasonLabel = (reason: string, count: number) => {
  if (reason === 'scanned_pdf') return count === 1 ? 'é imagem digitalizada' : 'são imagens digitalizadas';
  if (reason === 'image') return count === 1 ? 'é uma imagem' : 'são imagens';
  if (reason === 'size_limit') return count === 1 ? 'excede o limite de tamanho' : 'excedem o limite de tamanho';
  if (reason === 'download_error') return count === 1 ? 'não pôde ser baixado' : 'não puderam ser baixados';
  return count === 1 ? 'está em formato não compatível' : 'estão em formato não compatível';
};

export function documentReadingMessage(reading: DocumentReadingSummary): string {
  const prefix = reading.total === 0
    ? 'Nenhum documento foi localizado'
    : reading.read === 0
      ? reading.total === 1 ? 'O documento não foi lido' : `Nenhum dos ${reading.total} documentos foi lido`
      : `${reading.read} de ${reading.total} documentos lidos`;
  const groups = new Map<string, number>();
  for (const document of reading.unread) groups.set(document.reason, (groups.get(document.reason) ?? 0) + 1);
  const reasons = [...groups.entries()].map(([reason, count]) => `${count} ${reasonLabel(reason, count)}`);
  return reasons.length > 0 ? `${prefix}; ${reasons.join('; ')}` : prefix;
}

export function DocumentReadingNotice({ reading }: { reading: DocumentReadingSummary }) {
  return (
    <span>
      {documentReadingMessage(reading)}.
      {reading.unread.length > 0 && (
        <span className="ml-1 inline-flex flex-wrap gap-x-2">
          {reading.unread.map((document) => (
            <a key={document.id} href={document.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring">
              {document.title}
              <ExternalLink size={12} aria-hidden="true" />
              <span className="sr-only">(documento original, abre em nova aba)</span>
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
