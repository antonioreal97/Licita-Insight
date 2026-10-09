import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

interface RadarGlobe3DProps {
  className?: string;
  interactive?: boolean;
}

// Coordinates roughly distributed across Brazilian regions and orbital radar satellites
const BRAZIL_NODE_COORDINATES: [number, number, number][] = [
  // DF / Centro-Oeste
  [0.0, 0.2, 1.45],
  [0.2, 0.1, 1.46],
  [-0.2, 0.05, 1.47],
  // Sudeste (SP, RJ, MG, ES)
  [0.35, -0.3, 1.42],
  [0.55, -0.25, 1.37],
  [0.4, -0.1, 1.44],
  [0.6, -0.15, 1.38],
  // Sul (PR, SC, RS)
  [0.25, -0.6, 1.34],
  [0.2, -0.8, 1.25],
  [0.1, -1.0, 1.1],
  // Nordeste (BA, PE, CE, RN, etc.)
  [0.65, 0.15, 1.33],
  [0.8, 0.35, 1.22],
  [0.75, 0.55, 1.15],
  [0.55, 0.65, 1.28],
  [0.4, 0.7, 1.31],
  // Norte (AM, PA, RO, TO, etc.)
  [-0.6, 0.5, 1.25],
  [-0.2, 0.6, 1.35],
  [0.1, 0.7, 1.31],
  [-0.4, 0.2, 1.41],
  [-0.7, 0.1, 1.32],
  // Orbital telemetry satellites (outer ring)
  [1.3, 0.8, 0.9],
  [-1.2, 0.9, 0.8],
  [0.8, -1.2, 0.8],
  [-0.9, -1.1, 0.8],
  [1.4, -0.4, 0.9],
  [-1.5, 0.1, 0.8],
  [0.2, 1.6, 0.6],
];

