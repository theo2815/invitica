import styles from "./BrandMark.module.css";

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span aria-label="Invitica" className={styles.root} role="img">
      <svg aria-hidden="true" className={styles.mark} viewBox="0 0 24 32">
        <path
          d="M3 2h10v8h5c-3.33 1.03-5 3.1-5 6.2v7.63c0 2.25 1.33 3.48 4 3.69V30H3v-2.48c2.67-.21 4-1.44 4-3.69V8.17c0-2.25-1.33-3.48-4-3.69V2Z"
          fill="currentColor"
        />
        <path d="m15 2 6 6h-6V2Z" fill="currentColor" />
      </svg>
      {compact ? null : (
        <span aria-hidden="true" className={styles.wordmark}>
          Invitica
        </span>
      )}
    </span>
  );
}
