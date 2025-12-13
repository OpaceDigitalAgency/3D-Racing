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
  addBanner(trackProgress: number, side: 'left' | 'right', logoPath: string, height: number = 4, width: number = 6) {
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
    
    // Offset to side of track
    const perpendicular = new Vector3(-dir.z, 0, dir.x);
    const offset = side === 'left' ? -1 : 1;
    const bannerPos = pos.add(perpendicular.scale(offset * (this.track.halfWidth + 5)));
    
    // Create banner poles
    const poleMat = new PBRMaterial("poleMat", this.scene);
    poleMat.albedoColor = new Color3(0.3, 0.3, 0.35);
    poleMat.metallic = 0.8;
    poleMat.roughness = 0.4;
    
    const poleHeight = height + 1;
    const poleRadius = 0.08;
    
    const leftPole = CreateCylinder("bannerPoleL", { height: poleHeight, diameter: poleRadius * 2 }, this.scene);
    leftPole.position = bannerPos.clone();
    leftPole.position.x -= width / 2 - 0.1;
    leftPole.position.y = poleHeight / 2;
    leftPole.material = poleMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(leftPole);
    
    const rightPole = CreateCylinder("bannerPoleR", { height: poleHeight, diameter: poleRadius * 2 }, this.scene);
    rightPole.position = bannerPos.clone();
    rightPole.position.x += width / 2 - 0.1;
    rightPole.position.y = poleHeight / 2;
    rightPole.material = poleMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rightPole);
    
    // Create banner plane with logo
    const banner = MeshBuilder.CreatePlane("banner", { width, height: height * 0.6 }, this.scene);
    banner.position = bannerPos.clone();
    banner.position.y = poleHeight - height * 0.3;
    
    // Face towards track
    const rotation = Math.atan2(dir.x, dir.z);
    banner.rotation.y = rotation + Math.PI / 2;
    
    // Banner material with logo
    const bannerMat = new PBRMaterial("bannerMat", this.scene);
    const logoTexture = new Texture(logoPath, this.scene);
    logoTexture.hasAlpha = true;
    bannerMat.albedoTexture = logoTexture;
    bannerMat.albedoColor = new Color3(1, 1, 1);
    bannerMat.roughness = 0.3;
    bannerMat.metallic = 0.0;
    bannerMat.useAlphaFromAlbedoTexture = true;
    bannerMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    bannerMat.backFaceCulling = false;
    banner.material = bannerMat;
    
    // Banner backing (white background)
    const backing = MeshBuilder.CreatePlane("bannerBacking", { width: width * 1.05, height: height * 0.65 }, this.scene);
    backing.position = banner.position.clone();
    backing.position.y = banner.position.y;
    backing.rotation.y = banner.rotation.y;
    
    const backingMat = new PBRMaterial("backingMat", this.scene);
    backingMat.albedoColor = new Color3(0.95, 0.95, 0.95);
    backingMat.roughness = 0.5;
    backingMat.metallic = 0.0;
    backingMat.backFaceCulling = false;
    backing.material = backingMat;
    
    // Move backing slightly behind banner
    const backOffset = new Vector3(
      Math.sin(banner.rotation.y) * 0.05,
      0,
      Math.cos(banner.rotation.y) * 0.05
    );
    backing.position.addInPlace(backOffset);
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

