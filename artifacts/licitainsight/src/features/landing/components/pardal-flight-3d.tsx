import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import silhouetteSvg from '../../../../public/brand/pardal-silhueta.svg?raw';
import { cn } from '@/lib/utils';

const VIEWBOX_WIDTH = 312;
const DEPTH = 16;
const CONTENT_MAX = 1280;
const CONTENT_PADDING = 32;
// Half of the gap between two landing sections (`py-24` on both sides): the crossing happens inside that gap.
const CROSS_BAND = 90;

// Logo ink per theme (`--petroleo`, `--lima-marca`); the extruded sides use a second palette color so depth reads.
const inkFor = (dark: boolean) =>
  dark ? { face: 0xbfe17c, side: 0x9ed6d1 } : { face: 0x164c49, side: 0xb8cda5 };

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function buildBird(faceMaterial: THREE.Material, sideMaterial: THREE.Material) {
  const { paths } = new SVGLoader().parse(silhouetteSvg);
  const extrude = { depth: DEPTH, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1, bevelSegments: 2, curveSegments: 6 };
  const geometriesOf = (wing: boolean) =>
    paths
      .filter((p) => (p.userData?.node as Element | undefined)?.id.startsWith('asa-') === wing)
      .flatMap((p) => p.toShapes())
      .map((shape) => new THREE.ExtrudeGeometry(shape, extrude));
  const bodyGeometries = geometriesOf(false);
  const wingGeometries = geometriesOf(true);
  if (bodyGeometries.length === 0 || wingGeometries.length === 0) {
    throw new Error(`pardal-silhueta.svg sem corpo ou asa (corpo: ${bodyGeometries.length}, asa: ${wingGeometries.length})`);
  }

  const materials = [faceMaterial, sideMaterial];
  const bounds = new THREE.Box3();
  const wingBounds = new THREE.Box3();
  bodyGeometries.forEach((g) => (g.computeBoundingBox(), bounds.union(g.boundingBox!)));
  wingGeometries.forEach((g) => (g.computeBoundingBox(), wingBounds.union(g.boundingBox!)));
  bounds.union(wingBounds);
  const center = bounds.getCenter(new THREE.Vector3());

  // SVG is y-down: flip inside `content`, then center the bird on its own origin.
  const content = new THREE.Group();
  content.scale.y = -1;
  content.position.set(-center.x, center.y, -DEPTH / 2);
  bodyGeometries.forEach((g) => content.add(new THREE.Mesh(g, materials)));

  // The wing hinges on its top edge, so a rotation around x lifts it out of the logo plane.
  const hinge = new THREE.Vector3(wingBounds.getCenter(new THREE.Vector3()).x, wingBounds.min.y, 0);
  const wingPivot = new THREE.Group();
  wingPivot.position.copy(hinge);
  wingGeometries.forEach((g) => {
    const mesh = new THREE.Mesh(g, materials);
    mesh.position.set(-hinge.x, -hinge.y, 0);
    wingPivot.add(mesh);
  });
  content.add(wingPivot);

  const bird = new THREE.Group();
  bird.add(content);
  return { bird, wingPivot, geometries: [...bodyGeometries, ...wingGeometries] };
}

/**
 * Decorative 3D pardal that follows the landing scroll: it stays in a side gutter inside each section and crosses
 * to the other gutter in the gap between sections. Renders on demand (scroll, resize, theme), never in an idle loop.
 * With reduced motion it is drawn once, perched next to the hero headline, and scrolls away with the page.
 */
