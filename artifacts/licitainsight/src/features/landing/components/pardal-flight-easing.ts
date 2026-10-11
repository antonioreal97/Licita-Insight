import { cubicBezier } from 'framer-motion';

/** Read the actual design-system CSS tokens once, outside the render loop. */
export function createPardalEasing(readToken: (name: string) => string) {
  const curve = (name: string) => {
    const value = readToken(name).trim();
    const match = /^cubic-bezier\(([^)]+)\)$/.exec(value);
    const points = match?.[1].split(',').map(Number);
    if (!points || points.length !== 4 || points.some((point) => !Number.isFinite(point))) {
      throw new Error(`Curva do design system inválida: ${name} (${value})`);
    }
    return cubicBezier(points[0], points[1], points[2], points[3]);
  };
  return {
    standard: curve('--ease-standard'),
    emphasized: curve('--ease-emphasized'),
    exit: curve('--ease-exit'),
  };
}

export type PardalEasing = ReturnType<typeof createPardalEasing>;
