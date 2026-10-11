import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import silhouetteSvg from '../../../../public/brand/pardal-silhueta.svg?raw';
import { cn } from '@/lib/utils';
import { createPardalEasing } from './pardal-flight-easing';
import { createPardalScrollMemory, PARDAL_MOMENT_ATTRIBUTE, resolvePardalScroll, type PardalScrollMemory } from './pardal-flight-scroll';
import {
  advanceWingPhase,
  mirrorWingPose,
  REST_BEAT_HZ,
  resolveFlight,
  resolveFlightPoint,
  resolveFlightRibbon,
  resolveRestDrive,
  resolveWingBeat,
  resolveWingPose,
  type PardalFlight,
  type WingBeat,
  type WingPose,
} from './pardal-flight-wings';

/**
 * Para criar um momento de aproximação, adicione `data-pardal-momento` à `<section>` de destino em
 * `landing-page.tsx`; remova o atributo para a fronteira voltar ao scroll normal. A marcação é opt-in e o momento
 * acompanha a posição da fronteira tanto na descida quanto na subida.
 *
 * As asas vêm do próprio logo: o grupo `asa` do SVG (`asa-curva` + `asa-pena`) é a asa de perto e uma cópia espelhada
 * no plano do corpo é a de longe. Dobradas, as duas coincidem e o desenho é o logo oficial. A matemática da batida e
 * da trajetória fica em `pardal-flight-wings.ts`.
 */

const VIEWBOX_WIDTH = 312;
const VIEWBOX_HEIGHT = 200;
const DEPTH = 16;
const CONTENT_MAX = 1280;
const CONTENT_PADDING = 32;
// Largest circle inside `corpo-cheio` (viewBox units). The approach zooms on its center; once it covers the viewport
// diagonal, the screen is all body color.
const BODY_INNER = { x: 779, y: 330, radius: 58 };
// The logo wing in viewBox units: its root is the shoulder, at the front of `asa-curva`, and its span runs back to
// the middle of the two tips (`asa-curva` and `asa-pena`).
const WING_ROOT = { x: 806, y: 314 };
const WING_TIP = { x: 660, y: 364 };
// Attitude while the bird heads for the viewer: beak turned to the camera, back slightly tipped into view.
const HEADING_YAW = THREE.MathUtils.degToRad(42);
const HEADING_TILT = THREE.MathUtils.degToRad(10);
// Each beat rocks the body and lifts it by a share of its own height.
const BEAT_ROCK = THREE.MathUtils.degToRad(5);
const BEAT_BOB = 0.07;
// The approach runs along the section boundary, in the empty band made by the padding of the two sections.
const BAND_OFFSET = 28;
const BAND_MARGIN = 48;
// Page scroll speed (px/s) at which the resting bird's slow beat is fully on.
const FLUTTER_SCROLL_SPEED = 900;
// Logo ink per theme (`--petroleo`, `--lima-marca`); the extruded sides use a second palette color so depth reads.
const inkFor = (dark: boolean) => (dark ? { face: 0xbfe17c, side: 0x9ed6d1 } : { face: 0x164c49, side: 0xb8cda5 });

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const FOLDED: WingPose = { sweep: 0, flap: 0, twist: 0, lift: 0 };

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
  // Draw order: far wing, body fill, then the strokes and the near wing. The fill ignores depth, so it covers the far
  // wing like a solid body would and the strokes fading out on top of it never punch holes in it.
  const stroke = (g: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(g, materials);
    mesh.renderOrder = 1;
    return mesh;
  };
  bodyGeometries.forEach((g) => content.add(stroke(g)));
  fillGeometries.forEach((g) => {
    const fill = new THREE.Mesh(g, fillMaterial);
    fill.position.z = DEPTH / 2;
    fill.renderOrder = 0.5;
    content.add(fill);
  });

  // Both wings pivot on the shoulder, in the middle plane of the body. `side` is the face of the logo each one opens
  // to; folded, the two are the same drawing.
  const root = new THREE.Vector3(WING_ROOT.x, WING_ROOT.y, DEPTH / 2);
  const span = new THREE.Vector3(WING_TIP.x - WING_ROOT.x, WING_TIP.y - WING_ROOT.y, 0).normalize();
  // In the logo plane, square to the span: turning around it swings the wing out of the plane.
  const hinge = new THREE.Vector3(-span.y, span.x, 0);
  const wings = ([1, -1] as const).map((side) => {
    const pivot = new THREE.Group();
    pivot.position.copy(root);
    const meshes = wingGeometries.map((g) => {
      const mesh = stroke(g);
      mesh.position.copy(root).negate();
      pivot.add(mesh);
      return mesh;
    });
    content.add(pivot);
    return { pivot, meshes, side };
  });
  const turn = new THREE.Quaternion();
  const poseWings = (pose: WingPose) =>
    wings.forEach(({ pivot, side }) => {
      const { lift, flap, sweep, twist } = mirrorWingPose(pose, side);
      pivot.quaternion
        .setFromAxisAngle(AXIS_Z, lift)
        .multiply(turn.setFromAxisAngle(AXIS_X, flap))
        .multiply(turn.setFromAxisAngle(hinge, sweep))
        .multiply(turn.setFromAxisAngle(span, twist));
    });

  const bird = new THREE.Group();
  bird.add(content);
  const zoomCenter = new THREE.Vector3(BODY_INNER.x - center.x, center.y - BODY_INNER.y, 0);
  return { bird, wings, poseWings, zoomCenter, geometries: [...bodyGeometries, ...wingGeometries, ...fillGeometries] };
}

