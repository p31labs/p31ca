import React from 'react';
import { COLORS } from '../constants';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const DOT_COLORS = {
  A: COLORS.coral,
  B: COLORS.teal,
  C: COLORS.gold,
  D: COLORS.purple,
};

export default function ActivityFeed({ activity }) {
  if (!activity.length) {
    return (
      <div className="panel">
        <div className="panel-title">Activity</div>
        <div className="inspector-empty">No ingestions yet</div>
      </div>
    );
  }

  return (
    <div className="panel" style={{
        // apply blurry, ghost-like background
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
    }}>
      <div className="panel-title">Activity</div>
      <div className="activity-feed" style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}>
        {activity.map((item, i) => (
          <div className="activity-item" key={item.id + i}>
            <span
              className="dot"
              style={{ background: DOT_COLORS[item.axis] || COLORS.purple }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: COLORS.teal + '99', // 60% opacity
              }}>
                {item.content}
              </div>
              <div className="meta" style={{ color: COLORS.teal + '99' }}>
                {item.axis} &middot; v{item.voltage.toFixed(1)} &middot; {timeAgo(item.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
