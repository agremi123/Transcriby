3D talking-avatar models go here.

To test the avatar:
1. Create a realistic 3D head in Avaturn (https://avaturn.me) — or any tool that
   exports an UNCOMPRESSED .glb with ARKit blendshapes (jawOpen, eyeBlinkLeft/Right,
   visemes). Ready Player Me also works.
2. Export the .glb and save it here as:  sample.glb
3. Open /avatar-test in the app (or `npm run dev`) — the head should render with
   idle blink + sway, and the mouth moves when you tap "Parler (test)".

IMPORTANT: the model must be UNCOMPRESSED.
Models using KTX2 textures or meshopt/draco compression need extra decoders and
will show the placeholder instead. Avaturn's default export is fine.

The avatar component (src/components/TalkingAvatar3D.jsx) auto-detects the standard
ARKit blendshape names, so no code change is needed when you drop your model in.