/**
 * Decorative 3D pardal tied to the landing scroll. At opted-in moments it flaps its way from the back of the scene to
 * the camera, opens its wings to glide when it gets near, and its body fills with the destination section's background
 * until that color covers the screen. The flight follows the scroll position in both directions; only the wing beat
 * runs on time, and only while a flight is on screen. On wide screens it rests in a side gutter between moments, wings
 * folded while the page is still. Renders on demand (scroll, resize, theme), never in an idle loop. With reduced motion
 * it is drawn once, perched next to the hero headline, without flight, wing beat or curtain.
 */
export function PardalFlight3D({ reducedMotion, wide }: { reducedMotion: boolean; wide: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollMemoryRef = useRef<PardalScrollMemory | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const tokens = getComputedStyle(document.documentElement);
    const easing = createPardalEasing((name) => tokens.getPropertyValue(name));

    const isDark = () => document.documentElement.classList.contains('dark');
    const ink = inkFor(isDark());
    const faceMaterial = new THREE.MeshBasicMaterial({ color: ink.face, side: THREE.DoubleSide, transparent: true });
    const sideMaterial = new THREE.MeshBasicMaterial({ color: ink.side, side: THREE.DoubleSide, transparent: true });
    const fillMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const coverMaterial = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
    const coverGeometry = new THREE.PlaneGeometry(1, 1);
    // A reusable triangle strip: the trail is drawn in the same WebGL canvas as the bird, with no DOM animation.
    const ribbonSegments = 128;
    const ribbonGeometry = new THREE.BufferGeometry();
    const ribbonPositions = new THREE.BufferAttribute(new Float32Array((ribbonSegments + 1) * 6), 3);
    ribbonPositions.setUsage(THREE.DynamicDrawUsage);
    ribbonGeometry.setAttribute('position', ribbonPositions);
    ribbonGeometry.setIndex(Array.from({ length: ribbonSegments }, (_, i) => {
      const vertex = i * 2;
      return [vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2];
    }).flat());
    const ribbonMaterial = new THREE.MeshBasicMaterial({
      color: ink.face, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false,
    });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.renderOrder = -0.5;
    ribbon.frustumCulled = false;
    ribbon.visible = false;
    const { bird, wings, poseWings, zoomCenter, geometries } = buildBird(faceMaterial, sideMaterial, fillMaterial);
    const disposeAll = () => {
      [...geometries, coverGeometry, ribbonGeometry].forEach((g) => g.dispose());
      [faceMaterial, sideMaterial, fillMaterial, coverMaterial, ribbonMaterial].forEach((m) => m.dispose());
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
    scene.add(cover, ribbon, bird);
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

    const state = {
      x: 0,
      y: 0,
      opacity: 0,
      vx: 0,
      vy: 0,
      progress: 0,
      section: null as HTMLElement | null,
      beatPhase: 0,
      flutter: 0,
      scrollY: window.scrollY,
    };
    type Goal = ReturnType<typeof target>;
    const approaching = () => state.section !== null && state.progress > 0.002 && state.progress < 1.998;

    const place = (goal: Goal, flight: PardalFlight | null, beat: WingBeat) => {
      ribbon.visible = false;
      cover.visible = goal.curtain !== null;
      if (goal.curtain) {
        coverMaterial.color.copy(goal.curtain.color);
        cover.scale.set(width, goal.curtain.top, 1);
        cover.position.set(width / 2, -goal.curtain.top / 2, 0);
      }

      const section = state.section;
      if (flight && section) {
        // Flying at the camera: the bird dives to the band at the boundary, runs along it to the middle of the screen
        // and grows exponentially until the body's inner circle covers the viewport. The logo strokes fade before the
        // peak so only the next section's color is left on screen, and the cover completes before the boundary so the
        // screen holds one solid color for a moment.
        const surface = surfaceOf(section);
        const startScale = goal.size / VIEWBOX_WIDTH;
        const coverScale = (1.05 * Math.hypot(width, height)) / 2 / BODY_INNER.radius;
        const scale = startScale * Math.pow(coverScale / startScale, flight.depth);
        if (inverseInk !== surface.inverse) paint(surface.inverse);
        fillMaterial.color.copy(surface.color);
        fillMaterial.opacity = flight.fill;
        const opacity = (wide ? 1 : smoothstep(0, 0.15, flight.approach)) * flight.ink;
        faceMaterial.opacity = opacity;
        sideMaterial.opacity = opacity;
        bird.scale.setScalar(scale);
        bird.position.set(0, 0, 0);
        bird.updateMatrix();
        const zoomOffset = zoomCenter.clone().applyMatrix4(bird.matrix);
        const bandY = Math.min(height - BAND_MARGIN, section.getBoundingClientRect().top + BAND_OFFSET);
        const anchors = {
          start: wide ? { x: goal.x, y: goal.y } : { x: width * (goal.facing > 0 ? 0.12 : 0.88), y: bandY },
          end: { x: width / 2 - zoomOffset.x, y: height / 2 + zoomOffset.y },
          bandY,
          centerX: width / 2,
          curveHeight: Math.min(88, height * 0.1, width * 0.14),
        };
        const point = resolveFlightPoint(flight, anchors);
        if (flight.ribbon > 0.001) {
          const points = resolveFlightRibbon(flight, anchors, easing, ribbonSegments);
          const thickness = Math.min(52, width * 0.04) * (0.5 + flight.approach);
          points.forEach((point, index) => {
            const before = points[Math.max(0, index - 1)];
            const after = points[Math.min(ribbonSegments, index + 1)];
            const dx = after.x - before.x;
            const dy = after.y - before.y;
            const length = Math.hypot(dx, dy) || 1;
            const half = thickness * Math.sin(index / ribbonSegments * Math.PI / 2) / 2;
            const nx = -dy / length * half;
            const ny = dx / length * half;
            ribbonPositions.setXYZ(index * 2, point.x + nx, -point.y - ny, 0);
            ribbonPositions.setXYZ(index * 2 + 1, point.x - nx, -point.y + ny, 0);
          });
          ribbonPositions.needsUpdate = true;
          ribbonMaterial.color.copy(faceMaterial.color);
          ribbonMaterial.opacity = flight.ribbon;
          ribbon.visible = true;
        }
        const bob = BEAT_BOB * VIEWBOX_HEIGHT * scale * beat.heave * flight.spread * (1 - flight.glide);
        bird.position.set(point.x, bob - point.y, 0);
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

      // A wheel step jumps a third of a moment at once: the flight eases to the scroll position instead of teleporting,
      // and finishes its way out when the moment ends mid-air.
      const live = goal.activeSection;
      if (live && live !== state.section) {
        state.section = live;
        state.progress = goal.progress < 1 ? 0 : 2;
      }
      const aim = live ? goal.progress : state.progress < 1 ? 0 : 2;
      state.progress += (aim - state.progress) * (1 - Math.exp(-dt * 10));
      if (!live && Math.abs(aim - state.progress) < 0.002) {
        state.section = null;
        state.progress = 0;
      }
      const local = state.progress;
      const flight = approaching() ? resolveFlight(local, easing) : null;

      // While the screen is covered, the gutter bird jumps to its new side unseen and fades back in afterwards.
      const hidden = state.section !== null && local > 0.9;
      const nextX = hidden ? goal.x : state.x + (goal.x - state.x) * follow;
      const nextY = hidden ? goal.y : state.y + (goal.y - state.y) * follow;
      const targetOpacity = hidden ? 0 : goal.opacity;
      state.vx = (nextX - state.x) / dt;
      state.vy = (nextY - state.y) / dt;
      state.x = nextX;
      state.y = nextY;
      state.opacity += (targetOpacity - state.opacity) * follow;

      // Wing beat: timed by the flight while approaching; at rest, a slow shallow beat only while the page scrolls.
      const scrollSpeed = Math.abs(window.scrollY - state.scrollY) / dt;
      state.scrollY = window.scrollY;
      const flutterAim = flight || state.opacity < 0.5 ? 0 : Math.min(1, scrollSpeed / FLUTTER_SCROLL_SPEED);
      state.flutter += (flutterAim - state.flutter) * (1 - Math.exp(-dt * (flutterAim > state.flutter ? 8 : 2.5)));
      const rest = resolveRestDrive(state.flutter);
      state.beatPhase = advanceWingPhase(state.beatPhase, flight ? flight.beatHz : REST_BEAT_HZ, dt);
      const beat = resolveWingBeat(state.beatPhase);
      poseWings(resolveWingPose(flight ? { ...flight, flick: rest.flick } : rest, beat));

      const facing = !flight && Math.abs(state.vx) > 30 ? Math.sign(state.vx) : goal.facing;
      const turn = (facing > 0 ? 0 : Math.PI) - bird.rotation.y;
      if (flight) {
        // At cover scale any turn or tilt would sweep the body off screen, so the heading is back to flat by then.
        bird.rotation.set(
          HEADING_TILT * flight.heading,
          (facing > 0 ? 0 : Math.PI) - facing * HEADING_YAW * flight.heading,
          facing * flight.bank + BEAT_ROCK * beat.heave * flight.spread * (1 - flight.glide),
        );
      } else {
        bird.rotation.y += turn * follow;
        bird.rotation.z += (THREE.MathUtils.clamp(-state.vy * 0.0012, -0.4, 0.4) * facing - bird.rotation.z) * follow;
        bird.rotation.x += (THREE.MathUtils.clamp(state.vx * 0.0006, -0.5, 0.5) - bird.rotation.x) * follow;
      }
      // The wing on the far side of the body draws first, so the body fill covers it.
      const front = Math.cos(bird.rotation.y) > 0 ? 1 : -1;
      wings.forEach(({ meshes, side }) => meshes.forEach((mesh) => (mesh.renderOrder = side === front ? 1 : 0)));

      place(goal, flight, beat);
      renderer.render(scene, camera);
      const flying = flight?.flying ?? false;
      const settled =
        !flying &&
        Math.abs(goal.x - state.x) < 0.3 &&
        Math.abs(goal.y - state.y) < 0.3 &&
        Math.abs(targetOpacity - state.opacity) < 0.01 &&
        Math.abs(aim - state.progress) < 0.001 &&
        (approaching() || (Math.abs(turn) < 0.01 && Math.abs(bird.rotation.x) + Math.abs(bird.rotation.z) < 0.01)) &&
        state.flutter < 0.01;
      if (settled) {
        if (!approaching()) {
          poseWings(FOLDED);
          renderer.render(scene, camera);
        }
        frame = 0;
        last = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const drawStill = () => {
      const goal = target();
      Object.assign(state, { x: goal.x, y: goal.y, opacity: goal.opacity, progress: 0, section: null });
      bird.rotation.set(0, goal.facing > 0 ? 0 : Math.PI, 0);
      poseWings(FOLDED);
      place(goal, null, resolveWingBeat(0));
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
    Object.assign(state, { x: start.x, y: start.y, progress: start.progress, section: start.activeSection });
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

  return <div ref={containerRef} aria-hidden data-testid="pardal-flight" className={cn('pointer-events-none inset-x-0 top-0 z-raised h-[100dvh]', reducedMotion ? 'absolute' : 'fixed')} />;
}
