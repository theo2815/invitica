import { INVITICA_GLYPH_PATHS, INVITICA_GLYPH_VIEW_BOX } from "@invitica/renderer";
import Image from "next/image";

import styles from "./BrandMark.module.css";

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span aria-label="Invitica" className={styles.root} role="img">
      {compact ? (
        <svg aria-hidden="true" className={styles.mark} viewBox={INVITICA_GLYPH_VIEW_BOX}>
          {INVITICA_GLYPH_PATHS.map((path) => (
            <path d={path} fill="currentColor" key={path} />
          ))}
        </svg>
      ) : (
        <Image
          alt=""
          aria-hidden="true"
          className={styles.wordmark}
          height="481"
          loading="eager"
          sizes="120px"
          src="/brand/invitica-wordmark-v2.png"
          width="1877"
        />
      )}
    </span>
  );
}
