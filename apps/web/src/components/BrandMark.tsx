interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
        <path
          d="M12 1.5 14.4 9.6 22.5 12l-8.1 2.4L12 22.5l-2.4-8.1L1.5 12l8.1-2.4L12 1.5Z"
          fill="currentColor"
        />
        <circle cx="12" cy="12" fill="currentColor" r="4.25" />
      </svg>
      {compact ? null : <span>Invitica</span>}
    </span>
  );
}
