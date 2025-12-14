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

    // Face towards track centre - calculate rotation first for pole positioning
    const rotation = Math.atan2(dir.x, dir.z);
    const faceRotation = rotation + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);

    // Create sturdy banner poles - positioned along the banner's local axis
    const poleMat = new PBRMaterial("poleMat", this.scene);
    poleMat.albedoColor = new Color3(0.25, 0.25, 0.3);
    poleMat.metallic = 0.9;
    poleMat.roughness = 0.3;

    const poleHeight = height + 2;
    const poleRadius = 0.12;
    const poleOffset = width / 2 + 0.15;

    // Calculate pole offset vectors using the banner's rotation
    const poleOffsetX = Math.cos(faceRotation) * poleOffset;
    const poleOffsetZ = -Math.sin(faceRotation) * poleOffset;

    const leftPole = CreateCylinder("bannerPoleL", { height: poleHeight, diameter: poleRadius * 2 }, this.scene);
    leftPole.position = bannerPos.clone();
    leftPole.position.x -= poleOffsetX;
    leftPole.position.z -= poleOffsetZ;
    leftPole.position.y = poleHeight / 2;
    leftPole.material = poleMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(leftPole);

    const rightPole = CreateCylinder("bannerPoleR", { height: poleHeight, diameter: poleRadius * 2 }, this.scene);
    rightPole.position = bannerPos.clone();
    rightPole.position.x += poleOffsetX;
    rightPole.position.z += poleOffsetZ;
    rightPole.position.y = poleHeight / 2;
    rightPole.material = poleMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rightPole);

    // Banner dimensions and positioning
    const backingHeight = height * 0.85;
    const backingWidth = width * 1.08;
    const bannerY = poleHeight - height * 0.4;

    // Create shared materials
    const backingMat = new PBRMaterial("backingMat", this.scene);
    backingMat.albedoColor = new Color3(1, 1, 1);
    backingMat.roughness = 0.4;
    backingMat.metallic = 0.0;
    backingMat.emissiveColor = new Color3(0.15, 0.15, 0.15);

    // Banner material with logo
    const bannerMat = new PBRMaterial("bannerMat", this.scene);
    const logoTexture = new Texture(logoPath, this.scene);
    logoTexture.hasAlpha = true;
    bannerMat.albedoTexture = logoTexture;
    bannerMat.albedoColor = new Color3(1, 1, 1);
    bannerMat.roughness = 0.2;
    bannerMat.metallic = 0.0;
    bannerMat.useAlphaFromAlbedoTexture = true;
    bannerMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    bannerMat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    bannerMat.emissiveTexture = logoTexture;
    bannerMat.emissiveIntensity = 0.4;

    // Offset for front/back separation
    const frontOffset = 0.05;
    const backOffset = -0.05;

    // Calculate offset vectors based on rotation
    const frontOffsetX = Math.sin(faceRotation) * frontOffset;
    const frontOffsetZ = Math.cos(faceRotation) * frontOffset;
    const backOffsetX = Math.sin(faceRotation) * backOffset;
    const backOffsetZ = Math.cos(faceRotation) * backOffset;

    // FRONT SIDE - facing the track (visible when driving past)
    const frontBacking = MeshBuilder.CreatePlane("bannerBackingFront", { width: backingWidth, height: backingHeight }, this.scene);
    frontBacking.position = bannerPos.clone();
    frontBacking.position.y = bannerY;
    frontBacking.position.x += frontOffsetX - Math.sin(faceRotation) * 0.03;
    frontBacking.position.z += frontOffsetZ - Math.cos(faceRotation) * 0.03;
    frontBacking.rotation.y = faceRotation;
    frontBacking.material = backingMat;

    const frontBanner = MeshBuilder.CreatePlane("bannerFront", { width, height: height * 0.8 }, this.scene);
    frontBanner.position = bannerPos.clone();
    frontBanner.position.y = bannerY;
    frontBanner.position.x += frontOffsetX;
    frontBanner.position.z += frontOffsetZ;
    frontBanner.rotation.y = faceRotation;
    frontBanner.material = bannerMat;

    // BACK SIDE - facing away from track (visible from other side)
    const backBacking = MeshBuilder.CreatePlane("bannerBackingBack", { width: backingWidth, height: backingHeight }, this.scene);
    backBacking.position = bannerPos.clone();
    backBacking.position.y = bannerY;
    backBacking.position.x += backOffsetX + Math.sin(faceRotation) * 0.03;
    backBacking.position.z += backOffsetZ + Math.cos(faceRotation) * 0.03;
    backBacking.rotation.y = faceRotation + Math.PI;  // Rotated 180 degrees
    backBacking.material = backingMat;

    const backBanner = MeshBuilder.CreatePlane("bannerBack", { width, height: height * 0.8 }, this.scene);
    backBanner.position = bannerPos.clone();
    backBanner.position.y = bannerY;
    backBanner.position.x += backOffsetX;
    backBanner.position.z += backOffsetZ;
    backBanner.rotation.y = faceRotation + Math.PI;  // Rotated 180 degrees
    backBanner.material = bannerMat;

    // Add a coloured border/frame around the banner
    const frameMat = new PBRMaterial("frameMat", this.scene);
    frameMat.albedoColor = new Color3(0.1, 0.4, 0.7); // Opace blue
    frameMat.roughness = 0.3;
    frameMat.metallic = 0.2;
    frameMat.emissiveColor = new Color3(0.05, 0.15, 0.3);

    // Top frame bar - spans across both sides
    const topBar = CreateBox("topBar", { width: backingWidth + 0.3, height: 0.2, depth: 0.2 }, this.scene);
    topBar.position = bannerPos.clone();
    topBar.position.y = bannerY + backingHeight / 2 + 0.1;
    topBar.rotation.y = faceRotation;
    topBar.material = frameMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(topBar);

    // Bottom frame bar
    const bottomBar = CreateBox("bottomBar", { width: backingWidth + 0.3, height: 0.2, depth: 0.2 }, this.scene);
    bottomBar.position = bannerPos.clone();
    bottomBar.position.y = bannerY - backingHeight / 2 - 0.1;
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

