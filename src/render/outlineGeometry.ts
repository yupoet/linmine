import type { BufferGeometry } from 'three';

/**
 * Clone a geometry with every vertex pushed `distance` along its own normal.
 *
 * This is how the candy skin gets its chocolate outline: the clone is drawn
 * with `side: BackSide`, so only the parts of the shell that stick out past the
 * real surface survive the depth test and read as a line of constant width.
 *
 * It has to be a geometry offset rather than `mesh.scale`. The outline hull
 * shares the block field's `instanceMatrix`, and an object scale multiplies the
 * per-instance *translations* too — the whole mine would fly apart. A geometry
 * offset also keeps the line width even on a rounded box, where a uniform scale
 * would thin the outline on the flat faces and fatten it on the corners.
 *
 * Called once per skin rebuild, never per frame.
 */
export function extrudeAlongNormals(geometry: BufferGeometry, distance: number): BufferGeometry {
  const hull = geometry.clone();
  const position = hull.getAttribute('position');
  const normal = hull.getAttribute('normal');
  if (!position || !normal) return hull;

  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * distance,
      position.getY(i) + normal.getY(i) * distance,
      position.getZ(i) + normal.getZ(i) * distance,
    );
  }
  position.needsUpdate = true;
  hull.computeBoundingSphere();
  return hull;
}
