import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealDirection = "up" | "left" | "right";
type RevealVariant = "default" | "soft" | "card";

interface LandingScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: RevealDirection;
  variant?: RevealVariant;
  threshold?: number;
}

export default function LandingScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  variant = "default",
  threshold = 0.2,
}: LandingScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const style = {
    "--landing-reveal-delay": `${delay}ms`,
  } as CSSProperties & { "--landing-reveal-delay": string };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window === "undefined") {
      setVisible(true);
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      {
        threshold,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={[
        "landing-reveal min-w-0",
        `landing-reveal--${direction}`,
        `landing-reveal--${variant}`,
        visible ? "landing-reveal--visible" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}
