import type { ReactNode } from "react";

interface LandingContainerProps {
  children: ReactNode;
  className?: string;
}

export default function LandingContainer({
  children,
  className = "",
}: LandingContainerProps) {
  return (
    <div
      className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
