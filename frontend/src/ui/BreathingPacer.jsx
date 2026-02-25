/**
 * Breathing Pacer v2 — Canvas 2D "Quantum Breath"
 *
 * 180-particle ring that expands/contracts with breathing phases.
 * Color shifts: teal (inhale) → gold (hold) → purple (exhale).
 * Particle trails, central glow orb, ambient dust, ripple on phase change.
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { COLORS, BREATHING_PATTERN } from '../constants';
import { useSync } from '../hooks/useSync';
import { useLit } from '../hooks/useLit';

const RING_COUNT = 180;
const AMBIENT_COUNT = 50;
const TRAIL_LEN = 8;

const PHASE_HEX = {
  inhale: COLORS.teal,
  hold: COLORS.gold,
  exhale: COLORS.purple,
};

function hexRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

const PHASE_RGB = {
  inhale: hexRgb(COLORS.teal),
  hold: hexRgb(COLORS.gold),
  exhale: hexRgb(COLORS.purple),
};

function lerpRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export default function BreathingPacer({ active, onClose }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({
    phase: 'inhale',
    phaseElapsed: 0,
    currentRadius: 0.6,
    ripples: [],
    color: { ...PHASE_RGB.inhale },
  });

  const [displayPhase, setDisplayPhase] = useState('inhale');
  const [displayTimer, setDisplayTimer] = useState(BREATHING_PATTERN.inhale);

  // Phase countdown for display
  useEffect(() => {
    if (!active) return;

    const st = stateRef.current;
    st.phase = 'inhale';
    st.phaseElapsed = 0;
    st.currentRadius = 0.6;
    st.ripples = [];
    st.color = { ...PHASE_RGB.inhale };
    setDisplayPhase('inhale');
    setDisplayTimer(BREATHING_PATTERN.inhale);

    const interval = setInterval(() => {
      setDisplayTimer((t) => {
        if (t <= 1) {
          setDisplayPhase((p) => {
            let next;
            if (p === 'inhale') { next = 'hold'; setDisplayTimer(BREATHING_PATTERN.hold); }
            else if (p === 'hold') { next = 'exhale'; setDisplayTimer(BREATHING_PATTERN.exhale); }
            else { next = 'inhale'; setDisplayTimer(BREATHING_PATTERN.inhale); }
            // Sync ref + trigger ripple
            st.phase = next;
            st.phaseElapsed = 0;
            st.ripples.push({ born: performance.now(), radius: 0 });
            return next;
          });
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);

  // Canvas animation loop
  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Ring particles
    const ring = Array.from({ length: RING_COUNT }, (_, i) => ({
      angle: (i / RING_COUNT) * Math.PI * 2,
      rOff: (Math.random() - 0.5) * 0.07,
      pOff: Math.random() * Math.PI * 2,
      size: 1.2 + Math.random() * 1.8,
      trail: [],
    }));

    // Ambient dust
    const dust = Array.from({ length: AMBIENT_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0002,
      vy: (Math.random() - 0.5) * 0.0002,
      size: 0.8 + Math.random() * 1.5,
      opacity: 0.08 + Math.random() * 0.15,
    }));

    const st = stateRef.current;
    let lastT = performance.now();

    function getPhaseDuration(p) { return BREATHING_PATTERN[p] || 4; }

    function frame(now) {
      animRef.current = requestAnimationFrame(frame);
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;
      st.phaseElapsed += dt;

      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const baseR = Math.min(W, H) * 0.17;

      // Phase progress (0→1 within current phase)
      const dur = getPhaseDuration(st.phase);
      const prog = Math.min(st.phaseElapsed / dur, 1);
      const eased = 0.5 - 0.5 * Math.cos(prog * Math.PI); // smooth ease

      // Target ring radius
      let targetR;
      if (st.phase === 'inhale') targetR = 0.55 + 0.45 * eased;
      else if (st.phase === 'hold') targetR = 1.0 + 0.02 * Math.sin(now * 0.002); // subtle pulse
      else targetR = 1.0 - 0.45 * eased;

      // Smooth lerp current radius toward target
      st.currentRadius += (targetR - st.currentRadius) * 0.08;

      // Color interpolation toward phase target
      const tc = PHASE_RGB[st.phase];
      st.color.r += (tc.r - st.color.r) * 0.04;
      st.color.g += (tc.g - st.color.g) * 0.04;
      st.color.b += (tc.b - st.color.b) * 0.04;
      const c = st.color;
      const cr = Math.round(c.r);
      const cg = Math.round(c.g);
      const cb = Math.round(c.b);

      // ── Clear ──
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, W, H);

      // ── Ripples ──
      for (let i = st.ripples.length - 1; i >= 0; i--) {
        const rip = st.ripples[i];
        const age = (now - rip.born) / 1000;
        if (age > 2) { st.ripples.splice(i, 1); continue; }
        const ripR = baseR * st.currentRadius + age * baseR * 0.8;
        const ripA = Math.max(0, 0.25 * (1 - age / 2));
        ctx.beginPath();
        ctx.arc(cx, cy, ripR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${ripA})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ── Central glow ──
      const gr = baseR * st.currentRadius;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr * 1.6);
      grd.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.1)`);
      grd.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, 0.04)`);
      grd.addColorStop(1, 'rgba(5, 5, 16, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, gr * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Inner orb
      const orbGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr * 0.25);
      orbGrd.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.2)`);
      orbGrd.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, gr * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = orbGrd;
      ctx.fill();

      // ── Ring particles ──
      const elapsed = now / 1000;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const wobble = Math.sin(elapsed * 0.8 + p.pOff) * 0.025;
        const drift = Math.sin(elapsed * 0.3 + p.pOff) * 0.015;
        const r = baseR * (st.currentRadius + p.rOff + wobble);
        const a = p.angle + drift;

        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        // Trail
        p.trail.push({ x, y });
        if (p.trail.length > TRAIL_LEN) p.trail.shift();

        // Draw trail
        for (let t = 0; t < p.trail.length - 1; t++) {
          const tp = p.trail[t];
          const frac = t / p.trail.length;
          const ta = frac * 0.25;
          const ts = p.size * frac * 0.4;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, ts, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${ta})`;
          ctx.fill();
        }

        // Particle
        const brightness = 0.5 + 0.5 * Math.sin(elapsed * 1.5 + p.pOff);
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${brightness})`;
        ctx.fill();

        // Highlight glow (every 6th particle)
        if (i % 6 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, p.size * 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.04)`;
          ctx.fill();
        }
      }

      // ── Ambient dust ──
      for (const d of dust) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = 1;
        if (d.x > 1) d.x = 0;
        if (d.y < 0) d.y = 1;
        if (d.y > 1) d.y = 0;

        ctx.beginPath();
        ctx.arc(d.x * W, d.y * H, d.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${d.opacity})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;

  const { spoons, nodes } = useSync();
  const { litStatus } = useLit();

  const breathDuration = useMemo(() => (spoons > 6 ? '4s' : '8s'), [spoons]);
  const sovereignCount = nodes.filter((n) => n.ciphertext).length;

  const labels = { inhale: 'Breathe In', hold: 'Hold', exhale: 'Breathe Out' };
  const phaseColor = PHASE_HEX[displayPhase];

  return (
    <div
      className="breathing-overlay"
      onClick={onClose}
      style={{
        borderColor: litStatus === 'Connected' ? '#4ecdc4' : '#ff6b6b',
        boxShadow: `0 0 ${20 + sovereignCount * 5}px ${litStatus === 'Connected' ? '#4ecdc480' : '#ff6b6b80'}`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="breathing-canvas"
        style={{ animationDuration: breathDuration }}
      />
      <div className="breathing-hud">
        <span className="breathing-timer" style={{ color: phaseColor }}>{displayTimer}</span>
        <span className="breathing-label" style={{ color: phaseColor }}>{labels[displayPhase]}</span>
        <span className="breathing-hint">4-2-6 · B or click to close</span>
        <div className="breathing-stats" style={{ color: '#ffe66d', marginTop: 8 }}>
          {sovereignCount} Sovereign Nodes Protected
        </div>
      </div>
    </div>
  );
}
