import { ArrowRight } from "lucide-react";

export type GreedyLoopStep = "observe" | "remember" | "rank" | "commit" | "learn" | "recompute" | "idle";

const steps = ["observe", "remember", "rank", "commit", "learn", "recompute"] as const;

export function GreedyLoop({ active }: { active: GreedyLoopStep }) {
  return (
    <div className="greedy-loop" aria-label={`Greedy decision loop; ${active} is active`}>
      {steps.map((step, index) => (
        <div key={step} className={active === step ? "is-active" : ""}>
          <span>{step}</span>
          {index < steps.length - 1 && <ArrowRight size={11} />}
        </div>
      ))}
    </div>
  );
}
