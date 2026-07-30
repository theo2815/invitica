import Image from "next/image";

import { templateStillSource } from "./template-stills";

interface TemplateStillProps {
  alt: string;
  className?: string;
  preload?: boolean;
  sizes: string;
  templateId: string;
}

export function TemplateStill({
  alt,
  className,
  preload = false,
  sizes,
  templateId,
}: TemplateStillProps) {
  const src = templateStillSource(templateId);

  if (!src) return null;

  return (
    <Image
      alt={alt}
      className={className}
      height={1280}
      {...(preload ? { preload: true } : { loading: "lazy" as const })}
      sizes={sizes}
      src={src}
      width={720}
    />
  );
}
