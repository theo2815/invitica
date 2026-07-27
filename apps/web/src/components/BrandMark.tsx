import { INVITICA_GLYPH_PATHS, INVITICA_GLYPH_VIEW_BOX } from "@invitica/renderer";

import styles from "./BrandMark.module.css";

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span aria-label="Invitica" className={styles.root} role="img">
      <svg aria-hidden="true" className={styles.mark} viewBox={INVITICA_GLYPH_VIEW_BOX}>
        {INVITICA_GLYPH_PATHS.map((path) => (
          <path d={path} fill="currentColor" key={path} />
        ))}
      </svg>
      {compact ? null : (
        <span aria-hidden="true" className={styles.wordmark}>
          Invitica
        </span>
      )}
    </span>
  );
}
