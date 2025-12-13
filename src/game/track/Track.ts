import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/instancedMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { ExtrudeShape } from "@babylonjs/core/Meshes/Builders/shapeBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

// Generate procedural grass texture
function createGrassTexture(scene: Scene, size: number = 512): Texture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Base grass colour with variation
      const noise1 = Math.sin(x * 0.1) * Math.cos(y * 0.08) * 0.15;
      const noise2 = Math.sin(x * 0.23 + y * 0.17) * 0.1;
      const noise3 = Math.random() * 0.08;

      const baseG = 0.35 + noise1 + noise2 + noise3;
      const baseR = 0.15 + noise1 * 0.5 + noise3 * 0.5;
      const baseB = 0.08 + noise2 * 0.3;

      data[idx] = Math.floor(Math.max(0, Math.min(1, baseR)) * 255);
      data[idx + 1] = Math.floor(Math.max(0, Math.min(1, baseG)) * 255);
      data[idx + 2] = Math.floor(Math.max(0, Math.min(1, baseB)) * 255);
      data[idx + 3] = 255;
    }
  }

  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

// Generate procedural asphalt texture
function createAsphaltTexture(scene: Scene, size: number = 512): Texture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Dark grey base with aggregate variation
      const noise1 = Math.random() * 0.12;
      const noise2 = Math.sin(x * 0.5 + y * 0.3) * 0.03;

      // Occasional lighter aggregate stones
      const stone = Math.random() > 0.92 ? 0.15 : 0;

      const base = 0.12 + noise1 + noise2 + stone;

      data[idx] = Math.floor(Math.max(0, Math.min(1, base)) * 255);
      data[idx + 1] = Math.floor(Math.max(0, Math.min(1, base * 1.02)) * 255);
      data[idx + 2] = Math.floor(Math.max(0, Math.min(1, base * 1.05)) * 255);
      data[idx + 3] = 255;
    }
  }

  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

