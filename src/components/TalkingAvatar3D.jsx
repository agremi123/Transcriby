// Local, API-free 3D talking head. Renders a .glb avatar in the browser and
// animates it entirely client-side:
//   • idle  → periodic blink + a subtle head sway (always on)
//   • speak → mouth opens with the voice, driven by an amplitude value (0..1)
//             the parent writes into `amplitudeRef` each frame.
//
// It is model-agnostic: it scans the model's morph targets (blendshapes) and
// auto-detects the jaw/mouth-open and eye-blink shapes by their standard ARKit
// names — the same names Avaturn / Ready Player Me exports use — so swapping in
// your own face later needs no code change. Available morphs are logged once so
// we can see exactly what a given model offers.

import React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { readMouth, VISEME_IDS, CLOSED_VISEMES, ROUNDED_VISEMES } from '../lib/lipSync';

// Catches a failed/missing model load (e.g. wrong path, or a COMPRESSED glb that
// needs extra decoders) and shows a placeholder instead of crash-looping the canvas.
class ModelErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) {
    console.warn(
      '[TalkingAvatar3D] Could not load the 3D model — showing a placeholder. ' +
      'Drop an UNCOMPRESSED .glb (e.g. an Avaturn export) at the configured path. Details:',
      err?.message || err,
    );
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Simple stand-in head shown until a real avatar model is provided.
function PlaceholderHead() {
  return (
    <mesh>
      <sphereGeometry args={[0.8, 48, 48]} />
      <meshStandardMaterial color="#C9A0A8" roughness={0.65} />
    </mesh>
  );
}

// Candidate blendshape names, in priority order (ARKit + a few fallbacks).
const JAW_CANDIDATES = ['jawOpen', 'mouthOpen', 'viseme_aa', 'viseme_AA', 'mouthFunnel'];
const BLINK_BOTH = ['eyesClosed', 'blink'];
const BLINK_LEFT = ['eyeBlinkLeft', 'eyeBlink_L', 'eyesClosedL'];
const BLINK_RIGHT = ['eyeBlinkRight', 'eyeBlink_R', 'eyesClosedR'];

function findMorph(meshes, candidates) {
  for (const name of candidates) {
    const targets = [];
    meshes.forEach((m) => {
      const idx = m.morphTargetDictionary?.[name];
      if (idx !== undefined) targets.push({ mesh: m, idx });
    });
    if (targets.length) return { name, targets };
  }
  return null;
}

function setMorph(found, value) {
  if (!found) return;
  found.targets.forEach(({ mesh, idx }) => {
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = value;
  });
}

function AvatarModel({ src, amplitudeRef, targetRef }) {
  const { scene } = useGLTF(src);
  const groupRef = React.useRef();
  const { camera } = useThree();

  // Frame the camera on the HEAD (so a full-body model reads as a talking head).
  // Robust across models: prefer a bone named "Head", else use the top of the
  // bounding box. Runs once when the scene is ready.
  React.useEffect(() => {
    let headPos = null;
    scene.traverse((o) => {
      if (!headPos && o.name && /head/i.test(o.name) && o.isBone !== false) {
        headPos = o.getWorldPosition(new THREE.Vector3());
      }
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    if (!headPos) {
      // No head bone: aim near the top of the model (~top 13% of its height).
      headPos = new THREE.Vector3(center.x, box.max.y - size.y * 0.13, center.z);
    } else {
      headPos.y += size.y * 0.04; // nudge up from the neck/head joint to the face
    }
    const dist = Math.max(0.45, size.y * 0.62);
    camera.position.set(headPos.x, headPos.y, headPos.z + dist);
    camera.lookAt(headPos);
    camera.updateProjectionMatrix();
    if (targetRef) targetRef.current.copy(headPos);
  }, [scene, camera, targetRef]);

  const morphMeshes = React.useMemo(() => {
    const arr = [];
    scene.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) arr.push(o); });
    return arr;
  }, [scene]);

  const jaw = React.useMemo(() => findMorph(morphMeshes, JAW_CANDIDATES), [morphMeshes]);
  const blinkBoth = React.useMemo(() => findMorph(morphMeshes, BLINK_BOTH), [morphMeshes]);
  const blinkL = React.useMemo(() => findMorph(morphMeshes, BLINK_LEFT), [morphMeshes]);
  const blinkR = React.useMemo(() => findMorph(morphMeshes, BLINK_RIGHT), [morphMeshes]);

  // Map each lip-sync viseme id to the model's matching mouth-shape morph.
  const visemeMorphs = React.useMemo(() => {
    const map = {};
    for (const id of VISEME_IDS) {
      const found = findMorph(morphMeshes, [`viseme_${id}`, `viseme_${id.toLowerCase()}`, `viseme_${id.toUpperCase()}`]);
      if (found) map[id] = found;
    }
    return map;
  }, [morphMeshes]);