export function PardalFlight3D({ reducedMotion }: { reducedMotion: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = () => document.documentElement.classList.contains('dark');
    const ink = inkFor(isDark());
    const faceMaterial = new THREE.MeshBasicMaterial({ color: ink.face, side: THREE.DoubleSide, transparent: true });
    const sideMaterial = new THREE.MeshBasicMaterial({ color: ink.side, side: THREE.DoubleSide, transparent: true });
    const { bird, wingPivot, geometries } = buildBird(faceMaterial, sideMaterial);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (error) {
      console.error('PardalFlight3D: WebGL indisponível, o pardal 3D não será exibido.', error);
      geometries.forEach((g) => g.dispose());
      faceMaterial.dispose();
      sideMaterial.dispose();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(bird);
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);

    let width = 0;
    let height = 0;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      // At z = 0, one world unit is one CSS pixel; screen y grows down, world y grows up.
      camera.position.set(width / 2, -height / 2, height / 2 / Math.tan(THREE.MathUtils.degToRad(15)));
      camera.updateProjectionMatrix();
    };
    resize();

    const sections = () => Array.from(document.querySelectorAll<HTMLElement>('#conteudo > section'));

    const target = () => {
      const gutter = (width - Math.min(width, CONTENT_MAX)) / 2 + CONTENT_PADDING;
      const sideX = (i: number) => (i % 2 === 0 ? gutter / 2 : width - gutter / 2);
      const anchorY = height * 0.38;
      const scrollOffset = reducedMotion ? window.scrollY : 0;
      const list = sections();
      const tops = list.map((s) => s.getBoundingClientRect().top + scrollOffset);
      const current = list[tops.findLastIndex((top) => top <= anchorY)];
      let x = sideX(0);
      let y = anchorY;
      let opacity = 1;
      for (let k = 1; k < tops.length; k++) {
        const t = smoothstep(-CROSS_BAND, CROSS_BAND, anchorY - tops[k]);
        if (k === tops.length - 1) {
          opacity = 1 - t;
        } else {
          x += (sideX(k) - x) * t;
        }
        y -= Math.sin(Math.PI * t) * 48;
      }
      return {
        x,
        y,
        opacity,
        size: Math.min(104, Math.max(56, gutter - 28)),
        facing: x < width / 2 ? 1 : -1,
        // Over a full-bleed inverse section the theme ink would vanish, so the bird takes the other theme's ink.
        inverse: current?.classList.contains('bg-superficie-inversa') ?? false,
      };
    };

    let inverseInk = false;
    const paint = (inverse: boolean) => {
      inverseInk = inverse;
      const next = inkFor(isDark() !== inverse);
      faceMaterial.color.setHex(next.face);
      sideMaterial.color.setHex(next.side);
    };

    const state = { x: 0, y: 0, opacity: 0, vx: 0, vy: 0, flapAmp: 0, flapPhase: 0 };
    const place = (size: number, inverse: boolean) => {
      if (inverse !== inverseInk) paint(inverse);
      const scale = size / VIEWBOX_WIDTH;
      bird.scale.setScalar(scale);
      bird.position.set(state.x, -state.y, 0);
      faceMaterial.opacity = state.opacity;
      sideMaterial.opacity = state.opacity;
      bird.visible = state.opacity > 0.01;
    };

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const goal = target();
      const follow = 1 - Math.exp(-dt * 7);
      const nextX = state.x + (goal.x - state.x) * follow;
      const nextY = state.y + (goal.y - state.y) * follow;
      state.vx = (nextX - state.x) / dt;
      state.vy = (nextY - state.y) / dt;
      state.x = nextX;
      state.y = nextY;
      state.opacity += (goal.opacity - state.opacity) * follow;

      const facing = Math.abs(state.vx) > 30 ? Math.sign(state.vx) : goal.facing;
      bird.rotation.y += ((facing > 0 ? 0 : Math.PI) - bird.rotation.y) * follow;
      bird.rotation.z += (THREE.MathUtils.clamp(-state.vy * 0.0012, -0.4, 0.4) * facing - bird.rotation.z) * follow;
      bird.rotation.x += (THREE.MathUtils.clamp(state.vx * 0.0006, -0.5, 0.5) - bird.rotation.x) * follow;

      const speed = Math.hypot(state.vx, state.vy);
      state.flapAmp += (Math.min(0.9, speed / 500) - state.flapAmp) * follow;
      state.flapPhase += dt * 16;
      wingPivot.rotation.x = Math.sin(state.flapPhase) * state.flapAmp;

      place(goal.size, goal.inverse);
      renderer.render(scene, camera);

      const settled =
        Math.abs(goal.x - state.x) < 0.3 &&
        Math.abs(goal.y - state.y) < 0.3 &&
        Math.abs(goal.opacity - state.opacity) < 0.01 &&
        state.flapAmp < 0.01;
      if (settled) {
        wingPivot.rotation.x = 0;
        renderer.render(scene, camera);
        frame = 0;
        last = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const drawStill = () => {
      const goal = target();
      Object.assign(state, { x: goal.x, y: goal.y, opacity: goal.opacity });
      bird.rotation.set(0, goal.facing > 0 ? 0 : Math.PI, 0);
      place(goal.size, goal.inverse);
      renderer.render(scene, camera);
    };

    const kick = () => {
      if (reducedMotion) return drawStill();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onResize = () => {
      resize();
      kick();
    };
    const themeObserver = new MutationObserver(() => {
      paint(inverseInk);
      kick();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Live data (facts, tender preview) changes section heights after the first paint.
    const layoutObserver = new ResizeObserver(kick);
    const main = document.getElementById('conteudo');
    if (main) layoutObserver.observe(main);
    window.addEventListener('resize', onResize);
    if (!reducedMotion) window.addEventListener('scroll', kick, { passive: true });

    const start = target();
    Object.assign(state, { x: start.x, y: start.y });
    bird.rotation.y = start.facing > 0 ? 0 : Math.PI;
    kick();

    return () => {
      cancelAnimationFrame(frame);
      themeObserver.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', kick);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      geometries.forEach((g) => g.dispose());
      faceMaterial.dispose();
      sideMaterial.dispose();
    };
  }, [reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn(
        'pointer-events-none inset-x-0 top-0 z-raised h-[100dvh]',
        reducedMotion ? 'absolute' : 'fixed',
      )}
    />
  );
}
