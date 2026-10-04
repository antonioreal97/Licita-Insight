/** The supplied PNG has generous transparent margins; enlarge it within a neutral tile for legibility at small sizes. */
export function BrandIcon({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-black/5 ${className}`}>
      <img src="/abriu-la-logo.png" alt="" width={36} height={36} className="h-full w-full max-w-none scale-[1.5]" />
    </span>
  );
}
