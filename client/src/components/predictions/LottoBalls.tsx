import { cn } from "@/lib/utils";

interface LottoBallProps {
  number: number;
  variant?: "main" | "special";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-lg font-extrabold",
};

export function LottoBall({ number, variant = "main", size = "md", className }: LottoBallProps) {
  return (
    <span
      className={cn(
        "lotto-ball font-tabular-nums",
        variant === "special" ? "lotto-ball-special" : "lotto-ball-main",
        sizeClasses[size],
        className,
      )}
    >
      {number}
    </span>
  );
}

export function LottoBallRow({
  mainNumbers,
  specialNumbers = [],
  size = "md",
}: {
  mainNumbers: number[];
  specialNumbers?: number[];
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {mainNumbers.map((n, i) => (
        <LottoBall key={i} number={n} variant="main" size={size} />
      ))}
      {specialNumbers.map((n, i) => (
        <LottoBall key={`s-${i}`} number={n} variant="special" size={size} />
      ))}
    </div>
  );
}
