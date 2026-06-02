import type { ElementType, ReactNode } from "react";

type Size = "hero" | "section" | "card";

interface LandingHeadingProps {
  children: ReactNode;
  as?: ElementType;
  size?: Size;
  className?: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  hero: "text-[2.7rem] font-semibold leading-[0.94] tracking-[-0.05em] sm:text-5xl lg:text-[4.5rem] lg:leading-[0.92]",
  section: "text-[2rem] font-semibold leading-[1] tracking-[-0.04em] sm:text-4xl",
  card: "text-xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-2xl",
};

export default function LandingHeading({
  children,
  as: Tag = "h2",
  size = "section",
  className = "",
}: LandingHeadingProps) {
  return <Tag className={`${SIZE_CLASSES[size]} ${className}`.trim()}>{children}</Tag>;
}
