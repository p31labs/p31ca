import React, { useRef, useEffect, useState } from 'react';
import { COLORS, AXIS_NAMES } from '../constants';
import { getGraphData } from '../api';

const AXIS_CLR = { A: COLORS.coral, B: COLORS.teal, C: COLORS.gold, D: COLORS.purple };

export default function GraphBrain({ open, onClose, nodesRef }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [nodeCount, setNodeCount] = useState(0);

  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Merge backend graph data + live nodesRef
    let simNodes = [];

    async function loadData() {
      let backendNodes = [];
      try {
        const data = await getGraphData();
        backendNodes = data.nodes || [];
      } catch { /* offline */ }

      // Merge: backend nodes + live session nodes (dedup by id)
      const seen = new Set(backendNodes.map((n) => n.id));
      const liveNodes = (nodesRef?.current || []).filter((n) => !seen.has(n.id));
      const all = [...backendNodes, ...liveNodes];

      simNodes = all.map((n, i) => ({
        id: n.id,
        content: n.content || n.id,
        axis: n.axis || 'D',
        x: canvas.width / 2 + (Math.random() - 0.5) * 300,
        y: canvas.height / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
      }));
      setNodeCount(simNodes.length);
    }

    loadData();

    // Build edges: same-axis nodes are connected
    function getEdges() {
      const edges = [];
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          if (simNodes[i].axis === simNodes[j].axis) {
            edges.push([i, j]);
          }
        }
      }
      return edges;
    }

    function simulate() {
      animRef.current = requestAnimationFrame(simulate);
      if (simNodes.length === 0) return;

      const edges = getEdges();
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Forces
      for (let i = 0; i < simNodes.length; i++) {
        const a = simNodes[i];
        // Center gravity
        a.vx += (cx - a.x) * 0.0005;
        a.vy += (cy - a.y) * 0.0005;

        // Repulsion
        for (let j = i + 1; j < simNodes.length; j++) {
          const b = simNodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let force = 800 / (dist * dist);
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        }
      }

      // Spring attraction along edges
      for (const [i, j] of edges) {
        const a = simNodes[i];
        const b = simNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = (dist - 120) * 0.003;
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force;
        b.vy -= (dy / dist) * force;
      }

      // Apply velocity + damping
      for (const n of simNodes) {
        n.vx *= 0.92;
        n.vy *= 0.92;
        n.x += n.vx;
        n.y += n.vy;
      }

      // Render
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = COLORS.void;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Edges
      ctx.lineWidth = 0.5;
      for (const [i, j] of edges) {
        const a = simNodes[i];
        const b = simNodes[j];
        ctx.strokeStyle = (AXIS_CLR[a.axis] || COLORS.purple) + '30';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes
      for (const n of simNodes) {
        const isEncrypted = !!n.ciphertext;
        const color = isEncrypted ? COLORS.gold : (AXIS_CLR[n.axis] || COLORS.purple);
        const radius = 6;

        // Glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '20';
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Sovereign lock icon
        if (isEncrypted) {
          ctx.fillStyle = COLORS.gold;
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🔒', n.x, n.y - radius - 6);
        }

        // Label
        ctx.fillStyle = COLORS.text + '99';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const label = (n.content || '').slice(0, 20);
        ctx.fillText(label, n.x, n.y + radius + 12);
      }

      // Title
      ctx.fillStyle = COLORS.text + '40';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`GRAPH BRAIN — ${simNodes.length} nodes`, 20, 30);
    }

    simulate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [open, nodesRef]);

  if (!open) return null;

  return (
    <div className="brain-overlay">
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <button className="brain-close btn-secondary" onClick={onClose}>
        Back to Dome
      </button>
    </div>
  );
}
