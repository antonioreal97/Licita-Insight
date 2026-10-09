import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import silhouetteSvg from '../../../../public/brand/pardal-silhueta.svg?raw';
import { cn } from '@/lib/utils';
import { createPardalScrollMemory, PARDAL_MOMENT_ATTRIBUTE, resolvePardalScroll, type PardalScrollMemory } from './pardal-flight-scroll';

/**
 * Para criar um momento de aproximação, adicione `data-pardal-momento` à `<section>` de destino em
 * `landing-page.tsx`; remova o atributo para a fronteira voltar ao scroll normal. A marcação é opt-in e o momento
 * acompanha a posição da fronteira tanto na descida quanto na subida.
 */

const VIEWBOX_WIDTH = 312;
const DEPTH = 16;
const CONTENT_MAX = 1280;
const CONTENT_PADDING = 32;
// Largest circle inside `corpo-cheio` (viewBox units). The approach zooms on its center; once it covers the viewport
// diagonal, the screen is all body color.
const BODY_INNER = { x: 779, y: 330, radius: 58 };
// Logo ink per theme (`--petroleo`, `--lima-marca`); the extruded sides use a second palette color so depth reads.
const inkFor = (dark: boolean) => (dark ? { face: 0xbfe17c, side: 0x9ed6d1 } : { face: 0x164c49, side: 0xb8cda5 });

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function buildBird(faceMaterial: THREE.Material, sideMaterial: THREE.Material, fillMaterial: THREE.Material) {
  const { paths } = new SVGLoader().parse(silhouetteSvg);
  const extrude = { depth: DEPTH, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1, bevelSegments: 2, curveSegments: 6 };
  const shapesOf = (id: (nodeId: string) => boolean) =>
    paths.filter((p) => id((p.userData?.node as Element | undefined)?.id ?? '')).flatMap((p) => p.toShapes());
  const bodyShapes = shapesOf((id) => id !== 'corpo-cheio' && !id.startsWith('asa-'));
  const wingShapes = shapesOf((id) => id.startsWith('asa-'));
  // The logo outline is open at the tail; `corpo-cheio` is the solid body that carries the next section's color.
  const fillShapes = shapesOf((id) => id === 'corpo-cheio');
  if (bodyShapes.length === 0 || wingShapes.length === 0 || fillShapes.length === 0) {
    throw new Error(`pardal-silhueta.svg incompleto (traços: ${bodyShapes.length}, asa: ${wingShapes.length}, corpo-cheio: ${fillShapes.length})`);
  }
  const bodyGeometries = bodyShapes.map((shape) => new THREE.ExtrudeGeometry(shape, extrude));
  const wingGeometries = wingShapes.map((shape) => new THREE.ExtrudeGeometry(shape, extrude));
  const fillGeometries = fillShapes.map((shape) => new THREE.ShapeGeometry(shape, 6));

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
  // Strokes draw after the fill: while they fade out they still write depth and would otherwise punch holes in it.
  const stroke = (g: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(g, materials);
    mesh.renderOrder = 1;
    return mesh;
  };
  bodyGeometries.forEach((g) => content.add(stroke(g)));
  fillGeometries.forEach((g) => {
    const fill = new THREE.Mesh(g, fillMaterial);
    fill.position.z = DEPTH / 2;
    content.add(fill);
  });

  // The wing hinges on its top edge, so a rotation around x lifts it out of the logo plane.
  const hinge = new THREE.Vector3(wingBounds.getCenter(new THREE.Vector3()).x, wingBounds.min.y, 0);
  const wingPivot = new THREE.Group();
  wingPivot.position.copy(hinge);
  wingGeometries.forEach((g) => {
    const mesh = stroke(g);
    mesh.position.set(-hinge.x, -hinge.y, 0);
    wingPivot.add(mesh);
  });
  content.add(wingPivot);

  const bird = new THREE.Group();
  bird.add(content);
  const zoomCenter = new THREE.Vector3(BODY_INNER.x - center.x, center.y - BODY_INNER.y, 0);
  return { bird, wingPivot, zoomCenter, geometries: [...bodyGeometries, ...wingGeometries, ...fillGeometries] };
}

/**
 * Decorative 3D pardal tied to the landing scroll. At opted-in moments it flies at the camera, its body filling with
 * the destination section's background, until that color covers the screen. On wide screens it rests in a side
 * gutter between moments. Renders on demand (scroll, resize, theme), never in an idle loop. With reduced motion it is
 * drawn once, perched next to the hero headline, without flight or curtain.
 */
