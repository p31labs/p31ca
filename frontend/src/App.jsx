/**
 * P31 Spaceship Earth — Unified Dashboard
 *
 * Three.js r128 geodesic dome with:
 * - UnrealBloom + Vignette post-processing
 * - Emissive instanced nodes with voltage-driven brightness
 * - Custom wireframe shader (pulses, dims with spoons)
 * - OrbitControls with auto-rotate
 * - Raycasting for node hover/click → inspector
 * - Ingestion particle bursts
 * - Axis connection lines
 * - CSS grid HUD layout
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useVscode } from './hooks/useVscode';
import { useSync } from './hooks/useSync';
import { usePersistence } from './hooks/usePersistence';
import { ToastProvider, useToast } from './ui/Toast';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  COLORS, AXIS_COLORS,
  SPOON_BASELINE, BREATHING_PATTERN,
  QUANTUM_CONFIG,
} from './constants';
import { getBreathState } from './hooks/useBreathSync';
import useWebSocket from './hooks/useWebSocket';
import SpoonGauge from './ui/SpoonGauge';
import NodeInspector from './ui/NodeInspector';
import ActivityFeed from './ui/ActivityFeed';
import StatusBar from './ui/StatusBar';
import CommandMenu from './ui/CommandMenu';
import IngestForm from './ui/IngestForm';
import AiChat from './ui/AiChat';
import GraphBrain from './ui/GraphBrain';
import ExportPanel from './ui/ExportPanel';
import BreathingPacer from './ui/BreathingPacer';
import { deductSpoons, restoreSpoons } from './api';
import { useLit } from './hooks/useLit';
import './styles.css';

// ═══════════════════════════════════════════════════════════════════
// Geodesic vertex generation
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
// Custom wireframe shader — pulses with breath, plasma flows, dims with spoons
// ═══════════════════════════════════════════════════════════════════

const wireShaderMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpoonPct: { value: 1.0 },
      uBreathPhase: { value: 0 },
      uColor: { value: new THREE.Color(COLORS.phosphorus) },
    },
    vertexShader: `
      varying float vY;
      varying vec3 vWorldPos;
      void main() {
        vY = position.y;
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSpoonPct;
      uniform float uBreathPhase;
      uniform vec3 uColor;
      varying float vY;
      varying vec3 vWorldPos;

      // Simplex-ish noise for plasma effect
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }

      void main() {
        float yNorm = (vY + 3.0) / 6.0;
        float vertGrad = smoothstep(0.0, 0.3, yNorm) * smoothstep(1.0, 0.7, yNorm);

        // Breath-synced pulse (12s cycle = 0.524 rad/s)
        float breathPulse = 0.15 + 0.15 * uBreathPhase;
        float spoonFade = 0.3 + 0.7 * uSpoonPct;

        // Plasma flow effect
        float plasma = noise(vWorldPos * 2.0 + vec3(uTime * 0.3, uTime * 0.2, uTime * 0.1));
        plasma += 0.5 * noise(vWorldPos * 4.0 - vec3(uTime * 0.5));
        plasma = plasma * 0.5 + 0.5;

        // Interference pattern at equator
        float equatorDist = abs(vY);
        float interference = sin(vY * 20.0 + uTime * 2.0) * sin(vY * 13.0 - uTime * 1.3);
        interference = interference * 0.5 + 0.5;
        interference *= smoothstep(1.5, 0.0, equatorDist);

        // Energy accumulation (standing wave ring at equator)
        float ringEnergy = exp(-equatorDist * equatorDist * 3.0);
        ringEnergy *= 0.5 + 0.5 * sin(uTime * 3.0);

        // Combine effects
        float alpha = breathPulse * vertGrad * spoonFade;
        alpha += plasma * 0.08 * spoonFade;
        alpha += interference * 0.1 * spoonFade;
        alpha += ringEnergy * 0.15 * uBreathPhase;

        // Color shift based on plasma
        vec3 finalColor = uColor;
        finalColor = mix(finalColor, vec3(0.3, 0.8, 0.9), plasma * 0.2);
        finalColor = mix(finalColor, vec3(0.6, 0.9, 1.0), ringEnergy * 0.3);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    wireframe: true,
    depthWrite: false,
  });

// ═══════════════════════════════════════════════════════════════════
// Chromatic aberration post-processing shader (stress indicator)
// ═══════════════════════════════════════════════════════════════════

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uOffset: { value: QUANTUM_CONFIG.energyField.chromaBaseOffset },
    uSpoonPct: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uOffset;
    uniform float uSpoonPct;
    varying vec2 vUv;

    void main() {
      // Increase aberration when spoons are low
      float stressMultiplier = 1.0 + (1.0 - uSpoonPct) * ${QUANTUM_CONFIG.energyField.chromaStressMultiplier.toFixed(1)};
      float offset = uOffset * stressMultiplier;

      // Direction from center
      vec2 dir = vUv - 0.5;
      float dist = length(dir);

      // More aberration at edges
      vec2 aberration = normalize(dir) * offset * dist * dist;

      float r = texture2D(tDiffuse, vUv + aberration).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - aberration).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

// ═══════════════════════════════════════════════════════════════════
// Wavefunction halo shader (probability clouds around nodes)
// ═══════════════════════════════════════════════════════════════════

const haloShaderMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCollapse: { value: 0 },  // 0 = expanded cloud, 1 = collapsed
      uBreathPhase: { value: 0 },
      uColor: { value: new THREE.Color(COLORS.phosphorus) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uCollapse;
      uniform float uBreathPhase;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        float r = length(vPosition);

        // Multiple probability shells at different radii
        float shell1 = exp(-pow((r - 0.3 - 0.1 * sin(uTime * 1.3 + uBreathPhase * 6.28)), 2.0) / 0.02);
        float shell2 = exp(-pow((r - 0.5 - 0.08 * sin(uTime * 2.1 + 1.0)), 2.0) / 0.025);
        float shell3 = exp(-pow((r - 0.7 - 0.05 * sin(uTime * 0.7 + 2.0)), 2.0) / 0.03);

        float cloudDensity = shell1 * 0.6 + shell2 * 0.3 + shell3 * 0.2;

        // Collapse animation: shells contract to center
        cloudDensity *= (1.0 - uCollapse);

        // Fresnel rim glow
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);
        cloudDensity += fresnel * 0.2 * (1.0 - uCollapse * 0.8);

        // Breath-synced intensity
        cloudDensity *= 0.8 + 0.2 * uBreathPhase;

        float alpha = cloudDensity * 0.5;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

// ═══════════════════════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const meshRef = useRef(null);
  const composerRef = useRef(null);
  const wireMatRef = useRef(null);
  const particlesRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2(-999, -999));
  const pointerDownRef = useRef({ x: 0, y: 0 });
  const cameraRef = useRef(null);
  const animRef = useRef(null);

  // Quantum effect refs
  const ghostMeshRef = useRef(null);
  const haloMeshRef = useRef(null);
  const chromaPassRef = useRef(null);
  const observationStateRef = useRef({}); // nodeId -> { collapsed: 0-1, lastObserved: timestamp }
  const entanglementStateRef = useRef({}); // nodeId -> { triggered: timestamp, delay: ms }

  // --------------------------------------------------------
  // VS Code integration state
  // --------------------------------------------------------
  const [activeFile, setActiveFile] = useState('Spaceship Earth');
  const [pulse, setPulse] = useState(false); // visual feedback when haptic/click occurs

  // helper to trigger visual pulse feedback (increased duration for better perception)
  function triggerPulse(intensity = 'normal') {
    setPulse(true);
    const duration = intensity === 'strong' ? 700 : intensity === 'soft' ? 400 : 500;
    setTimeout(() => setPulse(false), duration);
  }

  const { postMessage } = useVscode(async (message) => {
    if (message.command === 'updateContext') {
      setActiveFile(message.data.activeFile);
    }
    // listen for hardware_sync events bubbling through bufferStream
    if (message.command === 'bufferStream') {
      try {
        const chunk = JSON.parse(message.data);
        if (chunk.type === 'hardware_sync') {
          triggerPulse();
        }
        if (chunk.type === 'lit_request' && chunk.action === 'encrypt_node') {
          // perform encryption and send response back through buffer
          const nodeId = chunk.node_id;
          const node = nodesRef.current.find((n) => n.id === nodeId);
          if (node && encryptNode) {
            const payload = await encryptNode(JSON.stringify(node));
            if (bufferSocket && bufferSocket.readyState === WebSocket.OPEN) {
              bufferSocket.send(
                JSON.stringify({
                  type: 'lit_response',
                  action: 'encrypt_node',
                  node_id: nodeId,
                  ...payload,
                })
              );
            }
          }
        }
        if (chunk.type === 'lit_response' && chunk.action === 'encrypt_node') {
          // mark the local node as encrypted so GraphBrain draws differently
          const nodeId = chunk.node_id;
          const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
          if (idx !== -1) {
            nodesRef.current[idx].ciphertext = chunk.ciphertext;
            nodesRef.current[idx].accessControlConditions = chunk.accessControlConditions;
          }
        }
      } catch (e) {
        // ignore
      }
    }
  });

  // notify host when app is ready
  useEffect(() => {
    postMessage({ command: 'systemReady' });
  }, []);
  const bloomPassRef = useRef(null);
  const hoveredIdxRef = useRef(-1);
  const spoonCountRef = useRef(SPOON_BASELINE);

  const {
    connected,
    connectionState,
    nodeCount,
    activity,
    nodesRef,
    voltageMapRef,
    onNodeAdded,
    setNodeCount,
    sendMessage,
    reconnectAttempt,
    queuedMessageCount,
    getWebSocket,
  } = useWebSocket();

  // CRDT-synchronized state
  const { spoons, nodes, crdtStatus, reconnect: reconnectCrdt } = useSync();

  // Compute overall connection status
  const overallStatus = useMemo(() => {
    if (connected && crdtStatus === 'connected') return 'live';
    if (connected && crdtStatus !== 'connected') return 'degraded';
    if (connectionState === 'reconnecting') return 'reconnecting';
    return 'offline';
  }, [connected, crdtStatus, connectionState]);

  const statusTooltip = useMemo(() => {
    const parts = [];
    parts.push(`Buffer: ${connected ? 'connected' : connectionState}`);
    parts.push(`CRDT: ${crdtStatus}`);
    if (queuedMessageCount > 0) {
      parts.push(`Queued: ${queuedMessageCount} msgs`);
    }
    return parts.join(' | ');
  }, [connected, connectionState, crdtStatus, queuedMessageCount]);

  // Lit Protocol membrane status
  const { litStatus } = useLit();
  const { syncStatus } = usePersistence();

  // helper to map spoon count to UI opacity for different layers
  const getOpacityForLayer = (layerName) => {
      if (spoons >= 9.0) return 1.0; // COMMAND
      if (spoons >= 6.0) {
          if (layerName === 'telemetry') return 0.2; // ghost heavy data
          return 1.0;
      }
      if (spoons >= 3.0) {
          if (layerName === 'telemetry') return 0.0;
          if (layerName === 'hud') return 0.3;
          if (layerName === 'core') return 1.0;
          return 0.5;
      }
      // BREATHE layer
      if (layerName === 'breathing') return 1.0;
      if (layerName === 'telemetry' || layerName === 'hud') return 0.0;
      return 0.15;
  };

  // precalc opacities for readability in JSX
  const telOpacity = getOpacityForLayer('telemetry');
  const hudOpacity = getOpacityForLayer('hud');
  const coreOpacity = getOpacityForLayer('core');

  const [showBreathing, setShowBreathing] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'ingest' | 'chat' | 'brain' | 'export' | null
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedVoltage, setSelectedVoltage] = useState(null);

  // Keep a ref in sync for the animation loop
  spoonCountRef.current = spoons;

  // whenever the CRDT nodes list updates, mirror it into the existing
  // nodesRef used across the app and bump the node count + re‑render.
  useEffect(() => {
    nodesRef.current = nodes;
    if (typeof setNodeCount === 'function') {
      setNodeCount(nodes.length);
    }
    if (onNodeAdded.current) onNodeAdded.current();
  }, [nodes]);

  // ─── Update instanced mesh ───────────────────────────────────────
  const updateInstancedMesh = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const nodes = nodesRef.current;
    const vertices = mesh.userData.vertices;
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    for (let i = 0; i < Math.min(nodes.length, vertices.length); i++) {
      const v = vertices[i];
      dummy.position.copy(v);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const axis = nodes[i].axis || 'D';
      const baseColor = AXIS_COLORS[axis] || AXIS_COLORS.D;

      // Voltage-driven brightness — push colors above 1.0 so bloom catches them
      const voltage = voltageMapRef.current[nodes[i].id];
      const brightness = voltage ? 1.0 + 0.8 * Math.min(voltage.composite / 10, 1) : 1.3;
      tmpColor.copy(baseColor).multiplyScalar(brightness);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.count = Math.min(nodes.length, vertices.length);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // Register callback for WS hook
  onNodeAdded.current = updateInstancedMesh;

  // ─── Spawn ingestion particle burst ─────────────────────────────
  const spawnParticles = useCallback((position) => {
    const particles = particlesRef.current;
    if (!particles) return;

    const positions = particles.geometry.attributes.position;
    const ages = particles.userData.ages;
    let spawned = 0;

    for (let i = 0; i < ages.length && spawned < 15; i++) {
      if (ages[i] <= 0) {
        positions.setXYZ(
          i,
          position.x + (Math.random() - 0.5) * 0.5,
          position.y + (Math.random() - 0.5) * 0.5,
          position.z + (Math.random() - 0.5) * 0.5,
        );
        ages[i] = 1.0;
        spawned++;
      }
    }
    positions.needsUpdate = true;
  }, []);

  // ─── Keyboard Shortcuts ───────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      // Ignore when typing in inputs/textareas
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandMenu((v) => !v);
        return;
      }

      // Single-key shortcuts (only when no modal is open)
      if (!showCommandMenu && !activePanel && !showBreathing) {
        if (e.key === 'b' || e.key === 'B') setShowBreathing(true);
        if (e.key === 'i' || e.key === 'I') setActivePanel('ingest');
        if (e.key === 'c' || e.key === 'C') setActivePanel('chat');
        if (e.key === 'g' || e.key === 'G') setActivePanel('brain');
        if (e.key === 'e' || e.key === 'E') setActivePanel('export');
      }

      // Escape closes whatever is open
      if (e.key === 'Escape') {
        if (showBreathing) setShowBreathing(false);
        else if (activePanel) setActivePanel(null);
        else if (showCommandMenu) setShowCommandMenu(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCommandMenu, activePanel, showBreathing]);

  function handleAction(actionId) {
    switch (actionId) {
      case 'ingest':
        // trigger workspace ingestion via buffer agent
        postMessage({
          command: 'sendToBuffer',
          data: { action: 'ingest_workspace' },
        });
        triggerPulse();
        break;
      case 'breathe':
        setShowBreathing(true);
        break;
      default:
        setActivePanel(actionId);
        break;
    }
  }

  async function handleDeductSpoon() {
    try { await deductSpoons(1, 'manual'); } catch (e) { console.error('Deduct failed:', e); }
  }

  async function handleRestoreSpoon() {
    try { await restoreSpoons(1, 'manual'); } catch (e) { console.error('Restore failed:', e); }
  }

  // ─── Quantum Entanglement Trigger ──────────────────────────────────
  const triggerEntanglement = useCallback((nodeId, axis) => {
    const now = performance.now();
    const nodes = nodesRef.current;

    // Find all nodes on the same axis (entangled)
    const entangledNodes = nodes
      .filter(n => n.axis === axis && n.id !== nodeId)
      .map(n => n.id);

    // Cascade pulse with delay
    entangledNodes.forEach((id, idx) => {
      entanglementStateRef.current[id] = {
        triggered: now,
        delay: idx * QUANTUM_CONFIG.entanglement.cascadeDelay,
      };
    });

    // Also mark the clicked node
    entanglementStateRef.current[nodeId] = {
      triggered: now,
      delay: 0,
    };
  }, []);

  // ─── Three.js Scene ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.void);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 1000,
    );
    camera.position.set(0, 1.2, 7);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0x1a2a3a, 0.8));
    const keyLight = new THREE.PointLight(0xffe4c4, 1.2);
    keyLight.position.set(5, 5, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x2dffa0, 0.8);
    rimLight.position.set(-4, -2, -6);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight(0xa29bfe, 0.4);
    fillLight.position.set(-3, 4, 3);
    scene.add(fillLight);
    scene.add(new THREE.HemisphereLight(0x1a3a5a, 0x050510, 0.4));

    // ── Post-processing ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      2.2,   // strength — aggressive glow
      0.8,   // radius — wide halo
      0.3,   // threshold — catches bright nodes
    );
    composer.addPass(bloomPass);
    bloomPassRef.current = bloomPass;

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = 0.95;
    vignettePass.uniforms['darkness'].value = 1.1;
    composer.addPass(vignettePass);

    // Chromatic aberration (stress indicator - increases when spoons low)
    const chromaPass = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromaPass);
    chromaPassRef.current = chromaPass;

    composerRef.current = composer;

    // ── OrbitControls ──
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.minDistance = 4;
    controls.maxDistance = 16;
    controls.enablePan = false;

    // ── Starfield ──
    const STAR_COUNT = 400;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 20 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      // Slight color variation — warm or cool tint
      const tint = Math.random();
      starColors[i * 3] = 0.6 + tint * 0.4;
      starColors[i * 3 + 1] = 0.7 + tint * 0.3;
      starColors[i * 3 + 2] = 0.8 + (1 - tint) * 0.2;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Geodesic dome vertices ──
    const DOME_RADIUS = 3;
    const vertices = generateIcosahedronVertices(DOME_RADIUS, 2);

    // ── InstancedMesh for nodes (emissive material) ──
    const nodeGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const nodeMat = new THREE.MeshStandardMaterial({
      metalness: 0.4,
      roughness: 0.3,
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
    });

    const maxNodes = vertices.length;
    const mesh = new THREE.InstancedMesh(nodeGeo, nodeMat, maxNodes);
    mesh.userData.vertices = vertices;

    // CRITICAL: Set instanceColor BEFORE first render (Three.js r128 bug #21786)
    const dummy = new THREE.Object3D();
    for (let i = 0; i < maxNodes; i++) {
      dummy.position.copy(vertices[i]);
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
    updateInstancedMesh();

    // ── Ghost mesh for superposition states (additive blend) ──
    const ghostMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.phosphorus),
      transparent: true,
      opacity: QUANTUM_CONFIG.superposition.ghostAlphaBase,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ghostMesh = new THREE.InstancedMesh(nodeGeo, ghostMat, maxNodes);
    ghostMesh.userData.vertices = vertices;

    // Initialize ghost positions (offset from main nodes)
    for (let i = 0; i < maxNodes; i++) {
      dummy.position.copy(vertices[i]);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      ghostMesh.setMatrixAt(i, dummy.matrix);
      ghostMesh.setColorAt(i, new THREE.Color(COLORS.phosphorus));
    }
    ghostMesh.count = 0;  // Start hidden
    ghostMesh.instanceMatrix.needsUpdate = true;
    if (ghostMesh.instanceColor) ghostMesh.instanceColor.needsUpdate = true;
    ghostMeshRef.current = ghostMesh;
    scene.add(ghostMesh);

    // ── Halo mesh for wavefunction probability clouds ──
    const haloGeo = new THREE.SphereGeometry(0.5, 24, 24);
    const haloMat = haloShaderMaterial();
    const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, maxNodes);
    haloMesh.userData.vertices = vertices;

    // Initialize halo positions
    for (let i = 0; i < maxNodes; i++) {
      dummy.position.copy(vertices[i]);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      haloMesh.setMatrixAt(i, dummy.matrix);
    }
    haloMesh.count = Math.min(nodesRef.current.length, maxNodes);
    haloMesh.instanceMatrix.needsUpdate = true;
    haloMeshRef.current = haloMesh;
    scene.add(haloMesh);

    // ── Custom wireframe shader ──
    const wireGeo = new THREE.IcosahedronGeometry(DOME_RADIUS, 2);
    const wireMat = wireShaderMaterial();
    wireMatRef.current = wireMat;
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wireMesh);

    // ── Axis connection lines ──
    const linePositions = [];
    const lineColors = [];
    const nodeList = nodesRef.current;
    for (let i = 0; i < Math.min(nodeList.length, vertices.length); i++) {
      for (let j = i + 1; j < Math.min(nodeList.length, vertices.length); j++) {
        if (nodeList[i].axis === nodeList[j].axis) {
          const vi = vertices[i];
          const vj = vertices[j];
          linePositions.push(vi.x, vi.y, vi.z, vj.x, vj.y, vj.z);
          const c = AXIS_COLORS[nodeList[i].axis] || AXIS_COLORS.D;
          lineColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    // ── Ingestion particles ──
    const PARTICLE_COUNT = 80;
    const pGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(PARTICLE_COUNT * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x2dffa0,
      size: 0.18,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(pGeo, pMat);
    points.userData.ages = new Float32Array(PARTICLE_COUNT);
    particlesRef.current = points;
    scene.add(points);

    // ── Animation loop ──
    const CYCLE = BREATHING_PATTERN.inhale + BREATHING_PATTERN.hold + BREATHING_PATTERN.exhale;
    const clock = new THREE.Clock();

    function animate() {
      animRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.1);

      // Breathing jitterbug
      const cyclePos = (elapsed % CYCLE) / CYCLE;
      const breathScale = 1 + 0.03 * Math.sin(cyclePos * Math.PI * 2);
      mesh.scale.setScalar(breathScale);
      wireMesh.scale.setScalar(breathScale);
      lines.scale.setScalar(breathScale);

      // Starfield slow drift
      stars.rotation.y = elapsed * 0.005;
      stars.rotation.x = Math.sin(elapsed * 0.003) * 0.02;

      // Per-node bobbing — each node floats at its own phase
      const bobDummy = new THREE.Object3D();
      const nodeLen = Math.min(nodesRef.current.length, vertices.length);
      for (let i = 0; i < nodeLen; i++) {
        const v = vertices[i];
        const bobOffset = Math.sin(elapsed * 1.2 + i * 1.7) * 0.04;
        const dir = v.clone().normalize();
        bobDummy.position.copy(v).addScaledVector(dir, bobOffset);
        bobDummy.lookAt(0, 0, 0);
        // Hover scale handled separately below
        if (i === hoveredIdxRef.current) {
          bobDummy.scale.setScalar(1.8);
        } else {
          bobDummy.scale.setScalar(1.0);
        }
        bobDummy.updateMatrix();
        mesh.setMatrixAt(i, bobDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;

      // Get synchronized breath state
      const breathState = getBreathState();
      const breathIntensity = breathState.intensity;

      // Wireframe shader uniforms
      const spoonPct = spoonCountRef.current / SPOON_BASELINE;
      wireMat.uniforms.uTime.value = elapsed;
      wireMat.uniforms.uSpoonPct.value = Math.max(0, Math.min(1, spoonPct));
      wireMat.uniforms.uBreathPhase.value = breathIntensity;

      // Bloom intensifies under stress
      bloomPass.strength = 2.2 + 0.8 * (1 - spoonPct);

      // Chromatic aberration intensifies under stress
      if (chromaPassRef.current) {
        chromaPassRef.current.uniforms.uSpoonPct.value = spoonPct;
      }

      // ── Halo mesh (wavefunction collapse) ──
      const haloMesh = haloMeshRef.current;
      if (haloMesh && haloMesh.material) {
        haloMesh.material.uniforms.uTime.value = elapsed;
        haloMesh.material.uniforms.uBreathPhase.value = breathIntensity;

        const haloDummy = new THREE.Object3D();
        const now = performance.now();

        for (let i = 0; i < nodeLen; i++) {
          const node = nodesRef.current[i];
          const v = vertices[i];

          // Track observation state (collapsed when hovered)
          if (!observationStateRef.current[node.id]) {
            observationStateRef.current[node.id] = { collapsed: 0, lastObserved: 0 };
          }

          const obsState = observationStateRef.current[node.id];

          if (i === hoveredIdxRef.current) {
            // Collapse on hover
            obsState.collapsed = Math.min(1, obsState.collapsed + dt * (1000 / QUANTUM_CONFIG.wavefunction.collapseTime));
            obsState.lastObserved = now;
          } else {
            // Decay back to uncollapsed
            const timeSinceObserved = now - obsState.lastObserved;
            if (timeSinceObserved > 500) {
              obsState.collapsed = Math.max(0, obsState.collapsed - dt * (1000 / QUANTUM_CONFIG.wavefunction.decayTime));
            }
          }

          // Update halo position and scale
          haloDummy.position.copy(v);
          haloDummy.scale.setScalar(1.0 - obsState.collapsed * 0.5);
          haloDummy.updateMatrix();
          haloMesh.setMatrixAt(i, haloDummy.matrix);
        }
        haloMesh.count = nodeLen;
        haloMesh.instanceMatrix.needsUpdate = true;
      }

      // ── Ghost mesh (superposition states) ──
      const ghostMesh = ghostMeshRef.current;
      if (ghostMesh) {
        const ghostDummy = new THREE.Object3D();
        const tmpGhostColor = new THREE.Color();
        let ghostCount = 0;
        const now = performance.now();

        for (let i = 0; i < nodeLen; i++) {
          const node = nodesRef.current[i];
          const v = vertices[i];
          const voltage = voltageMapRef.current[node.id];

          // Only show ghosts for nodes with voltage
          if (voltage && voltage.composite > 0) {
            const voltageIntensity = Math.min(voltage.composite / 10, 1);

            // Superposition offset based on voltage and time
            const altPhase = elapsed * 3 + i * 1.7;
            const offsetScale = QUANTUM_CONFIG.superposition.maxOffset * voltageIntensity;

            ghostDummy.position.set(
              v.x + Math.sin(altPhase) * offsetScale,
              v.y + Math.cos(altPhase * 1.3) * offsetScale * 0.8,
              v.z + Math.sin(altPhase * 0.7) * offsetScale * 0.6
            );
            ghostDummy.lookAt(0, 0, 0);

            // Flickering for high voltage (critical state)
            let alpha = QUANTUM_CONFIG.superposition.ghostAlphaBase;
            alpha += QUANTUM_CONFIG.superposition.ghostAlphaVariance *
              Math.sin(elapsed * 7.3 + i) * Math.sin(elapsed * 11.1 + i * 0.7);

            if (voltageIntensity > QUANTUM_CONFIG.superposition.flickerThreshold) {
              // High-frequency flicker for critical nodes
              alpha *= 0.5 + 0.5 * Math.sin(elapsed * QUANTUM_CONFIG.superposition.flickerFrequency * 6.28);
            }

            ghostDummy.scale.setScalar(0.8 + voltageIntensity * 0.3);
            ghostDummy.updateMatrix();
            ghostMesh.setMatrixAt(ghostCount, ghostDummy.matrix);

            // Color matches axis with ghost tint
            const axis = node.axis || 'D';
            const baseColor = AXIS_COLORS[axis] || AXIS_COLORS.D;
            tmpGhostColor.copy(baseColor).multiplyScalar(0.6 + voltageIntensity * 0.4);
            ghostMesh.setColorAt(ghostCount, tmpGhostColor);

            ghostCount++;
          }

          // ── Entanglement pulse effect ──
          const entState = entanglementStateRef.current[node.id];
          if (entState) {
            const pulseAge = now - entState.triggered - entState.delay;
            if (pulseAge >= 0 && pulseAge < 500) {
              // Pulse effect: brief scale + brightness boost
              const pulsePct = pulseAge / 500;
              const pulseScale = 1 + 0.3 * Math.sin(pulsePct * Math.PI);

              // Get current matrix and apply pulse scale
              const matrix = new THREE.Matrix4();
              mesh.getMatrixAt(i, matrix);
              const position = new THREE.Vector3();
              const quaternion = new THREE.Quaternion();
              const scale = new THREE.Vector3();
              matrix.decompose(position, quaternion, scale);
              scale.multiplyScalar(pulseScale);
              matrix.compose(position, quaternion, scale);
              mesh.setMatrixAt(i, matrix);

              // Brightness pulse on main mesh
              const axis = node.axis || 'D';
              const baseColor = AXIS_COLORS[axis] || AXIS_COLORS.D;
              tmpColor.copy(baseColor).multiplyScalar(1.5 + Math.sin(pulsePct * Math.PI));
              mesh.setColorAt(i, tmpColor);
            } else if (pulseAge >= 500) {
              // Clean up finished pulse
              delete entanglementStateRef.current[node.id];
            }
          }
        }

        ghostMesh.count = ghostCount;
        ghostMesh.instanceMatrix.needsUpdate = true;
        if (ghostMesh.instanceColor) ghostMesh.instanceColor.needsUpdate = true;
      }

      // Sync rotation for connection lines
      lines.rotation.copy(mesh.rotation);
      lines.scale.copy(mesh.scale);

      // Particle aging
      const ages = points.userData.ages;
      const pPos = points.geometry.attributes.position;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (ages[i] > 0) {
          ages[i] -= dt * 1.5;
          if (ages[i] <= 0) {
            ages[i] = 0;
            pPos.setXYZ(i, 0, -999, 0);
          } else {
            // Drift outward with spread
            pPos.setX(i, pPos.getX(i) + (Math.random() - 0.5) * dt * 0.8);
            pPos.setY(i, pPos.getY(i) + dt * 1.2);
            pPos.setZ(i, pPos.getZ(i) + (Math.random() - 0.5) * dt * 0.8);
          }
        }
      }
      pPos.needsUpdate = true;

      // Raycasting for hover (scale handled in bobbing loop above)
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = raycasterRef.current.intersectObject(mesh);
      if (hits.length > 0) {
        hoveredIdxRef.current = hits[0].instanceId;
        canvas.style.cursor = 'pointer';
      } else {
        hoveredIdxRef.current = -1;
        canvas.style.cursor = 'default';
      }

      controls.update();
      composer.render();
    }

    animate();

    // ── Pointer events ──
    function onPointerMove(e) {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }
    function onPointerDown(e) {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
    }
    function onPointerUp(e) {
      const dx = e.clientX - pointerDownRef.current.x;
      const dy = e.clientY - pointerDownRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 3) return;

      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const clickHits = raycasterRef.current.intersectObject(mesh);
      if (clickHits.length > 0) {
        const idx = clickHits[0].instanceId;
        const nodes = nodesRef.current;
        if (idx < nodes.length) {
          const node = nodes[idx];
          setSelectedNode({ ...node });
          setSelectedVoltage(voltageMapRef.current[node.id] || null);
          if (vertices[idx]) spawnParticles(vertices[idx]);

          // Trigger quantum entanglement pulse to same-axis nodes
          triggerEntanglement(node.id, node.axis);
        }
      }
    }

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    // ── Resize ──
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      // Quantum effects cleanup
      if (ghostMeshRef.current) {
        ghostMeshRef.current.geometry.dispose();
        ghostMeshRef.current.material.dispose();
      }
      if (haloMeshRef.current) {
        haloMeshRef.current.geometry.dispose();
        haloMeshRef.current.material.dispose();
      }
      haloGeo.dispose();
      haloMat.dispose();
      ghostMat.dispose();
    };
  }, [updateInstancedMesh, spawnParticles, triggerEntanglement]);

  // ─── Disclosure layer ─────────────────────────────────────────────
  let layer = 2;
  if (spoons < 3) layer = 0;
  else if (spoons < 6) layer = 1;
  else if (spoons >= 9) layer = 3;

  useEffect(() => {
    if (layer === 0 && !showBreathing) setShowBreathing(true);
  }, [layer]);

  // Determine stress level for quantum CSS effects
  const stressClass = useMemo(() => {
    if (spoons < 3) return 'spoon-stress-critical';
    if (spoons < 6) return 'spoon-stress-low';
    return '';
  }, [spoons]);

  return (
    <div className={`p31-container ${stressClass}`}>
      <div className={`pulse-overlay${pulse ? ' active' : ''}`} />

      <canvas ref={canvasRef} className="dome-canvas" />

      {/* telemetry layer: controls upper overlays */}
      <div style={{ opacity: telOpacity, transition: 'opacity 0.8s ease-in-out' }}>
        <div style={{ position: 'absolute', top: 10, left: 10, color: '#4ecdc4', zIndex: 100 }}>
          Active File: {activeFile}
        </div>
        <div style={{ position: 'absolute', top: 50, left: 10, color: '#ffe66d', zIndex: 100 }}>
          🥄 Spoons: {spoons.toFixed(1)} / 12
        </div>
        <div style={{ position: 'absolute', top: 90, left: 10, color: '#a3c4dc', zIndex: 100 }}>
          🔒 Membrane: {litStatus}
        </div>
        <div style={{ position: 'absolute', top: 110, left: 10, color: '#ffe66d', fontSize: '10px', fontFamily: 'monospace', zIndex: 100 }}>
          📡 {syncStatus}
        </div>
      </div>

      {/* hardware test button */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 100 }}>
        <button
          style={{ padding: '10px', background: '#ff6b6b', color: '#000', cursor: 'pointer', border: 'none', borderRadius: '4px' }}
          onClick={() => { triggerPulse(); postMessage({ command: 'triggerHaptic', data: { intensity: 85 } }); }}
        >
          Test Thick Click
        </button>
      </div>

      <div className="hud-layout">
        {/* ── Header ── */}
        <div className="hud-header" style={{ opacity: telOpacity, transition: 'opacity 0.8s ease-in-out' }}>
          <div className="title">
            <span className="brand">P31</span>
            <span className="sub">SPACESHIP EARTH</span>
          </div>
          {layer > 0 && (
            <div className="gauge-area">
              <SpoonGauge current={spoons} onDeduct={handleDeductSpoon} onRestore={handleRestoreSpoon} />
            </div>
          )}
          <div className={`status-indicator ${overallStatus}`} title={statusTooltip}>
            <span className="status-dot" />
            <span className="status-text">
              {overallStatus === 'live' && 'LIVE'}
              {overallStatus === 'reconnecting' && 'RECONNECTING'}
              {overallStatus === 'degraded' && 'DEGRADED'}
              {overallStatus === 'offline' && 'OFFLINE'}
            </span>
            {overallStatus === 'reconnecting' && reconnectAttempt > 0 && (
              <span className="status-detail">({reconnectAttempt})</span>
            )}
            {queuedMessageCount > 0 && (
              <span className="status-detail">📤{queuedMessageCount}</span>
            )}
          </div>
        </div>

        {/* ── Main area (transparent, clicks pass through) ── */}
        <div style={{ gridArea: 'main' }} />

        {/* ── Sidebar ── */}
        <div className="hud-sidebar" style={{ opacity: hudOpacity, transition: 'opacity 0.8s ease-in-out' }}>
          <NodeInspector node={selectedNode} voltage={selectedVoltage} />
          <ActivityFeed activity={activity} />
          <StatusBar nodeCount={nodeCount} connected={connected} />
        </div>

        {/* ── Footer ── */}
        <div className="hud-footer" style={{ opacity: hudOpacity, transition: 'opacity 0.8s ease-in-out' }}>
          <span>Ctrl+K: menu</span>
          <span>I: ingest &middot; C: chat &middot; G: graph &middot; E: export &middot; B: breathe</span>
          <span>click node to inspect</span>
        </div>
      </div>

      {/* auxiliary side-panels governed by spoon opacity */}
      <div className="side-panel left" style={{ opacity: hudOpacity, transition: 'opacity 0.8s ease-in-out' }}>
        {/* Remove CommandMenu from here so it's always visible */}
        <ExportPanel open={activePanel === 'export'} onClose={() => setActivePanel(null)} activity={activity} />
        <IngestForm
          open={activePanel === 'ingest'}
          onClose={() => setActivePanel(null)}
          onSuccess={(data) => {
            triggerPulse('soft');
          }}
          onError={(msg) => {
            console.error('Ingest error:', msg);
          }}
        />
      </div>
      <div className="side-panel right" style={{ opacity: coreOpacity, transition: 'opacity 0.8s ease-in-out' }}>
        <AiChat open={activePanel === 'chat'} onClose={() => setActivePanel(null)} />
        <NodeInspector node={selectedNode} voltage={selectedVoltage} />
        <ActivityFeed activity={activity} />
      </div>

      <GraphBrain
        open={activePanel === 'brain'}
        onClose={() => setActivePanel(null)}
        nodesRef={nodesRef}
      />

      <BreathingPacer
        active={showBreathing}
        onClose={() => setShowBreathing(false)}
      />

      {/* Command menu always rendered (not faded) */}
      <CommandMenu open={showCommandMenu} onClose={() => setShowCommandMenu(false)} onAction={handleAction} />

    </div>
  );
}
