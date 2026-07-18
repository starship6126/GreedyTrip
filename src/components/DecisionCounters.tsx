export function DecisionCounters({ frontier, selected }: { frontier: number; selected: number }) {
  return (
    <div className="decision-counters" aria-label="One-move decision summary">
      <div><span>Frontier</span><strong>{frontier}</strong><small>candidates</small></div>
      <div><span>Selected</span><strong>{selected}</strong><small>next move</small></div>
      <div><span>Planned ahead</span><strong>0</strong><small>stops</small></div>
    </div>
  );
}
