export function BrandName({ className = '', accentClassName = 'text-primary' }: { className?: string; accentClassName?: string }) {
  return (
    <span className={`font-semibold tracking-heading ${className}`}>
      Pardal <span className={accentClassName}>Digital</span>
    </span>
  );
}
