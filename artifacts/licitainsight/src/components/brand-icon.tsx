/**
 * Pardal logo from public/brand. The SVGs have fixed ink, so both files render and the theme picks one:
 * petroleo on Creme, lima on Petróleo. Size it by height (`h-*`); width follows the artwork. `symbol` drops the name.
 */
export function BrandLogo({ className = '', symbol = false }: { className?: string; symbol?: boolean }) {
  const file = `${import.meta.env.BASE_URL}brand/pardal-${symbol ? 'simbolo' : 'logo'}`;
  return (
    <span role="img" aria-label="Pardal Digital" className={`inline-flex shrink-0 ${className}`}>
      <img src={`${file}-petroleo.svg`} alt="" draggable={false} className="h-full w-auto dark:hidden" />
      <img src={`${file}-lima.svg`} alt="" draggable={false} className="hidden h-full w-auto dark:block" />
    </span>
  );
}
