import React, { type ReactNode } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

export const LEGAL_DRAFT_NOTICE = 'Versão preliminar — sujeita a revisão jurídica';
export const LEGAL_UPDATED_AT = '11 de outubro de 2026';

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Documentos legais" className={cn('flex flex-wrap gap-x-4 gap-y-2', className)}>
      <Link href="/privacidade" data-testid="link-privacy" className="font-semibold text-primary underline-offset-4 hover:underline">
        Política de Privacidade
      </Link>
      <Link href="/termos" data-testid="link-terms" className="font-semibold text-primary underline-offset-4 hover:underline">
        Termos de Uso
      </Link>
    </nav>
  );
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <Link href="/" aria-label="Pardal Digital — início">
            <span className="text-base font-semibold">Pardal Digital</span>
          </Link>
          <LegalLinks className="justify-end type-meta" />
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="inline-flex rounded-pill border border-warning/40 bg-warning-subtle px-3 py-1 type-meta font-semibold text-warning-subtle-foreground">
          {LEGAL_DRAFT_NOTICE}
        </p>
        <h1 className="mt-5 type-titulo-2 sm:type-titulo-1">{title}</h1>
        <p className="mt-2 type-meta text-muted-foreground">Atualizada em {LEGAL_UPDATED_AT}.</p>
        <article className="prose prose-slate mt-10 max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-primary">
          {children}
        </article>
      </main>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política explica, em linguagem direta, como o Pardal Digital trata dados pessoais ao oferecer pesquisa, acompanhamento e análise de editais
        públicos. Ela deve ser validada e completada pelo responsável pelo produto antes de ser considerada definitiva.
      </p>

      <h2>1. Quem controla os dados</h2>
      <p>
        O controlador é o <strong>Pardal Digital — [RAZÃO SOCIAL/CNPJ]</strong>. O encarregado ou responsável pelo canal de privacidade é{' '}
        <strong>[ENCARREGADO]</strong>. Para dúvidas ou para exercer direitos, escreva para{' '}
        <a href="mailto:contato@pardaldigital.com">contato@pardaldigital.com</a>.
      </p>

      <h2>2. Dados, finalidades e bases legais</h2>
      <ul>
        <li>
          <strong>Conta e autenticação:</strong> nome, e-mail, foto, identificador Google e dados técnicos de sessão, para criar e proteger a conta e prestar o
          serviço. Bases: execução de contrato e segurança/legítimo interesse.
        </li>
        <li>
          <strong>Preferências e uso do produto:</strong> editais e buscas salvos, monitoramento, checklists, prazos, notificações, preferências de e-mail,
          filtros e perfil da empresa, para entregar as funções solicitadas. Base: execução de contrato.
        </li>
        <li>
          <strong>Recursos de IA:</strong> perguntas ao edital, trechos usados na resposta, resumos, metadados de tarefas, modelos, consumo e perfil empresarial
          enviado para cálculo de aderência. Base: execução de contrato. Não inclua nomes, CPF, contatos ou outros dados pessoais nas perguntas.
        </li>
        <li>
          <strong>Recomendações personalizadas:</strong> pesquisas, visualizações, interesses e descartes, somente quando você ativa essa opção. Base:
          consentimento, que pode ser revogado a qualquer momento.
        </li>
        <li>
          <strong>Assinatura:</strong> estado da assinatura e identificadores do cliente, checkout e cobrança no Asaas. Base: execução de contrato e
          cumprimento de obrigações legais. O Pardal Digital não armazena dados de cartão, CVV, CPF ou endereço de cobrança.
        </li>
        <li>
          <strong>Prevenção a fraude e operação:</strong> identificador pseudonimizado do teste gratuito, limites de uso e registros de acesso e segurança.
          Bases: legítimo interesse, prevenção a fraude e, quando aplicável, obrigação legal.
        </li>
      </ul>
      <p>
        <strong>Dados de fontes públicas:</strong> as chamadas de cultura e fomento vêm de fontes oficiais abertas (Mapas Culturais, Transferegov.br, portais
        gov.br, CNPq, CAPES e FINEP). Guardamos o nome do órgão ou da organização que publicou a chamada. Quando quem publicou é uma pessoa física, não
        armazenamos nome, CPF, e-mail, telefone nem endereço: mostramos um rótulo neutro e o link da fonte. Título e resumo são os publicados na fonte. Se
        você encontrar um dado pessoal seu em um registro, escreva para <a href="mailto:contato@pardaldigital.com">contato@pardaldigital.com</a> e nós o
        removemos.
      </p>

      <h2>3. Operadores e transferência internacional</h2>
      <p>Usamos fornecedores somente para as finalidades abaixo. Alguns processam dados fora do Brasil:</p>
      <ul>
        <li><strong>Google LLC (Estados Unidos):</strong> login com Google e Google Analytics 4, este último apenas com consentimento para cookies opcionais.</li>
        <li><strong>OpenAI LLC (Estados Unidos):</strong> gera resumos de perguntas; as requisições usam a opção de não armazenamento quando suportada.</li>
        <li><strong>TypeSafe AI / Jev (localização a confirmar):</strong> seleciona trechos oficiais e calcula aderência a partir do perfil empresarial.</li>
        <li><strong>Vercel Inc. e Cloudflare Inc. (Estados Unidos):</strong> hospedagem, entrega e proteção da aplicação.</li>
        <li><strong>Oracle (infraestrutura em nuvem, inclusive fora do Brasil):</strong> servidor de borda e tráfego protegido.</li>
        <li><strong>Brevo / Sendinblue SAS (França, União Europeia):</strong> envio de e-mails transacionais e alertas.</li>
        <li><strong>Asaas Gestão Financeira S.A. (Brasil):</strong> checkout, cobrança e gestão da assinatura.</li>
      </ul>
      <p>
        Para transferências internacionais, o Pardal Digital deve adotar contratos, cláusulas e salvaguardas compatíveis com a LGPD e revisar periodicamente
        os termos desses operadores.
      </p>

      <h2>4. Retenção e exclusão</h2>
      <ul>
        <li>Dados da conta e das funções contratadas: enquanto a conta estiver ativa ou até a exclusão solicitada.</li>
        <li>Sessões expiradas ou revogadas: excluídas depois de 30 dias.</li>
        <li>Notificações lidas e conteúdo de e-mails: 180 dias; depois disso, o conteúdo é apagado e ficam apenas metadados mínimos de envio.</li>
        <li>Eventos de recomendação: até 180 dias ou imediatamente quando o consentimento é revogado.</li>
        <li>Perguntas à IA e documentos processados: em regra, 90 dias conforme o ciclo do edital.</li>
        <li>Registros de acesso sujeitos ao Marco Civil da Internet: no máximo 6 meses, salvo ordem legal.</li>
        <li>Registros financeiros: mantidos pelo Asaas pelo prazo exigido por normas fiscais, contábeis e financeiras.</li>
        <li>Marca pseudonimizada do teste gratuito: pode ser mantida para prevenção a fraude, sem guardar o identificador Google em texto claro.</li>
      </ul>

      <h2>5. Seus direitos</h2>
      <p>
        Você pode pedir confirmação e acesso, correção, informações sobre compartilhamento, portabilidade, anonimização, bloqueio ou eliminação,
        revogação do consentimento e revisão de decisões automatizadas, nos limites da LGPD. Em <strong>Configurações → Seus dados</strong>, você pode
        baixar uma cópia em JSON e excluir a conta. Também pode escrever para{' '}
        <a href="mailto:contato@pardaldigital.com">contato@pardaldigital.com</a>. Nome, e-mail e foto devem ser corrigidos primeiro na Conta Google.
      </p>

      <h2>6. Cookies e armazenamento local</h2>
      <p>
        O cookie HttpOnly <code>licita_session</code> é estritamente necessário para manter a sessão e não depende de consentimento. Tema, estado da barra
        lateral, buscas recentes e relógio de inatividade usam armazenamento local somente se você concordar. O Google Analytics 4 também é opcional e só
        mede audiência após consentimento; a recusa não impede o uso das funções essenciais.
      </p>

      <h2>7. Segurança e incidentes</h2>
      <p>
        Aplicamos sessões curtas, token armazenado apenas como hash, cookie seguro, proteção contra CSRF, controle de acesso, limites de requisição,
        conexões criptografadas, minimização de logs e rotinas de expurgo. Nenhum sistema é infalível. Incidentes relevantes serão avaliados, contidos,
        registrados e comunicados à ANPD e aos titulares nos prazos legais aplicáveis.
      </p>

      <h2>8. Alterações desta política</h2>
      <p>Atualizações materiais serão publicadas nesta página com nova data. Se a mudança exigir novo consentimento, pediremos uma nova escolha.</p>
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage title="Termos de Uso">
      <p>
        Estes termos regulam o uso do Pardal Digital, serviço de pesquisa e acompanhamento de editais públicos oferecido por{' '}
        <strong>[RAZÃO SOCIAL/CNPJ]</strong>. Dúvidas podem ser enviadas a <a href="mailto:contato@pardaldigital.com">contato@pardaldigital.com</a>.
      </p>

      <h2>1. Aceitação e conta</h2>
      <p>
        Ao entrar com Google e usar o serviço, você declara ter capacidade para aceitar estes termos e se compromete a manter sua conta protegida. A conta é
        pessoal; atividades realizadas na sessão autenticada são de responsabilidade do titular, salvo falha comprovada do serviço.
      </p>

      <h2>2. O que o serviço oferece</h2>
      <p>
        O Pardal Digital organiza dados e documentos de fontes públicas, permite buscas, salvamentos, monitoramento, alertas, chamadas culturais e recursos de
        inteligência artificial. Funcionalidades, limites e preços podem evoluir, com comunicação prévia quando a mudança afetar materialmente uma assinatura.
      </p>

      <h2>3. Fontes oficiais e inteligência artificial</h2>
      <p>
        Resumos, classificações, recomendações e respostas de IA são apoio à leitura e podem conter erros ou ficar desatualizados. Eles não substituem o
        edital, anexos, portais oficiais nem aconselhamento jurídico, contábil ou técnico. Antes de participar de uma contratação, confira a fonte oficial.
        Não envie dados pessoais, segredos comerciais ou informações confidenciais nos campos de IA.
      </p>

      <h2>4. Uso permitido</h2>
      <p>
        Você não deve tentar invadir, sobrecarregar, contornar limites, copiar dados em massa, compartilhar acesso, interferir no serviço ou usá-lo para ato
        ilegal. Podemos limitar ou suspender uso abusivo, preservando os direitos de acesso, exportação e exclusão de dados previstos em lei.
      </p>

      <h2>5. Assinatura, pagamento e cancelamento</h2>
      <p>
        Quando houver plano pago, preço e ciclo são mostrados antes do checkout, processado pelo Asaas. O cancelamento pode ser feito em Configurações e não
        elimina automaticamente a conta. Direitos de arrependimento, reembolso e cobrança seguem a legislação aplicável e as condições exibidas na compra.
      </p>

      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Buscamos manter o serviço seguro e disponível, mas fontes governamentais, integrações e modelos de IA podem falhar. Na extensão permitida por lei, o
        Pardal Digital não garante resultado em licitações e não responde por decisões tomadas sem conferência dos documentos oficiais.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        Dados e documentos oficiais permanecem sujeitos ao regime da fonte. Marca, interface, código, organização e conteúdos próprios do Pardal Digital não
        podem ser reproduzidos ou explorados fora das permissões legais ou de autorização expressa.
      </p>

      <h2>8. Privacidade, encerramento e mudanças</h2>
      <p>
        O tratamento de dados segue a <Link href="/privacidade">Política de Privacidade</Link>. Você pode exportar dados, cancelar a assinatura ou excluir a
        conta nas Configurações. Podemos atualizar estes termos; mudanças materiais terão nova data e aviso adequado. A lei brasileira rege estes termos, sem
        afastar direitos obrigatórios do consumidor e do titular de dados.
      </p>
    </LegalPage>
  );
}
