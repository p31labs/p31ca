import React from 'react';
import { COLORS, SPOON_BASELINE } from '../constants';

export default function SpoonGauge({ current, baseline = SPOON_BASELINE, onDeduct, onRestore, loading = false }) {
  const pct = Math.max(0, Math.min(100, (current / baseline) * 100));
  let color = COLORS.phosphorus;
  if (pct < 25) color = COLORS.coral;
  else if (pct < 50) color = COLORS.gold;
  else if (pct < 75) color = COLORS.teal;

  let label = 'COMMAND';
  if (current < 3) label = 'BREATHE';
  else if (current < 6) label = 'FOCUS';
  else if (current < 9) label = 'BUILD';

  return (
    <div className="spoon-gauge" role="region" aria-label="Cognitive energy gauge">
      <span className="label" style={{ color }} aria-live="polite">
        {label}
      </span>
      <div
        className="bar-wrap"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={baseline}
        aria-label={`Energy level: ${current.toFixed(1)} of ${baseline} spoons`}
      >
        <div
          className="bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {onDeduct && (
        <button
          className="spoon-btn"
          onClick={onDeduct}
          disabled={loading || current <= 0}
          aria-label="Deduct 1 spoon"
          title="Deduct 1 spoon"
        >
          &minus;
        </button>
      )}
      <span className="number" style={{ color }} aria-hidden="true">
        {current.toFixed(1)}
      </span>
      {onRestore && (
        <button
          className="spoon-btn"
          onClick={onRestore}
          disabled={loading || current >= baseline}
          aria-label="Restore 1 spoon"
          title="Restore 1 spoon"
        >
          +
        </button>
      )}
    </div>
  );
}