export function PardalFlight3D({ reducedMotion, wide }: { reducedMotion: boolean; wide: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollMemoryRef = useRef<PardalScrollMemory | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = () => document.documentElement.classList.contains('dark');
    const ink = inkFor(isDark());
    const faceMaterial = new THREE.MeshBasicMaterial({ color: ink.face, side: THREE.DoubleSide, transparent: true });
    const sideMaterial = new THREE.MeshBasicMaterial({ color: ink.side, side: THREE.DoubleSide, transparent: true });
    const fillMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0 });
    const coverMaterial = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
    const coverGeometry = new THREE.PlaneGeometry(1, 1);
    const { bird, wingPivot, zoomCenter, geometries } = buildBird(faceMaterial, sideMaterial, fillMaterial);
    const disposeAll = () => {
      [...geometries, coverGeometry].forEach((g) => g.dispose());
      [faceMaterial, sideMaterial, fillMaterial, coverMaterial].forEach((m) => m.dispose());
    };

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (error) {
      console.error('PardalFlight3D: WebGL indisponível, o pardal 3D não será exibido.', error);
      disposeAll();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cover = new THREE.Mesh(coverGeometry, coverMaterial);
    cover.renderOrder = -1;
    scene.add(cover, bird);
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

    const main = document.getElementById('conteudo');
    const sections = () => Array.from(document.querySelectorAll<HTMLElement>('#conteudo > section'));
    const surfaceOf = (section: HTMLElement) => {
      const own = getComputedStyle(section).backgroundColor;
      const transparent = own === 'transparent' || own === 'rgba(0, 0, 0, 0)';
      return {
        color: new THREE.Color(transparent && main?.parentElement ? getComputedStyle(main.parentElement).backgroundColor : own),
        // Full-bleed inverse sections need the other theme's ink, or the logo vanishes on them.
        inverse: section.classList.contains('bg-superficie-inversa'),
      };
    };

    const target = () => {
      const gutter = (width - Math.min(width, CONTENT_MAX)) / 2 + CONTENT_PADDING;
      const sideX = (i: number) => (i % 2 === 0 ? gutter / 2 : width - gutter / 2);
      const list = sections();
      const viewportTops = list.map((section) => section.getBoundingClientRect().top);
      const displayTops = viewportTops.map((top) => top + (reducedMotion ? window.scrollY : 0));
      // The cover peaks when a boundary reaches the middle of the screen.
      const distance = displayTops.map((top) => height / 2 - top);
      const current = Math.max(
        0,
        distance.findLastIndex((d) => d >= 0),
      );
      scrollMemoryRef.current ??= createPardalScrollMemory(window.scrollY);
      const scroll = resolvePardalScroll(
        {
          reducedMotion,
          scrollY: window.scrollY,
          sections: list.map((section, index) => ({
            key: section.id || `section-${index}`,
            moment: section.hasAttribute(PARDAL_MOMENT_ATTRIBUTE),
            top: viewportTops[index],
          })),
          viewportHeight: height,
        },
        scrollMemoryRef.current,
      );
      scrollMemoryRef.current = scroll.memory;

      const x = sideX(scroll.restingSide);
      const size = Math.min(104, Math.max(56, gutter - 28));
      const pastLast = list.length > 1 && distance[list.length - 1] >= 0;
      const activeIndex = list.findIndex((section, index) => (section.id || `section-${index}`) === scroll.activeKey);
      const curtainIndex = list.findIndex((section, index) => (section.id || `section-${index}`) === scroll.curtainKey);

      return {
        activeSection: activeIndex >= 0 ? list[activeIndex] : null,
        x,
        y: height * 0.38,
        size,
        facing: x < width / 2 ? 1 : -1,
        inverse: list[current] ? surfaceOf(list[current]).inverse : false,
        opacity: wide && !pastLast ? 1 : 0,
        progress: scroll.localProgress,
        curtain: curtainIndex >= 0 ? { top: viewportTops[curtainIndex], color: surfaceOf(list[curtainIndex]).color } : null,
      };
    };

    let inverseInk: boolean | null = null;
    const paint = (inverse: boolean) => {
      inverseInk = inverse;
      const next = inkFor(isDark() !== inverse);
      faceMaterial.color.setHex(next.face);
      sideMaterial.color.setHex(next.side);
    };

    const state = { x: 0, y: 0, opacity: 0, vx: 0, vy: 0, flapAmp: 0, flapPhase: 0, progress: 0 };
    type Goal = ReturnType<typeof target>;

    const place = (goal: Goal) => {
      cover.visible = goal.curtain !== null;
      if (goal.curtain) {
        coverMaterial.color.copy(goal.curtain.color);
        cover.scale.set(width, goal.curtain.top, 1);
        cover.position.set(width / 2, -goal.curtain.top / 2, 0);
      }

      const section = goal.activeSection;
      const local = state.progress;
      if (local > 0.002 && local < 1.998 && section) {
        // Flying at the camera: the body's inner circle travels to the middle of the screen while the bird grows
        // exponentially. The logo strokes fade before the peak so only the next section's color is left on screen, and the
        // cover completes before the boundary so the screen holds one solid color for a moment.
        const a = clamp01(local / 0.9);
        const surface = surfaceOf(section);
        const startScale = goal.size / VIEWBOX_WIDTH;
        const coverScale = (1.05 * Math.hypot(width, height)) / 2 / BODY_INNER.radius;
        const startX = wide ? goal.x : width * 0.5;
        const startY = wide ? goal.y : height * 0.85;
        const glide = smoothstep(0, 1, a);
        const fade = 1 - clamp01(local - 1);
        if (inverseInk !== surface.inverse) paint(surface.inverse);
        fillMaterial.color.copy(surface.color);
        fillMaterial.opacity = smoothstep(0.1, 0.45, a) * fade;
        const opacity = (wide ? 1 : smoothstep(0, 0.15, a)) * (1 - smoothstep(0.7, 0.97, a));
        faceMaterial.opacity = opacity;
        sideMaterial.opacity = opacity;
        bird.scale.setScalar(startScale * Math.pow(coverScale / startScale, a * a * a));
        bird.position.set(0, 0, 0);
        bird.updateMatrix();
        const zoomOffset = zoomCenter.clone().applyMatrix4(bird.matrix);
        bird.position.set(startX + (width / 2 - zoomOffset.x - startX) * glide, -startY + (-height / 2 - zoomOffset.y + startY) * glide, 0);
        bird.visible = true;
        return;
      }

      if (inverseInk !== goal.inverse) paint(goal.inverse);
      fillMaterial.opacity = 0;
      bird.scale.setScalar(goal.size / VIEWBOX_WIDTH);
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

      // While the screen is covered, the gutter bird jumps to its new side unseen and fades back in afterwards.
      const previousProgress = state.progress;
      state.progress = goal.progress;
      const local = state.progress;
      const approaching = goal.activeSection !== null && local > 0.002 && local < 1.998;
      const hidden = goal.activeSection !== null && local > 0.9;
      const nextX = hidden ? goal.x : state.x + (goal.x - state.x) * follow;
      const nextY = hidden ? goal.y : state.y + (goal.y - state.y) * follow;
      const targetOpacity = hidden ? 0 : goal.opacity;
      state.vx = (nextX - state.x) / dt;
      state.vy = (nextY - state.y) / dt;
      state.x = nextX;
      state.y = nextY;
      state.opacity += (targetOpacity - state.opacity) * follow;
      const approachSpeed = Math.abs(goal.progress - previousProgress) / dt;

      // At cover scale any turn or tilt would sweep the body off screen, so the approach flies flat and keeps its side.
      const facing = !approaching && Math.abs(state.vx) > 30 ? Math.sign(state.vx) : goal.facing;
      const turn = (facing > 0 ? 0 : Math.PI) - bird.rotation.y;
      if (approaching) {
        bird.rotation.set(0, facing > 0 ? 0 : Math.PI, 0);
      } else {
        bird.rotation.y += turn * follow;
        bird.rotation.z += (THREE.MathUtils.clamp(-state.vy * 0.0012, -0.4, 0.4) * facing - bird.rotation.z) * follow;
        bird.rotation.x += (THREE.MathUtils.clamp(state.vx * 0.0006, -0.5, 0.5) - bird.rotation.x) * follow;
      }

      const speed = hidden ? 0 : Math.hypot(state.vx, state.vy) + approachSpeed * 400;
      state.flapAmp += (Math.min(0.9, speed / 500) - state.flapAmp) * follow;
      state.flapPhase += dt * 16;
      wingPivot.rotation.x = Math.sin(state.flapPhase) * state.flapAmp;

      place(goal);
      renderer.render(scene, camera);
      const settled =
        Math.abs(goal.x - state.x) < 0.3 &&
        Math.abs(goal.y - state.y) < 0.3 &&
        Math.abs(targetOpacity - state.opacity) < 0.01 &&
        Math.abs(goal.progress - state.progress) < 0.001 &&
        Math.abs(turn) < 0.01 &&
        Math.abs(bird.rotation.x) + Math.abs(bird.rotation.z) < 0.01 &&
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
      Object.assign(state, { x: goal.x, y: goal.y, opacity: goal.opacity, progress: 0 });
      bird.rotation.set(0, goal.facing > 0 ? 0 : Math.PI, 0);
      place(goal);
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
      if (inverseInk !== null) paint(inverseInk);
      kick();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Live data (facts, tender preview) changes section heights after the first paint.
    const layoutObserver = new ResizeObserver(kick);
    if (main) layoutObserver.observe(main);
    window.addEventListener('resize', onResize);
    if (!reducedMotion) window.addEventListener('scroll', kick, { passive: true });

    const start = target();
    Object.assign(state, { x: start.x, y: start.y, progress: start.progress });
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
      disposeAll();
    };
  }, [reducedMotion, wide]);

  return <div ref={containerRef} aria-hidden className={cn('pointer-events-none inset-x-0 top-0 z-raised h-[100dvh]', reducedMotion ? 'absolute' : 'fixed')} />;
}