// Generate normal map for surface detail
function createSurfaceNormalTexture(scene: Scene, size: number = 256, intensity: number = 0.3): Texture {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Generate subtle normal variation
      const nx = (Math.random() - 0.5) * intensity;
      const ny = (Math.random() - 0.5) * intensity;
      const nz = Math.sqrt(1 - nx * nx - ny * ny);

      data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

type Projection = {
  closest: Vector3;
  normal: Vector3;
  distance: number;
  s: number;
};

export type ProjectionRef = {
  closest: Vector3;
  normal: Vector3;
  distance: number;
  s: number;
};

function buildRoundedRectPath(halfX: number, halfZ: number, radius: number, cornerSteps: number) {
  const r = Math.min(radius, Math.min(halfX, halfZ) - 1);
  const pts: Vector3[] = [];

  const pushArc = (cx: number, cz: number, start: number, end: number) => {
    for (let i = 0; i <= cornerSteps; i++) {
      const t = i / cornerSteps;
      const a = start + (end - start) * t;
      pts.push(new Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
    }
  };

  pts.push(new Vector3(halfX - r, 0, -halfZ));
  pts.push(new Vector3(-(halfX - r), 0, -halfZ));
  pushArc(-halfX + r, -halfZ + r, -Math.PI / 2, -Math.PI);
  pts.push(new Vector3(-halfX, 0, -(halfZ - r)));
  pts.push(new Vector3(-halfX, 0, halfZ - r));
  pushArc(-halfX + r, halfZ - r, -Math.PI, -Math.PI * 1.5);
  pts.push(new Vector3(-(halfX - r), 0, halfZ));
  pts.push(new Vector3(halfX - r, 0, halfZ));
  pushArc(halfX - r, halfZ - r, -Math.PI * 1.5, -Math.PI * 2);
  pts.push(new Vector3(halfX, 0, halfZ - r));
  pts.push(new Vector3(halfX, 0, -(halfZ - r)));
  pushArc(halfX - r, -halfZ + r, 0, -Math.PI / 2);

  pts.push(pts[0].clone());
  return pts;
}

export class Track {
  readonly centerline: readonly Vector3[];
  readonly halfWidth: number;
  readonly totalLength: number;
  readonly cumulative: readonly number[];

  constructor(centerline: readonly Vector3[], halfWidth: number) {
    this.centerline = centerline;
    this.halfWidth = halfWidth;

    const cumulative: number[] = [0];
    let len = 0;
    for (let i = 0; i < centerline.length - 1; i++) {
      len += Vector3.Distance(centerline[i], centerline[i + 1]);
      cumulative.push(len);
    }
    this.cumulative = cumulative;
    this.totalLength = len;
  }

  projectToRef(pos: Vector3, out: ProjectionRef): ProjectionRef {
    let bestDist2 = Number.POSITIVE_INFINITY;
    let bestS = 0;

    for (let i = 0; i < this.centerline.length - 1; i++) {
      const a = this.centerline[i];
      const b = this.centerline[i + 1];

      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const apx = pos.x - a.x;
      const apz = pos.z - a.z;

      const abLen2 = Math.max(1e-6, abx * abx + abz * abz);
      const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLen2));

      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist2 = dx * dx + dz * dz;

      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        out.closest.set(cx, 0, cz);

        const dLen2 = dx * dx + dz * dz;
        if (dLen2 < 1e-6) {
          // pick a perpendicular to segment when exactly on the line
          const nx = abz;
          const nz = -abx;
          const nLen = Math.hypot(nx, nz) || 1;
          out.normal.set(nx / nLen, 0, nz / nLen);
        } else {
          const inv = 1 / Math.sqrt(dLen2);
          out.normal.set(dx * inv, 0, dz * inv);
        }

        const segLen = Math.sqrt(abLen2);
        bestS = (this.cumulative[i] ?? 0) + segLen * t;
      }
    }

    out.distance = Math.sqrt(bestDist2);
    out.s = bestS;
    return out;
  }

  project(pos: Vector3): Projection {
    const out: ProjectionRef = { closest: new Vector3(), normal: new Vector3(), distance: 0, s: 0 };
    this.projectToRef(pos, out);
    return out;
  }

  surfaceAtToRef(pos: Vector3, projectionOut: ProjectionRef) {
    const p = this.projectToRef(pos, projectionOut);
    return { projection: p, onTrack: p.distance <= this.halfWidth };
  }

  surfaceAt(pos: Vector3) {
    const p = this.project(pos);
    return { projection: p, onTrack: p.distance <= this.halfWidth };
  }

  static createDefault(scene: Scene, shadowGen?: ShadowGenerator) {
    const centerline = buildRoundedRectPath(95, 70, 22, 18);
    const track = new Track(centerline, 8);

    // Create realistic asphalt material with textures
    const asphalt = new PBRMaterial("asphalt", scene);
    const asphaltTex = createAsphaltTexture(scene, 512);
    asphaltTex.uScale = 40;
    asphaltTex.vScale = 40;
    asphalt.albedoTexture = asphaltTex;
    asphalt.roughness = 0.88;
    asphalt.metallic = 0.02;

    const asphaltNormal = createSurfaceNormalTexture(scene, 256, 0.2);
    asphaltNormal.uScale = 60;
    asphaltNormal.vScale = 60;
    asphalt.bumpTexture = asphaltNormal;

    // Wet asphalt reflections
    asphalt.reflectivityColor = new Color3(0.15, 0.15, 0.15);
    asphalt.environmentIntensity = 0.4;

    // Create realistic grass material
    const grass = new PBRMaterial("grass", scene);
    const grassTex = createGrassTexture(scene, 512);
    grassTex.uScale = 80;
    grassTex.vScale = 80;
    grass.albedoTexture = grassTex;
    grass.roughness = 0.95;
    grass.metallic = 0.0;

    const grassNormal = createSurfaceNormalTexture(scene, 256, 0.4);
    grassNormal.uScale = 100;
    grassNormal.vScale = 100;
    grass.bumpTexture = grassNormal;

    // Subsurface scattering for grass
    grass.subSurface.isTranslucencyEnabled = true;
    grass.subSurface.translucencyIntensity = 0.15;
    grass.subSurface.tintColor = new Color3(0.1, 0.3, 0.05);

    // Create ground with higher subdivision for better quality
    const ground = CreateGround("terrain", { width: 500, height: 500, subdivisions: 64 }, scene);
    ground.position.y = -0.02;
    ground.material = grass;
    ground.receiveShadows = true;

    const roadShape = [
      new Vector3(-track.halfWidth, 0.08, 0),
      new Vector3(track.halfWidth, 0.08, 0),
      new Vector3(track.halfWidth, 0.0, 0),
      new Vector3(-track.halfWidth, 0.0, 0)
    ];

    const road = ExtrudeShape(
      "road",
      { shape: roadShape, path: centerline as Vector3[], cap: Mesh.CAP_ALL, updatable: false, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    road.material = asphalt;
    road.receiveShadows = true;

    // Track kerbs (red and white striped)
    const kerbMat = new PBRMaterial("kerbMat", scene);
    kerbMat.albedoColor = new Color3(0.9, 0.15, 0.1);
    kerbMat.roughness = 0.7;
    kerbMat.metallic = 0.0;

    // Improved barriers with PBR material
    const barrierMat = new PBRMaterial("barrierMat", scene);
    barrierMat.albedoColor = new Color3(0.75, 0.75, 0.78);
    barrierMat.roughness = 0.6;
    barrierMat.metallic = 0.3;

    const barrierProto = CreateBox("barrierProto", { width: 1.1, height: 1.25, depth: 2.2 }, scene);
    barrierProto.material = barrierMat;
    barrierProto.isVisible = false;
    barrierProto.receiveShadows = true; // Instances inherit shadow receiving from prototype

    const placeBarriers = (side: 1 | -1) => {
      const spacing = 4.0;
      for (let i = 0; i < centerline.length - 1; i++) {
        const a = centerline[i];
        const b = centerline[i + 1];
        const seg = b.subtract(a);
        const segLen = seg.length();
        const dir = seg.normalize();
        const n = new Vector3(dir.z, 0, -dir.x).scale(track.halfWidth * side + side * 2.0);
        const count = Math.max(1, Math.floor(segLen / spacing));
        for (let j = 0; j < count; j++) {
          const t = j / count;
          const p = a.add(seg.scale(t)).add(n);
          const inst = barrierProto.createInstance(`barrier_${side}_${i}_${j}`);
          inst.isVisible = true;
          inst.position.set(p.x, 0.62, p.z);
          inst.rotation.y = Math.atan2(dir.x, dir.z);
          // Note: receiveShadows has no effect on instanced meshes - shadows are inherited from prototype
          if (shadowGen) {
            shadowGen.addShadowCaster(inst);
          }
        }
      }
    };

    placeBarriers(1);
    placeBarriers(-1);

    return { track, ground, road };
  }
}
