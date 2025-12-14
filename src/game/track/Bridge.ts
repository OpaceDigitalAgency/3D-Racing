import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { ExtrudeShape } from "@babylonjs/core/Meshes/Builders/shapeBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

export type BridgeInfo = {
  start: Vector3;
  end: Vector3;
  width: number;
  height: number;
  rampLength: number;
  direction: Vector3;
  rotation: number;
};

type BridgeRouteInfo = {
  width: number;
  path: Vector3[]; // contains world-space x/y/z points for the drivable surface centerline
};

export class BridgeSystem {
  readonly bridges: BridgeInfo[] = [];
  private readonly routes: BridgeRouteInfo[] = [];

  constructor(private scene: Scene, private shadowGen?: ShadowGenerator) {}

  // Add a bridge connecting two points with proper ramps
  addBridge(startX: number, startZ: number, endX: number, endZ: number, width: number = 10, height: number = 3) {
    const start = new Vector3(startX, 0, startZ);
    const end = new Vector3(endX, 0, endZ);
    const dir = end.subtract(start).normalize();
    const rotation = Math.atan2(dir.x, dir.z);
    const rampLength = height * 4;  // Gentle slope - 4:1 ratio

    const bridgeInfo: BridgeInfo = { start, end, width, height, rampLength, direction: dir, rotation };
    this.bridges.push(bridgeInfo);

    this.createBridgeMesh(bridgeInfo);

    return bridgeInfo;
  }

  // Curved overpass route that starts on the road, rises and curves into the infield, then rejoins later.
  // This creates a realistic on-ramp/off-ramp alternative path.
  addCurvedOverpass(opts: {
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    deckX: number;
    deckStartZ: number;
    deckEndZ: number;
    width?: number;
    height?: number;
  }) {
    const width = opts.width ?? 10;
    const height = opts.height ?? 3;

    const p0 = new Vector3(opts.startX, 0, opts.startZ);
    const p1 = new Vector3(opts.startX, 0, (opts.startZ + opts.deckStartZ) * 0.5);
    const p2 = new Vector3(opts.deckX, 0, (opts.startZ + opts.deckStartZ) * 0.5);
    const p3 = new Vector3(opts.deckX, 0, opts.deckStartZ);

    const q0 = new Vector3(opts.deckX, 0, opts.deckEndZ);
    const q1 = new Vector3(opts.deckX, 0, (opts.endZ + opts.deckEndZ) * 0.5);
    const q2 = new Vector3(opts.endX, 0, (opts.endZ + opts.deckEndZ) * 0.5);
    const q3 = new Vector3(opts.endX, 0, opts.endZ);

    const rampSteps = 36;
    const deckSteps = 24;
    const path: Vector3[] = [];

    const cubic = (a: number, b: number, c: number, d: number, t: number) => {
      const it = 1 - t;
      return it * it * it * a + 3 * it * it * t * b + 3 * it * t * t * c + t * t * t * d;
    };

    // Ease-in-out cubic (same shape used for ramps elsewhere).
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    // Minimum elevation to prevent z-fighting with ground
    const minElevation = 0.15;

    for (let i = 0; i <= rampSteps; i++) {
      const t = i / rampSteps;
      const x = cubic(p0.x, p1.x, p2.x, p3.x, t);
      const z = cubic(p0.z, p1.z, p2.z, p3.z, t);
      // Add minimum elevation to prevent z-fighting at ground level
      const y = minElevation + ease(t) * (height - minElevation);
      path.push(new Vector3(x, y, z));
    }

    for (let i = 1; i <= deckSteps; i++) {
      const t = i / deckSteps;
      const x = opts.deckX;
      const z = opts.deckStartZ + (opts.deckEndZ - opts.deckStartZ) * t;
      path.push(new Vector3(x, height, z));
    }

    for (let i = 1; i <= rampSteps; i++) {
      const t = i / rampSteps;
      const x = cubic(q0.x, q1.x, q2.x, q3.x, t);
      const z = cubic(q0.z, q1.z, q2.z, q3.z, t);
      // Add minimum elevation to prevent z-fighting at ground level
      const y = minElevation + ease(1 - t) * (height - minElevation);
      path.push(new Vector3(x, y, z));
    }

    this.routes.push({ width, path });
    this.createCurvedOverpassMesh({ width, height, path });
  }

