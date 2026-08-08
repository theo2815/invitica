"use client";

import { INVITICA_GLYPH_PATHS, INVITICA_GLYPH_VIEW_BOX } from "@invitica/renderer";
import Image from "next/image";

import styles from "./BrandMark.module.css";
import { useTheme } from "./ThemeContext";

interface BrandMarkProps {
  compact?: boolean;
}

/**
 * The full lockup is a raster, so it cannot follow the theme the way everything around it does —
 * its near-black `nvitica` stayed near-black on a near-black page. There are two files, generated
 * from one master by `pnpm --filter @invitica/web brand:wordmark`, and the theme picks between
 * them here rather than in CSS: rendering both and hiding one would download a wordmark nobody
 * sees, and the theme is already known on the server, so the first paint carries the right file.
 *
 * The compact variant needs none of that. It is the repository-owned glyph in `currentColor`.
 */
export function BrandMark({ compact = false }: BrandMarkProps) {
  const theme = useTheme();

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
          src={
            theme === "dark"
              ? "/brand/invitica-wordmark-v2-dark.png"
              : "/brand/invitica-wordmark-v2.png"
          }
          width="1877"
        />
      )}
    </span>
  );
}
