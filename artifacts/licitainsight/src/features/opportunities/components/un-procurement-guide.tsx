import React from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';

/**
 * UN procurement is published on UNGM, whose terms (§5.2–5.3) forbid reproducing its notices on another site or
 * system without written permission. So the hub only explains how to take part and links out; no notice is collected.
 */
export const UNGM_LINKS = {
  notices: 'https://www.ungm.org/Public/Notice',
  registration: 'https://www.ungm.org/Account/Registration',
  knowledge: 'https://www.ungm.org/Public/KnowledgeCentre',
} as const;

const linkClass = 'inline-flex w-fit items-center gap-1 type-meta font-semibold text-primary hover:underline';

function OutLink({ href, testId, children }: { href: string; testId: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" data-testid={testId} className={linkClass}>
      {children} <ExternalLink size={13} aria-hidden />
    </a>
  );
}

export function UnProcurementGuide({ className = '' }: { className?: string }) {
  return (
    <details data-testid="guide-un-procurement" className={`group rounded-lg border border-border bg-card ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 type-ui font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        Licitações da ONU: como participar
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 type-body text-foreground">
        <p>
          As agências da ONU, como PNUD, UNICEF, UNOPS, OPAS, FAO e ACNUR, publicam suas licitações no UNGM, o portal de
          compras do sistema ONU. Os termos do UNGM não permitem reproduzir esses avisos em outros sites, então eles não
          aparecem nesta busca: consulte direto na fonte.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>Cadastre a empresa no UNGM. O cadastro é gratuito e leva de 5 a 10 minutos.</li>
          <li>Informe as categorias do que você vende (códigos UNSPSC) e os países onde atua.</li>
          <li>
            Busque os avisos abertos por agência, país e categoria. Para receber os novos por e-mail, o UNGM oferece a
            assinatura UNGM Pro.
          </li>
          <li>Em cada aviso, confira se a agência aceita fornecedores do Brasil, o idioma e o fuso horário do prazo.</li>
        </ol>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <OutLink href={UNGM_LINKS.notices} testId="link-ungm-notices">Ver avisos abertos no UNGM</OutLink>
          <OutLink href={UNGM_LINKS.registration} testId="link-ungm-registration">Cadastrar a empresa</OutLink>
          <OutLink href={UNGM_LINKS.knowledge} testId="link-ungm-knowledge">Guias do UNGM</OutLink>
        </div>
      </div>
    </details>
  );
}
