import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Track } from "./Track";

export class TrackProps {
  constructor(
    private scene: Scene,
    private track: Track,
    private shadowGen?: ShadowGenerator
  ) {}

  // Create banner/billboard at a position along the track
  addBanner(trackProgress: number, side: 'left' | 'right', logoPath: string, height: number = 6, width: number = 10) {
    const totalLen = this.track.totalLength;
    const targetDist = trackProgress * totalLen;

    let accum = 0;
    let pos = this.track.centerline[0].clone();
    let dir = new Vector3(0, 0, 1);

    for (let i = 0; i < this.track.centerline.length - 1; i++) {
      const a = this.track.centerline[i];
      const b = this.track.centerline[i + 1];
      const segLen = Vector3.Distance(a, b);

      if (accum + segLen >= targetDist) {
        const t = (targetDist - accum) / segLen;
        pos = Vector3.Lerp(a, b, t);
        dir = b.subtract(a).normalize();
        break;
      }
      accum += segLen;
    }

    // Offset to side of track - closer to track for visibility
    const perpendicular = new Vector3(-dir.z, 0, dir.x);
    const offset = side === 'left' ? -1 : 1;
    const bannerPos = pos.add(perpendicular.scale(offset * (this.track.halfWidth + 3)));

    // Create sturdy banner poles
    const poleMat = new PBRMaterial("poleMat", this.scene);
    poleMat.albedoColor = new Color3(0.25, 0.25, 0.3);
    poleMat.metallic = 0.9;
    poleMat.roughness = 0.3;

    const poleHeight = height + 2;
    const poleRadius = 0.12;

    const leftPole = CreateCylinder("bannerPoleL", { height: poleHeight, diameter: poleRadius * 2 }, this.scene);
    leftPole.position = bannerPos.clone();
    leftPole.position.x -= width / 2 + 0.15;
    leftPole.position.y = poleHeight / 2;
    leftPole.material = poleMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(leftPole);

    const rightPole = CreateCylinder("bannerPoleR", { height: poleHeight, diameter: poleRadius * 2 }, this.scene);
    rightPole.position = bannerPos.clone();
    rightPole.position.x += width / 2 + 0.15;
    rightPole.position.y = poleHeight / 2;
    rightPole.material = poleMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rightPole);

    // Face towards track centre
    const rotation = Math.atan2(dir.x, dir.z);
    const faceRotation = rotation + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);

    // Banner backing (solid white background) - create FIRST
    const backingHeight = height * 0.85;
    const backingWidth = width * 1.08;
    const backing = MeshBuilder.CreatePlane("bannerBacking", { width: backingWidth, height: backingHeight }, this.scene);
    backing.position = bannerPos.clone();
    backing.position.y = poleHeight - height * 0.4;
    backing.rotation.y = faceRotation;

    const backingMat = new PBRMaterial("backingMat", this.scene);
    backingMat.albedoColor = new Color3(1, 1, 1);
    backingMat.roughness = 0.4;
    backingMat.metallic = 0.0;
    backingMat.backFaceCulling = false;
    // Add slight emissive so it's visible even in shadow
    backingMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
    backing.material = backingMat;

    // Move backing behind logo plane
    const backOffset = new Vector3(
      Math.sin(faceRotation) * 0.08,
      0,
      Math.cos(faceRotation) * 0.08
    );
    backing.position.addInPlace(backOffset);

    // Create banner plane with logo - in FRONT of backing
    const banner = MeshBuilder.CreatePlane("banner", { width, height: height * 0.8 }, this.scene);
    banner.position = bannerPos.clone();
    banner.position.y = poleHeight - height * 0.4;
    banner.rotation.y = faceRotation;

    // Banner material with logo - improved visibility
    const bannerMat = new PBRMaterial("bannerMat", this.scene);
    const logoTexture = new Texture(logoPath, this.scene);
    logoTexture.hasAlpha = true;
    bannerMat.albedoTexture = logoTexture;
    bannerMat.albedoColor = new Color3(1, 1, 1);
    bannerMat.roughness = 0.2;
    bannerMat.metallic = 0.0;
    bannerMat.useAlphaFromAlbedoTexture = true;
    bannerMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    bannerMat.backFaceCulling = false;
    // Add emissive to make logo pop
    bannerMat.emissiveColor = new Color3(0.2, 0.2, 0.2);
    bannerMat.emissiveTexture = logoTexture;
    bannerMat.emissiveIntensity = 0.3;
    banner.material = bannerMat;

    // Add a coloured border/frame around the banner
    const frameMat = new PBRMaterial("frameMat", this.scene);
    frameMat.albedoColor = new Color3(0.1, 0.4, 0.7); // Opace blue
    frameMat.roughness = 0.3;
    frameMat.metallic = 0.2;
    frameMat.emissiveColor = new Color3(0.05, 0.15, 0.3);

    // Top frame bar
    const topBar = CreateBox("topBar", { width: backingWidth + 0.3, height: 0.2, depth: 0.15 }, this.scene);
    topBar.position = backing.position.clone();
    topBar.position.y += backingHeight / 2 + 0.1;
    topBar.rotation.y = faceRotation;
    topBar.material = frameMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(topBar);

    // Bottom frame bar
    const bottomBar = CreateBox("bottomBar", { width: backingWidth + 0.3, height: 0.2, depth: 0.15 }, this.scene);
    bottomBar.position = backing.position.clone();
    bottomBar.position.y -= backingHeight / 2 + 0.1;
    bottomBar.rotation.y = faceRotation;
    bottomBar.material = frameMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(bottomBar);
  }
  
  // Add sponsor decal on car roof
  addCarDecal(carMesh: any, logoPath: string) {
    const decal = MeshBuilder.CreatePlane("carDecal", { width: 0.8, height: 0.4 }, this.scene);
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.88;
    decal.position.z = -0.2;
    decal.parent = carMesh;
    
    const decalMat = new PBRMaterial("carDecalMat", this.scene);
    const logoTexture = new Texture(logoPath, this.scene);
    logoTexture.hasAlpha = true;
    decalMat.albedoTexture = logoTexture;
    decalMat.useAlphaFromAlbedoTexture = true;
    decalMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    decalMat.roughness = 0.2;
    decalMat.metallic = 0.0;
    decal.material = decalMat;
  }
}

