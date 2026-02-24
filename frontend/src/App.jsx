/**
 * P31 Spaceship Earth — Unified Dashboard
 *
 * Three.js r128 geodesic dome visualization with:
 * - InstancedMesh node rendering (instanceColor set BEFORE first render)
 * - Jitterbug breathing animation (4-2-6 pattern)
 * - WebSocket connection to backend (:8031)
 * - Spoon gauge with progressive disclosure (Layers 0-3)
 * - Keyboard shortcuts: B (breathe), D (dev menu)
 * - Offline mode with seed nodes
 *
 * Canonical constants:
 *   Palette: Void #050510, Background #0a0f1a, Phosphorus #2dffa0,
 *            Teal #4ecdc4, Coral #ff6b6b, Gold #ffe66d, Purple #a29bfe
 *   Taxonomy: A=Identity(coral), B=Health(teal), C=Legal(gold), D=Technical(purple)
 *   Spoon baseline: 12, context switch: -1.5
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const COLORS = {
  void: '#050510',
  background: '#0a0f1a',
  phosphorus: '#2dffa0',
  teal: '#4ecdc4',
  coral: '#ff6b6b',
  gold: '#ffe66d',
  purple: '#a29bfe',
  text: '#e0e6ed',
};

const AXIS_COLORS = {
  A: new THREE.Color(COLORS.coral),
  B: new THREE.Color(COLORS.teal),
  C: new THREE.Color(COLORS.gold),
  D: new THREE.Color(COLORS.purple),
};

const AXIS_NAMES = {
  A: 'Identity',
  B: 'Health',
  C: 'Legal',
  D: 'Technical',
};

const SPOON_BASELINE = 12;
const BREATHING_PATTERN = { inhale: 4, hold: 2, exhale: 6 }; // seconds
const WS_URL = `ws://${window.location.hostname}:8031/ws`;

// Seed nodes for offline mode
const SEED_NODES = [
  { id: 'seed_1', content: 'P31 Labs', axis: 'A' },
  { id: 'seed_2', content: 'Spoon Engine', axis: 'B' },
  { id: 'seed_3', content: 'AGPL-3.0', axis: 'C' },
  { id: 'seed_4', content: 'Spaceship Earth', axis: 'D' },
  { id: 'seed_5', content: 'Thick Click', axis: 'D' },
  { id: 'seed_6', content: 'Cognitive Shield', axis: 'B' },
  { id: 'seed_7', content: 'Delta Topology', axis: 'D' },
  { id: 'seed_8', content: 'Phosphorus-31', axis: 'A' },
  { id: 'seed_9', content: 'Breathing Pacer', axis: 'B' },
  { id: 'seed_10', content: 'Buffer Agent', axis: 'D' },
  { id: 'seed_11', content: 'Neo4j Graph', axis: 'D' },
  { id: 'seed_12', content: 'HCB Fiscal Sponsor', axis: 'C' },
];

// ═══════════════════════════════════════════════════════════════════
// Geodesic Dome Geometry
// ═══════════════════════════════════════════════════════════════════

function generateIcosahedronVertices(radius, subdivisions) {
  const geo = new THREE.IcosahedronGeometry(radius, subdivisions);
  const positions = geo.getAttribute('position');
  const vertices = [];
  const seen = new Set();

  for (let i = 0; i < positions.count; i++) {
    const x = Math.round(positions.getX(i) * 1000) / 1000;
    const y = Math.round(positions.getY(i) * 1000) / 1000;
    const z = Math.round(positions.getZ(i) * 1000) / 1000;
    const key = `${x},${y},${z}`;
    if (!seen.has(key)) {
      seen.add(key);
      vertices.push(new THREE.Vector3(x, y, z));
    }
  }

  geo.dispose();
  return vertices;
}

// ═══════════════════════════════════════════════════════════════════
// Breathing Pacer
// ═══════════════════════════════════════════════════════════════════

function BreathingPacer({ active, onClose }) {
  const [phase, setPhase] = useState('inhale');
  const [timer, setTimer] = useState(BREATHING_PATTERN.inhale);

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          setPhase((p) => {
            if (p === 'inhale') { setTimer(BREATHING_PATTERN.hold); return 'hold'; }
            if (p === 'hold') { setTimer(BREATHING_PATTERN.exhale); return 'exhale'; }
            setTimer(BREATHING_PATTERN.inhale); return 'inhale';
          });
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  const labels = { inhale: 'Breathe In', hold: 'Hold', exhale: 'Breathe Out' };
  const colors = { inhale: COLORS.teal, hold: COLORS.gold, exhale: COLORS.purple };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,16,0.95)',
      zIndex: 1000,
    }}>
      <div style={{
        width: 200, height: 200, borderRadius: '50%',
        border: `4px solid ${colors[phase]}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 1s ease',
        transform: phase === 'inhale' ? 'scale(1.2)' : phase === 'exhale' ? 'scale(0.8)' : 'scale(1)',
      }}>
        <span style={{ fontSize: 48, color: colors[phase] }}>{timer}</span>
      </div>
      <p style={{ marginTop: 24, fontSize: 24, color: colors[phase] }}>{labels[phase]}</p>
      <p style={{ marginTop: 8, fontSize: 14, color: COLORS.text, opacity: 0.5 }}>
        4-2-6 pattern • Press B or click to close
      </p>
      <button onClick={onClose} style={{
        marginTop: 24, padding: '8px 24px', background: 'transparent',
        border: `1px solid ${COLORS.text}33`, color: COLORS.text,
        borderRadius: 4, cursor: 'pointer', fontSize: 14,
      }}>
        Close
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Spoon Gauge
// ═══════════════════════════════════════════════════════════════════

function SpoonGauge({ current, baseline }) {
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
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}>
      <div style={{
        width: 160, padding: 12, background: `${COLORS.background}dd`,
        borderRadius: 8, border: `1px solid ${color}44`,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: COLORS.text, opacity: 0.7 }}>SPOONS</span>
          <span style={{ fontSize: 11, color }}>{label}</span>
        </div>
        <div style={{
          height: 6, background: `${COLORS.text}22`, borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`, background: color,
            borderRadius: 3, transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ textAlign: 'right', marginTop: 4, fontSize: 13, color }}>
          {current.toFixed(1)} / {baseline}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Connection Status
// ═══════════════════════════════════════════════════════════════════

function ConnectionStatus({ connected }) {
  return (
    <div style={{
      position: 'fixed', top: 16, right: 20, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      color: connected ? COLORS.phosphorus : `${COLORS.text}66`,
    }}>
      <span>{connected ? '●' : '○'}</span>
      <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Dev Menu (Samson V2 Panel)
// ═══════════════════════════════════════════════════════════════════

function DevMenu({ active, onClose, nodes, spoons, connected }) {
  if (!active) return null;

  return (
    <div style={{
      position: 'fixed', top: 50, right: 20, width: 320, maxHeight: '80vh',
      overflow: 'auto', zIndex: 500, padding: 16,
      background: `${COLORS.background}ee`, borderRadius: 8,
      border: `1px solid ${COLORS.purple}44`,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: COLORS.purple, fontWeight: 'bold' }}>DEV PANEL</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: COLORS.text, cursor: 'pointer',
        }}>✕</button>
      </div>
      <div style={{ color: COLORS.text, lineHeight: 1.8 }}>
        <div>Nodes: {nodes.length}</div>
        <div>Spoons: {spoons.toFixed(1)} / {SPOON_BASELINE}</div>
        <div>WebSocket: {connected ? '● connected' : '○ disconnected'}</div>
        <div>Three.js: r128</div>
        <hr style={{ border: 'none', borderTop: `1px solid ${COLORS.text}22`, margin: '8px 0' }} />
        <div style={{ color: COLORS.text, opacity: 0.5 }}>
          Axes: {Object.entries(AXIS_NAMES).map(([k, v]) => `${k}=${v}`).join(', ')}
        </div>
        <hr style={{ border: 'none', borderTop: `1px solid ${COLORS.text}22`, margin: '8px 0' }} />
        <div style={{ color: COLORS.text, opacity: 0.5 }}>
          Keys: B=breathe, D=devmenu
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const meshRef = useRef(null);
  const nodesRef = useRef([...SEED_NODES]);
  const animRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [spoonCount, setSpoonCount] = useState(SPOON_BASELINE);
  const [showBreathing, setShowBreathing] = useState(false);
  const [showDevMenu, setShowDevMenu] = useState(false);
  const [nodeCount, setNodeCount] = useState(SEED_NODES.length);

  // ─── WebSocket Connection ───────────────────────────────────────
  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          setConnected(true);
          console.log('WebSocket connected to backend');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'connected' && msg.spoons) {
              setSpoonCount(msg.spoons.current);
            }

            if (msg.type === 'node_ingested') {
              const node = {
                id: msg.node_id,
                content: '',
                axis: msg.axis,
              };
              nodesRef.current.push(node);
              setNodeCount(nodesRef.current.length);
              updateInstancedMesh();
            }

            if (msg.type === 'spoon_update' && msg.spoons) {
              setSpoonCount(msg.spoons.current);
            }
          } catch (e) {
            console.error('WS message parse error:', e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'b' || e.key === 'B') {
        setShowBreathing((v) => !v);
      }
      if (e.key === 'd' || e.key === 'D') {
        setShowDevMenu((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Three.js Scene ─────────────────────────────────────────────
  const updateInstancedMesh = useCallback(() => {
    if (!sceneRef.current || !meshRef.current) return;

    const nodes = nodesRef.current;
    const mesh = meshRef.current;
    const domeVertices = mesh.userData.vertices;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < Math.min(nodes.length, domeVertices.length); i++) {
      const v = domeVertices[i];
      dummy.position.copy(v);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const axis = nodes[i].axis || 'D';
      const color = AXIS_COLORS[axis] || AXIS_COLORS.D;
      mesh.setColorAt(i, color);
    }

    mesh.count = Math.min(nodes.length, domeVertices.length);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.void);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Geodesic dome vertices
    const DOME_RADIUS = 3;
    const vertices = generateIcosahedronVertices(DOME_RADIUS, 2);

    // InstancedMesh for nodes
    const nodeGeo = new THREE.SphereGeometry(0.06, 12, 12);
    const nodeMat = new THREE.MeshStandardMaterial({
      metalness: 0.3,
      roughness: 0.6,
    });

    const maxNodes = vertices.length;
    const mesh = new THREE.InstancedMesh(nodeGeo, nodeMat, maxNodes);
    mesh.userData.vertices = vertices;

    // CRITICAL: Set instanceColor BEFORE first render (Three.js r128 bug #21786)
    const dummy = new THREE.Object3D();
    for (let i = 0; i < maxNodes; i++) {
      const v = vertices[i];
      dummy.position.copy(v);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, AXIS_COLORS.D);
    }
    mesh.count = Math.min(nodesRef.current.length, maxNodes);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    meshRef.current = mesh;
    scene.add(mesh);

    // Set actual node colors
    updateInstancedMesh();

    // Wireframe dome outline
    const wireGeo = new THREE.IcosahedronGeometry(DOME_RADIUS, 2);
    const wireMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.phosphorus),
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wireMesh);

    // Animation loop with jitterbug breathing
    const CYCLE = (BREATHING_PATTERN.inhale + BREATHING_PATTERN.hold + BREATHING_PATTERN.exhale);
    let startTime = Date.now();

    function animate() {
      animRef.current = requestAnimationFrame(animate);

      const elapsed = (Date.now() - startTime) / 1000;
      const cyclePos = (elapsed % CYCLE) / CYCLE;

      // Jitterbug: gentle scale oscillation
      const breathScale = 1 + 0.03 * Math.sin(cyclePos * Math.PI * 2);
      mesh.scale.setScalar(breathScale);
      wireMesh.scale.setScalar(breathScale);

      // Slow rotation
      mesh.rotation.y += 0.001;
      wireMesh.rotation.y += 0.001;
      mesh.rotation.x = Math.sin(elapsed * 0.1) * 0.05;
      wireMesh.rotation.x = Math.sin(elapsed * 0.1) * 0.05;

      renderer.render(scene, camera);
    }

    animate();

    // Resize handler
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
    };
  }, [updateInstancedMesh]);

  // ─── Determine disclosure layer ─────────────────────────────────
  let layer = 2;
  if (spoonCount < 3) layer = 0;
  else if (spoonCount < 6) layer = 1;
  else if (spoonCount >= 9) layer = 3;

  // Layer 0: Breathe — force breathing pacer
  useEffect(() => {
    if (layer === 0 && !showBreathing) {
      setShowBreathing(true);
    }
  }, [layer]);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {/* Title */}
      <div style={{
        position: 'fixed', top: 16, left: 20, zIndex: 100,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span style={{ fontSize: 14, color: COLORS.phosphorus, letterSpacing: 2 }}>
          P31
        </span>
        <span style={{ fontSize: 14, color: `${COLORS.text}66`, marginLeft: 8 }}>
          SPACESHIP EARTH
        </span>
      </div>

      {/* Connection status */}
      <ConnectionStatus connected={connected} />

      {/* Spoon gauge (hidden in Layer 0) */}
      {layer > 0 && (
        <SpoonGauge current={spoonCount} baseline={SPOON_BASELINE} />
      )}

      {/* Breathing pacer */}
      <BreathingPacer
        active={showBreathing}
        onClose={() => setShowBreathing(false)}
      />

      {/* Dev menu (Layer 3 only, or D key) */}
      {layer >= 2 && (
        <DevMenu
          active={showDevMenu}
          onClose={() => setShowDevMenu(false)}
          nodes={nodesRef.current}
          spoons={spoonCount}
          connected={connected}
        />
      )}

      {/* Keyboard hint */}
      {layer >= 1 && (
        <div style={{
          position: 'fixed', bottom: 20, left: 20, zIndex: 100,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: `${COLORS.text}33`,
        }}>
          B: breathe &nbsp; D: dev menu
        </div>
      )}
    </>
  );
}