export function RadarGlobe3D({ className = '', interactive = true }: RadarGlobe3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !containerRef.current) return;

    const container = containerRef.current;
    let animationFrameId: number;
    let isVisible = true;

    // Respect user's motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Scene setup
    const scene = new THREE.Scene();

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.8;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Theme color detector
    const isDark = () => document.documentElement.classList.contains('dark');

    const getThemeColors = () => {
      if (isDark()) {
        return {
          coreWireframe: 0x164c49,
          rings: 0xb8cda5, // Salvia
          accent: 0xd9f58b, // Lima
          secondary: 0x9ed6d1, // Aqua
          nodes: 0xb8cda5,
          sweep: 0xd9f58b,
        };
      }
      return {
        coreWireframe: 0xcbd0c8, // Nevoa
        rings: 0x164c49, // Petroleo
        accent: 0x164c49, // Petroleo
        secondary: 0x7d9e68, // Salvia dark
        nodes: 0x164c49,
        sweep: 0x164c49,
      };
    };

    let colors = getThemeColors();

    // 3D Objects Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 1. Globe Core (Icosahedron Wireframe)
    const globeGeometry = new THREE.IcosahedronGeometry(1.5, 2);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: colors.coreWireframe,
      wireframe: true,
      transparent: true,
      opacity: isDark() ? 0.35 : 0.28,
    });
    const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    rootGroup.add(globeMesh);

    // 2. Orbital Radar Rings
    const ring1Geometry = new THREE.RingGeometry(1.9, 1.93, 64);
    const ring1Material = new THREE.MeshBasicMaterial({
      color: colors.rings,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isDark() ? 0.45 : 0.35,
    });
    const ring1 = new THREE.Mesh(ring1Geometry, ring1Material);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 6;
    rootGroup.add(ring1);

    const ring2Geometry = new THREE.RingGeometry(2.1, 2.12, 64);
    const ring2Material = new THREE.MeshBasicMaterial({
      color: colors.secondary,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isDark() ? 0.3 : 0.25,
    });
    const ring2 = new THREE.Mesh(ring2Geometry, ring2Material);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = -Math.PI / 5;
    rootGroup.add(ring2);

    // 3. Telemetry Nodes (Data Points)
    const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
    const nodeMaterial = new THREE.MeshBasicMaterial({
      color: colors.accent,
      transparent: true,
      opacity: 0.9,
    });

    const nodesGroup = new THREE.Group();
    BRAZIL_NODE_COORDINATES.forEach(([x, y, z]) => {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.set(x, y, z);
      nodesGroup.add(node);
    });
    rootGroup.add(nodesGroup);

    // 4. Connecting Constellation Lines
    const linePositions: number[] = [];
    for (let i = 0; i < BRAZIL_NODE_COORDINATES.length; i++) {
      for (let j = i + 1; j < BRAZIL_NODE_COORDINATES.length; j++) {
        const [x1, y1, z1] = BRAZIL_NODE_COORDINATES[i];
        const [x2, y2, z2] = BRAZIL_NODE_COORDINATES[j];
        const distance = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
        if (distance < 0.65) {
          linePositions.push(x1, y1, z1, x2, y2, z2);
        }
      }
    }

    const linesGeometry = new THREE.BufferGeometry();
    linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const linesMaterial = new THREE.LineBasicMaterial({
      color: colors.rings,
      transparent: true,
      opacity: isDark() ? 0.35 : 0.25,
    });
    const constellationLines = new THREE.LineSegments(linesGeometry, linesMaterial);
    rootGroup.add(constellationLines);

    // 5. Radar Sweep Beam (Radial line)
    const sweepGeometry = new THREE.BufferGeometry();
    const sweepCoords = [0, 0, 0, 1.7, 0, 0];
    sweepGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sweepCoords, 3));
    const sweepMaterial = new THREE.LineBasicMaterial({
      color: colors.sweep,
      transparent: true,
      opacity: 0.8,
    });
    const sweepLine = new THREE.Line(sweepGeometry, sweepMaterial);
    sweepLine.rotation.z = Math.PI / 4;
    rootGroup.add(sweepLine);

    // Interaction handling (smooth mouse follow)
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      mouseX = x;
      mouseY = y;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    // Theme mutation observer to dynamically refresh materials
    const observer = new MutationObserver(() => {
      colors = getThemeColors();
      globeMaterial.color.setHex(colors.coreWireframe);
      globeMaterial.opacity = isDark() ? 0.35 : 0.28;
      ring1Material.color.setHex(colors.rings);
      ring2Material.color.setHex(colors.secondary);
      nodeMaterial.color.setHex(colors.accent);
      linesMaterial.color.setHex(colors.rings);
      sweepMaterial.color.setHex(colors.sweep);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Intersection observer to pause rendering offscreen
    const io = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    io.observe(container);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (!isVisible) return;

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Continuous orbital rotation
        rootGroup.rotation.y += delta * 0.22;
        ring1.rotation.z += delta * 0.15;
        ring2.rotation.z -= delta * 0.12;
        sweepLine.rotation.z += delta * 1.8;

        // Subtle node pulsing
        const scale = 1 + Math.sin(elapsedTime * 2.5) * 0.08;
        nodesGroup.scale.set(scale, scale, scale);
      }

      // Smooth mouse follow interpolation
      targetRotationY = mouseX * 0.45;
      targetRotationX = mouseY * 0.35;
      rootGroup.rotation.x += (targetRotationX - rootGroup.rotation.x) * 0.05;
      rootGroup.rotation.z += (targetRotationY - rootGroup.rotation.z) * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      io.disconnect();
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      if (interactive) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      globeGeometry.dispose();
      globeMaterial.dispose();
      ring1Geometry.dispose();
      ring1Material.dispose();
      ring2Geometry.dispose();
      ring2Material.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      linesGeometry.dispose();
      linesMaterial.dispose();
      sweepGeometry.dispose();
      sweepMaterial.dispose();
    };
  }, [isClient, interactive]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Globo 3D interativo de telemetria nacional do PNCP"
      className={cn('relative flex items-center justify-center overflow-hidden', className)}
    />
  );
}
