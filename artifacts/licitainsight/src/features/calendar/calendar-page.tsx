import { Link } from 'wouter';
import { SquareKanban } from 'lucide-react';
import { buttonClass } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { SavedCalendarView } from '@/features/saved-tenders/components/saved-pipeline-views';
import { MURAL_HREF } from '@/features/saved-tenders/lib/view';

/** Every deadline of the saved tenders in one place: proposal, start of proposals and the user's own next action. */
export default function CalendarPage() {
  return (
    <>
      <PageTitle
        title="Calendário de prazos"
        description="Os prazos de todos os editais que você salvou, em horário de Brasília. Prazo pessoal é o que você marcou como próxima ação; os outros vêm do edital."
        action={
          <Link href={MURAL_HREF} className={`${buttonClass('outline')} self-start sm:self-auto`} data-testid="link-calendar-mural">
            <SquareKanban size={15} strokeWidth={1.75} aria-hidden="true" />
            Abrir o mural
          </Link>
        }
      />
      <SavedCalendarView />
    </>
  );
}
