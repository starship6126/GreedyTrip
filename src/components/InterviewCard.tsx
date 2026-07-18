import { ArrowRight, Footprints, Gem, MoonStar, Waves } from "lucide-react";

export const INTERVIEW_QUESTIONS = [
  {
    eyebrow: "Atmosphere",
    question: "Do you want calm, quiet places or lively, social places today?",
    icon: Waves,
    answers: [
      { label: "Quiet & calm", value: "Quiet and calm" },
      { label: "Lively & social", value: "Lively and social" },
      { label: "Balanced", value: "A balanced atmosphere" },
    ],
  },
  {
    eyebrow: "Walking range",
    question: "How long are you willing to walk for something great?",
    icon: Footprints,
    answers: [
      { label: "5 minutes", value: "Five minutes" },
      { label: "10 minutes", value: "Ten minutes" },
      { label: "20 minutes", value: "Twenty minutes" },
    ],
  },
  {
    eyebrow: "Interests · pick two",
    question: "What sounds good right now?",
    icon: Gem,
    answers: [
      { label: "Art + hidden gems", value: "Art and hidden gems" },
      { label: "Food + hidden gems", value: "Food and hidden gems" },
      { label: "Art + technology", value: "Art and technology" },
      { label: "Food + technology", value: "Food and technology" },
    ],
  },
  {
    eyebrow: "Priority",
    question: "What matters most right now?",
    icon: MoonStar,
    answers: [
      { label: "Low cost", value: "Low cost" },
      { label: "Uniqueness", value: "Uniqueness" },
      { label: "Comfort after dark", value: "Comfort after dark" },
    ],
  },
] as const;

export function InterviewCard({ step, busy, onAnswer }: { step: number; busy: boolean; onAnswer: (value: string) => void }) {
  const item = INTERVIEW_QUESTIONS[Math.min(step, INTERVIEW_QUESTIONS.length - 1)];
  const Icon = item.icon;
  return (
    <section className="primary-card interview-card">
      <div className="card-topline">
        <span className="step-pill">0{step + 1} / 04</span>
        <span className="eyebrow"><Icon size={15} /> {item.eyebrow}</span>
      </div>
      <h2>{item.question}</h2>
      <div className="answer-grid">
        {item.answers.map((answer) => (
          <button key={answer.value} type="button" className="answer-chip" disabled={busy} onClick={() => onAnswer(answer.value)}>
            {answer.label}<ArrowRight size={16} />
          </button>
        ))}
      </div>
      <p className="card-note">Say it, tap an answer, or type below.</p>
    </section>
  );
}