  private createCurvedOverpassMesh(info: { width: number; height: number; path: Vector3[] }) {
    const { width, path } = info;

    const deckMat = new PBRMaterial("overpassDeckMat", this.scene);
    deckMat.albedoColor = new Color3(0.2, 0.2, 0.22);
    deckMat.roughness = 0.85;
    deckMat.metallic = 0.05;
    // Prevent z-fighting with ground
    deckMat.zOffset = -2;

    // Railing material - red/white safety (matching straight bridges)
    const railMat = new PBRMaterial("overpassRailMat", this.scene);
    railMat.albedoColor = new Color3(0.9, 0.2, 0.15);
    railMat.roughness = 0.5;
    railMat.metallic = 0.2;

    const roadShape = [
      new Vector3(-width / 2, 0.12, 0),
      new Vector3(width / 2, 0.12, 0),
      new Vector3(width / 2, 0.0, 0),
      new Vector3(-width / 2, 0.0, 0)
    ];

    const mesh = ExtrudeShape(
      "overpassRoad",
      { shape: roadShape, path, cap: Mesh.CAP_ALL, updatable: false, sideOrientation: Mesh.DOUBLESIDE },
      this.scene
    );
    mesh.material = deckMat;
    mesh.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(mesh);

    // Create side railings along the curved path
    const railHeight = 0.6;
    const railWidth = 0.08;
    const halfWidth = width / 2;

    // Create railing shape for extrusion
    const railShape = [
      new Vector3(-railWidth / 2, railHeight, 0),
      new Vector3(railWidth / 2, railHeight, 0),
      new Vector3(railWidth / 2, 0, 0),
      new Vector3(-railWidth / 2, 0, 0)
    ];

    // Left railing path (offset from centre)
    const leftRailPath = path.map(p => {
      // Calculate direction to next point for perpendicular offset
      const idx = path.indexOf(p);
      let dir: Vector3;
      if (idx < path.length - 1) {
        dir = path[idx + 1].subtract(p).normalize();
      } else {
        dir = p.subtract(path[idx - 1]).normalize();
      }
      const perp = new Vector3(-dir.z, 0, dir.x);
      return new Vector3(
        p.x + perp.x * (halfWidth - railWidth),
        p.y + 0.12,
        p.z + perp.z * (halfWidth - railWidth)
      );
    });

    // Right railing path
    const rightRailPath = path.map(p => {
      const idx = path.indexOf(p);
      let dir: Vector3;
      if (idx < path.length - 1) {
        dir = path[idx + 1].subtract(p).normalize();
      } else {
        dir = p.subtract(path[idx - 1]).normalize();
      }
      const perp = new Vector3(-dir.z, 0, dir.x);
      return new Vector3(
        p.x - perp.x * (halfWidth - railWidth),
        p.y + 0.12,
        p.z - perp.z * (halfWidth - railWidth)
      );
    });

    const leftRail = ExtrudeShape(
      "overpassRailL",
      { shape: railShape, path: leftRailPath, cap: Mesh.CAP_ALL, updatable: false },
      this.scene
    );
    leftRail.material = railMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(leftRail);

    const rightRail = ExtrudeShape(
      "overpassRailR",
      { shape: railShape, path: rightRailPath, cap: Mesh.CAP_ALL, updatable: false },
      this.scene
    );
    rightRail.material = railMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rightRail);
  }

  private createBridgeMesh(info: BridgeInfo) {
    const { start, end, width, height, rampLength, rotation } = info;

    // Calculate bridge direction and length
    const dir = end.subtract(start);
    const deckLength = dir.length();
    const midpoint = start.add(end).scale(0.5);

    // Bridge deck material - dark asphalt for driving surface
    const deckMat = new PBRMaterial("bridgeDeckMat", this.scene);
    deckMat.albedoColor = new Color3(0.2, 0.2, 0.22);
    deckMat.roughness = 0.8;
    deckMat.metallic = 0.05;

    // Bridge support material - steel
    const steelMat = new PBRMaterial("bridgeSteelMat", this.scene);
    steelMat.albedoColor = new Color3(0.4, 0.42, 0.45);
    steelMat.roughness = 0.4;
    steelMat.metallic = 0.7;

    // Railing material - red/white safety
    const railMat = new PBRMaterial("bridgeRailMat", this.scene);
    railMat.albedoColor = new Color3(0.9, 0.2, 0.15);
    railMat.roughness = 0.5;
    railMat.metallic = 0.2;

    // Create flat bridge deck
    const deck = CreateBox("bridgeDeck", { width, height: 0.3, depth: deckLength }, this.scene);
    deck.position = midpoint.clone();
    deck.position.y = height;
    deck.rotation.y = rotation;
    deck.material = deckMat;
    deck.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(deck);

    // Create proper wedge ramps using custom geometry
    const slopeAngle = Math.atan2(height, rampLength);

    // Start ramp (going up)
    const startRamp = this.createRampMesh(width, rampLength, height, deckMat);
    // Position ramp so it starts on the ground and connects to deck
    const rampDir = info.direction;
    const rampStartPos = start.subtract(rampDir.scale(rampLength / 2));
    startRamp.position = rampStartPos;
    startRamp.position.y = 0.02;
    startRamp.rotation.y = rotation;
    if (this.shadowGen) this.shadowGen.addShadowCaster(startRamp);

    // End ramp (going down) - rotated 180 degrees
    const endRamp = this.createRampMesh(width, rampLength, height, deckMat);
    const rampEndPos = end.add(rampDir.scale(rampLength / 2));
    endRamp.position = rampEndPos;
    endRamp.position.y = 0.02;
    endRamp.rotation.y = rotation + Math.PI;
    if (this.shadowGen) this.shadowGen.addShadowCaster(endRamp);

    // Support pillars at deck start/end
    const pillarRadius = 0.5;
    const pillarHeight = height;
    // Keep pillars out of the driving line when the bridge runs over the road.
    const pillarOffsetFromCenter = width / 2 + 6;

    for (const pos of [start, end]) {
      for (const side of [-1, 1]) {
        const pillar = CreateCylinder("pillar", { height: pillarHeight, diameter: pillarRadius * 2 }, this.scene);
        pillar.position = pos.clone();
        pillar.position.x += Math.cos(rotation) * pillarOffsetFromCenter * side;
        pillar.position.z -= Math.sin(rotation) * pillarOffsetFromCenter * side;
        pillar.position.y = pillarHeight / 2;
        pillar.material = steelMat;
        if (this.shadowGen) this.shadowGen.addShadowCaster(pillar);
      }
    }

    // Side railings on deck
    const railHeight = 0.6;
    for (const side of [-1, 1]) {
      const rail = CreateBox("rail", { width: 0.08, height: railHeight, depth: deckLength + 0.5 }, this.scene);
      rail.parent = deck;
      rail.position.set((width / 2 - 0.08) * side, 0.15 + railHeight / 2, 0);
      rail.material = railMat;
      if (this.shadowGen) this.shadowGen.addShadowCaster(rail);
    }
  }

  // Ease-in-out curve for smooth ramp profile (starts flat, curves up, ends flat at top)
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private createRampMesh(width: number, length: number, height: number, material: PBRMaterial): Mesh {
    const hw = width / 2;
    const hl = length / 2;

    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create curved ramp surface with many subdivisions for smooth curve
    const subdivsX = 4;
    const subdivsZ = 20;  // More subdivisions along length for smooth curve

    for (let i = 0; i <= subdivsX; i++) {
      for (let j = 0; j <= subdivsZ; j++) {
        const u = i / subdivsX;
        const v = j / subdivsZ;
        const x = -hw + u * width;
        const z = -hl + v * length;
        // Use ease-in-out curve for natural ramp shape - starts flat, curves up, flattens at top
        const y = this.easeInOutCubic(v) * height;
        positions.push(x, y, z);

        // Calculate normal based on curve derivative
        const dv = 0.01;
        const y1 = this.easeInOutCubic(Math.max(0, v - dv)) * height;
        const y2 = this.easeInOutCubic(Math.min(1, v + dv)) * height;
        const slope = (y2 - y1) / (dv * 2 * length);
        const ny = 1 / Math.sqrt(1 + slope * slope);
        const nz = -slope * ny;
        normals.push(0, ny, nz);
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < subdivsX; i++) {
      for (let j = 0; j < subdivsZ; j++) {
        const a = i * (subdivsZ + 1) + j;
        const b = a + 1;
        const c = a + subdivsZ + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Side faces - create curved side walls
    const sideSubdivs = 10;
    for (const sideX of [-hw, hw]) {
      const sideStart = positions.length / 3;
      const sideNormal = sideX < 0 ? -1 : 1;

      // Bottom edge vertices
      for (let j = 0; j <= sideSubdivs; j++) {
        const v = j / sideSubdivs;
        const z = -hl + v * length;
        positions.push(sideX, 0, z);
        normals.push(sideNormal, 0, 0);
        uvs.push(v, 0);
      }
      // Top edge vertices (curved)
      for (let j = 0; j <= sideSubdivs; j++) {
        const v = j / sideSubdivs;
        const z = -hl + v * length;
        const y = this.easeInOutCubic(v) * height;
        positions.push(sideX, y, z);
        normals.push(sideNormal, 0, 0);
        uvs.push(v, 1);
      }

      // Connect bottom and top edges
      for (let j = 0; j < sideSubdivs; j++) {
        const bl = sideStart + j;
        const br = sideStart + j + 1;
        const tl = sideStart + sideSubdivs + 1 + j;
        const tr = sideStart + sideSubdivs + 2 + j;
        if (sideX < 0) {
          indices.push(bl, tl, br, br, tl, tr);
        } else {
          indices.push(bl, br, tl, tl, br, tr);
        }
      }
    }

    const ramp = new Mesh("bridgeRamp", this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.applyToMesh(ramp);
    ramp.material = material;
    ramp.receiveShadows = true;

    return ramp;
  }

  // Get height at a position (for physics) - includes ramps with eased curve and side collision detection
  getHeightAt(pos: Vector3, carY?: number): { height: number; onBridge: boolean; sideCollision: boolean; normal: Vector3 } {
    let bestHeight = 0;
    let onAny = false;
    let sideCollision = false;
    let collisionNormal = new Vector3(0, 0, 0);
    const barrierWidth = 0.6; // Width of side barriers/railings

    // Curved routes (closest point on polyline in XZ, then lerp Y along the segment).
    for (const route of this.routes) {
      const { width, path } = route;
      const halfWidth = width * 0.5;
      const r2 = halfWidth * halfWidth;
      const outerR2 = (halfWidth + barrierWidth) * (halfWidth + barrierWidth);

      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        const px = pos.x - a.x;
        const pz = pos.z - a.z;
        let t = (px * dx + pz * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = a.x + dx * t;
        const cz = a.z + dz * t;
        const ddx = pos.x - cx;
        const ddz = pos.z - cz;
        const dist2 = ddx * ddx + ddz * ddz;

        // Get height at this point along the route
        const h = a.y + (b.y - a.y) * t;

        // Check if car is at or above route height - side collision only applies when elevated
        const carHeight = carY ?? pos.y;
        const isElevated = h > 0.5 && carHeight >= h - 1.0;

        // Check for side collision - hitting the edge barrier from outside
        if (dist2 > r2 && dist2 <= outerR2 && isElevated) {
          sideCollision = true;
          const dist = Math.sqrt(dist2);
          collisionNormal = new Vector3(ddx / dist, 0, ddz / dist);
          continue;
        }

        if (dist2 > r2) continue;

        if (h > bestHeight) bestHeight = h;
        onAny = true;
      }
    }

    for (const bridge of this.bridges) {
      const { start, end, width, height, rampLength, direction: dir, rotation } = bridge;
      const deckLength = Vector3.Distance(start, end);
      const halfWidth = width / 2;

      // Calculate perpendicular distance to the bridge line
      const toBridge = pos.subtract(start);
      const along = Vector3.Dot(toBridge, dir);
      const perp = new Vector3(-dir.z, 0, dir.x);
      const perpDist = Vector3.Dot(toBridge, perp);
      const absPerpDist = Math.abs(perpDist);

      // Check if within the bridge's length span (including ramps)
      const withinLength = along >= -rampLength && along <= deckLength + rampLength;

      // Calculate height at current position along bridge
      let bridgeHeight = 0;
      if (along >= -rampLength && along < 0) {
        const t = (along + rampLength) / rampLength;
        bridgeHeight = this.easeInOutCubic(t) * height;
      } else if (along >= 0 && along <= deckLength) {
        bridgeHeight = height;
      } else if (along > deckLength && along <= deckLength + rampLength) {
        const t = (along - deckLength) / rampLength;
        bridgeHeight = this.easeInOutCubic(1 - t) * height;
      }

      // Check if car is at or above bridge height - for side collision
      const carHeight = carY ?? pos.y;
      const isElevated = bridgeHeight > 0.5 && carHeight >= bridgeHeight - 1.5;

      // Side collision check - hitting barriers from the side while elevated
      if (withinLength && absPerpDist > halfWidth && absPerpDist <= halfWidth + barrierWidth && isElevated) {
        sideCollision = true;
        collisionNormal = perp.scale(perpDist > 0 ? 1 : -1);
        continue;
      }

      // Check if trying to drive up the side of an elevated bridge (not from ramp entry)
      // This detects when car approaches from perpendicular to bridge direction
      if (withinLength && absPerpDist <= halfWidth + barrierWidth && bridgeHeight > 0.3) {
        // Check if car is below the bridge surface (trying to drive through side)
        if (carHeight < bridgeHeight - 0.5 && absPerpDist > halfWidth * 0.7) {
          // Car is approaching from the side at ground level - treat as solid wall
          sideCollision = true;
          collisionNormal = perp.scale(perpDist > 0 ? 1 : -1);
          continue;
        }
      }

      // Check if within bridge width for height calculation
      if (absPerpDist > halfWidth) continue;

      // Check different sections of the bridge
      // Start ramp: from -rampLength to 0 (relative to start point)
      if (along >= -rampLength && along < 0) {
        const t = (along + rampLength) / rampLength;
        const easedT = this.easeInOutCubic(t);
        bestHeight = Math.max(bestHeight, easedT * height);
        onAny = true;
      }

      // Main deck: from 0 to deckLength
      if (along >= 0 && along <= deckLength) {
        bestHeight = Math.max(bestHeight, height);
        onAny = true;
      }

      // End ramp: from deckLength to deckLength + rampLength
      if (along > deckLength && along <= deckLength + rampLength) {
        const t = (along - deckLength) / rampLength;
        const easedT = this.easeInOutCubic(1 - t);
        bestHeight = Math.max(bestHeight, easedT * height);
        onAny = true;
      }
    }

    return { height: bestHeight, onBridge: onAny, sideCollision, normal: collisionNormal };
  }
}
