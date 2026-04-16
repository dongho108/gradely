"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Lock, Sparkles, Heart } from "lucide-react";
import type { GradingStrictness } from "@/types/grading";

interface StrictnessOption {
  value: GradingStrictness;
  label: string;
  icon: React.ReactNode;
  tooltip: string;
}

const OPTIONS: StrictnessOption[] = [
  {
    value: "strict",
    label: "엄격",
    icon: <Lock className="h-3.5 w-3.5" />,
    tooltip:
      "정답과 정확히 같아야 정답으로 인정합니다. 동의어, 유사어, 오타를 인정하지 않습니다. (AI 채점 없이 텍스트 비교)",
  },
  {
    value: "standard",
    label: "보통",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    tooltip:
      "의미가 같으면 정답으로 인정합니다. 동의어, 명백한 오타를 허용합니다. (AI 채점)",
  },
  {
    value: "lenient",
    label: "관대",
    icon: <Heart className="h-3.5 w-3.5" />,
    tooltip:
      "핵심 의미가 포함되면 넓게 정답으로 인정합니다. 유사 표현, 부분 답안도 허용합니다. (AI 채점)",
  },
];

interface GradingStrictnessSelectorProps {
  value: GradingStrictness;
  onChange: (value: GradingStrictness) => void;
  size?: "sm" | "md";
  className?: string;
}

export function GradingStrictnessSelector({
  value,
  onChange,
  size = "md",
  className,
}: GradingStrictnessSelectorProps) {
  const [hoveredOption, setHoveredOption] = useState<GradingStrictness | null>(null);

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "inline-flex bg-gray-100 rounded-lg p-1 gap-0.5",
          size === "sm" && "p-0.5"
        )}
      >
        {OPTIONS.map((option) => {
          const isActive = value === option.value;
          const isHovered = hoveredOption === option.value;
          return (
            <div key={option.value} className="relative">
              <button
                onClick={() => onChange(option.value)}
                onMouseEnter={() => setHoveredOption(option.value)}
                onMouseLeave={() => setHoveredOption(null)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-md font-medium transition-all cursor-pointer",
                  size === "md" && "px-3 py-1.5 text-sm",
                  size === "sm" && "px-2.5 py-1 text-xs",
                  isActive
                    ? "bg-white text-primary shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>

              {/* Tooltip */}
              {isHovered && (
                <div
                  className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-64 px-3 py-2.5 rounded-lg bg-gray-800 text-white text-xs leading-relaxed shadow-lg pointer-events-none"
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45" />
                  {option.tooltip}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
