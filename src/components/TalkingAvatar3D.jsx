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
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Bounds, OrbitControls } from '@react-three/drei';

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

function AvatarModel({ src, amplitudeRef }) {
  const { scene } = useGLTF(src);
  const groupRef = React.useRef();

  const morphMeshes = React.useMemo(() => {
    const arr = [];
    scene.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) arr.push(o); });
    return arr;
  }, [scene]);

  const jaw = React.useMemo(() => findMorph(morphMeshes, JAW_CANDIDATES), [morphMeshes]);
  const blinkBoth = React.useMemo(() => findMorph(morphMeshes, BLINK_BOTH), [morphMeshes]);
  const blinkL = React.useMemo(() => findMorph(morphMeshes, BLINK_LEFT), [morphMeshes]);
  const blinkR = React.useMemo(() => findMorph(morphMeshes, BLINK_RIGHT), [morphMeshes]);

  React.useEffect(() => {
    const all = morphMeshes.flatMap((m) => Object.keys(m.morphTargetDictionary || {}));
    console.log('[TalkingAvatar3D] morph targets found:', all);
    console.log('[TalkingAvatar3D] using → jaw:', jaw?.name,
      '| blink:', blinkBoth?.name || `${blinkL?.name} / ${blinkR?.name}`);
  }, [morphMeshes, jaw, blinkBoth, blinkL, blinkR]);

  const mouth = React.useRef(0);
  const blink = React.useRef({ phase: 'idle', val: 0, next: 1.5 });

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05); // clamp to avoid jumps on slow frames

    // Mouth: smoothly chase the amplitude the parent is writing.
    const target = Math.max(0, Math.min(1, amplitudeRef?.current ?? 0));
    mouth.current += (target - mouth.current) * Math.min(1, d * 16);
    setMorph(jaw, mouth.current * 0.85);

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

export default function TalkingAvatar3D({ src, amplitudeRef }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 2], fov: 22 }}
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 4]} intensity={1.3} />
      <directionalLight position={[-3, 1, 2]} intensity={0.4} />
      <React.Suspense fallback={null}>
        <Bounds fit clip observe margin={1.15}>
          <AvatarModel src={src} amplitudeRef={amplitudeRef} />
        </Bounds>
      </React.Suspense>
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={1.1} maxPolarAngle={1.9} />
    </Canvas>
  );
}