  React.useEffect(() => {
    const all = morphMeshes.flatMap((m) => Object.keys(m.morphTargetDictionary || {}));
    console.log('[TalkingAvatar3D] morph targets found:', all);
    console.log('[TalkingAvatar3D] using → jaw:', jaw?.name,
      '| blink:', blinkBoth?.name || `${blinkL?.name} / ${blinkR?.name}`,
      '| visemes:', Object.keys(visemeMorphs).join(',') || 'none');
  }, [morphMeshes, jaw, blinkBoth, blinkL, blinkR, visemeMorphs]);

  const mouth = React.useRef(0);
  const visWeights = React.useRef({});
  const blink = React.useRef({ phase: 'idle', val: 0, next: 1.5 });

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05); // clamp to avoid jumps on slow frames
    const k = Math.min(1, d * 18);   // smoothing toward targets

    // Live mouth signal: volume (openness) + current viseme (shape).
    // amplitudeRef is a legacy/manual override; the lip-sync bus is the real source.
    const { amp: lipAmp, viseme } = readMouth();
    const amp = Math.max(0, Math.min(1, Math.max(amplitudeRef?.current ?? 0, lipAmp)));
    const speaking = amp > 0.04;

    // The VISEMES carry the distinct mouth shapes (near full strength so "o", "i",
    // "p" read differently). The jaw is only a supporting opener underneath.
    const jawTarget = viseme && CLOSED_VISEMES.has(viseme) ? amp * 0.05 : amp * 0.45;
    mouth.current += (jawTarget - mouth.current) * k;
    setMorph(jaw, mouth.current * 0.9);

    for (const id of Object.keys(visemeMorphs)) {
      const active = speaking && id === viseme;
      const peak = ROUNDED_VISEMES.has(id) ? 1.0 : CLOSED_VISEMES.has(id) ? 0.95 : 0.8;
      // Strong, clearly-visible shape during speech (with a floor so it always reads).
      const target = active ? Math.min(1, 0.35 + amp * 0.65) * peak : 0;
      const cur = visWeights.current[id] ?? 0;
      const next = cur + (target - cur) * k;
      visWeights.current[id] = next;
      setMorph(visemeMorphs[id], next);
    }

    // TEMP debug — expose applied mouth values to verify distinct shapes. Remove after.
    if (typeof window !== 'undefined') {
      window.__mouthDebug = {
        jaw: +(mouth.current).toFixed(2),
        viseme,
        vw: +((visWeights.current[viseme] || 0)).toFixed(2),
      };
    }

    // Blink: simple close→open state machine on a random timer.
    const b = blink.current;
    if (b.phase === 'idle') {
      b.next -= d;
      if (b.next <= 0) b.phase = 'closing';
    } else if (b.phase === 'closing') {
      b.val = Math.min(1, b.val + d * 16);
      if (b.val >= 1) b.phase = 'opening';
    } else {
      b.val = Math.max(0, b.val - d * 12);
      if (b.val <= 0) { b.phase = 'idle'; b.next = 1.4 + Math.random() * 3.6; }
    }
    if (blinkBoth) setMorph(blinkBoth, b.val);
    else { setMorph(blinkL, b.val); setMorph(blinkR, b.val); }

    // Subtle idle sway so the head feels alive even when silent.
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.05;
      groupRef.current.rotation.x = Math.sin(t * 0.35) * 0.02;
      groupRef.current.position.y = Math.sin(t * 0.8) * 0.004;
    }
  });

  return <group ref={groupRef}><primitive object={scene} /></group>;
}

// Keeps OrbitControls pointed at the head once the model reports its position.
function HeadControls({ targetRef }) {
  const ref = React.useRef();
  useFrame(() => {
    if (ref.current && targetRef.current) {
      ref.current.target.copy(targetRef.current);
      ref.current.update();
    }
  });
  return (
    <OrbitControls
      ref={ref}
      enablePan={false}
      enableZoom={false}
      minPolarAngle={1.2}
      maxPolarAngle={1.75}
    />
  );
}

export default function TalkingAvatar3D({ src, amplitudeRef }) {
  const targetRef = React.useRef(new THREE.Vector3(0, 1.6, 0));

  // Belt-and-suspenders: nudge a resize after mount so the WebGL canvas always
  // measures its container, even if the ResizeObserver doesn't fire on mount.
  React.useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 1.6, 0.6], fov: 18 }}
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 4]} intensity={1.3} />
      <directionalLight position={[-3, 1, 2]} intensity={0.4} />
      <ModelErrorBoundary fallback={<PlaceholderHead />}>
        <React.Suspense fallback={null}>
          <AvatarModel src={src} amplitudeRef={amplitudeRef} targetRef={targetRef} />
        </React.Suspense>
      </ModelErrorBoundary>
      <HeadControls targetRef={targetRef} />
    </Canvas>
  );
}
