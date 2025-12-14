import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export type CarSimParams = {
  wheelbase: number;
  maxSteerRad: number;
  engineAccel: number;
  brakeDecel: number;
  drag: number;
  rolling: number;
  lateralGrip: number;
  handbrakeGripScale: number;
  offroadGripScale: number;
  offroadDragScale: number;
  maxSpeed: number;
};

export type GroundInfo = {
  height: number;
  normal: Vector3;
  onRamp: boolean;
  atRampEdge?: boolean;
  rampDirection?: Vector3;
  rampAngle?: number;
};

export class CarSim {
  position = new Vector3(0, 0.55, 0);
  velocity = new Vector3(0, 0, 0);
  yawRad = 0;
  pitchRad = 0; // For visual tilt on ramps
  isAirborne = false;
  airTime = 0;

  // Nitro boost state
  nitroBoostMultiplier = 1;
  nitroBoostTimeRemaining = 0;

  private steerSmoothed = 0;
  private readonly prevVelocity = new Vector3(0, 0, 0);
  readonly accelWorld = new Vector3(0, 0, 0);
  accelLongMps2 = 0;
  accelLatMps2 = 0;
  readonly forwardVec = new Vector3(0, 0, 1);
  readonly rightVec = new Vector3(1, 0, 0);
  private readonly tmpVel = new Vector3(0, 0, 0);
  private readonly tmpLat = new Vector3(0, 0, 0);

  private readonly gravity = 25; // Gravity in m/s²
  private readonly carHeight = 0.55; // Height of car centre above ground

  constructor(public readonly params: CarSimParams) {}

  // Activate nitro boost - 3x speed for a duration
  activateNitroBoost(duration: number = 2.5, multiplier: number = 3) {
    this.nitroBoostMultiplier = multiplier;
    this.nitroBoostTimeRemaining = duration;
  }

  isNitroActive(): boolean {
    return this.nitroBoostTimeRemaining > 0;
  }

  private updateBasis() {
    const s = Math.sin(this.yawRad);
    const c = Math.cos(this.yawRad);
    this.forwardVec.set(s, 0, c);
    this.rightVec.set(c, 0, -s);
  }

  reset() {
    this.position.set(0, 0.55, 0);
    this.velocity.set(0, 0, 0);
    this.yawRad = 0;
    this.pitchRad = 0;
    this.isAirborne = false;
    this.airTime = 0;
    this.steerSmoothed = 0;
    this.nitroBoostMultiplier = 1;
    this.nitroBoostTimeRemaining = 0;
    this.updateBasis();
  }

  get speedMps() {
    return this.velocity.length();
  }

  get forwardSpeedMps() {
    return Vector3.Dot(this.velocity, this.forwardVec);
  }

  get steerRad() {
    return this.steerSmoothed * this.params.maxSteerRad;
  }

  update(
    dt: number,
    input: { throttle: number; brake: number; handbrake: number; steer: number },
    surface: { grip: number; dragScale: number },
    ground: GroundInfo = { height: 0, normal: new Vector3(0, 1, 0), onRamp: false }
  ) {
    // Update nitro boost timer
    if (this.nitroBoostTimeRemaining > 0) {
      this.nitroBoostTimeRemaining -= dt;
      if (this.nitroBoostTimeRemaining <= 0) {
        this.nitroBoostTimeRemaining = 0;
        this.nitroBoostMultiplier = 1;
      }
    }

    const { throttle, brake, handbrake } = input;
    const groundHeight = ground.height + this.carHeight;

    // Check if airborne
    const wasAirborne = this.isAirborne;
    this.isAirborne = this.position.y > groundHeight + 0.1;

    if (this.isAirborne) {
      this.airTime += dt;

      // Apply gravity while airborne
      this.velocity.y -= this.gravity * dt;

      // Reduced control while airborne
      const steerTarget = Math.max(-1, Math.min(1, input.steer)) * 0.2;
      this.steerSmoothed += (steerTarget - this.steerSmoothed) * Math.min(1, 2 * dt);

      // Slight air rotation
      this.yawRad += this.steerSmoothed * 0.5 * dt;
      this.updateBasis();

      // Update position
      this.position.addInPlace(this.velocity.scale(dt));

      // Tilt forward when in air
      const targetPitch = -this.velocity.y * 0.02;
      this.pitchRad += (targetPitch - this.pitchRad) * Math.min(1, 3 * dt);

    } else {
      // Just landed
      if (wasAirborne && this.airTime > 0.1) {
        // Landing impact - reduce vertical velocity
        const landingSpeed = Math.abs(this.velocity.y);
        this.velocity.y = 0;

        // Apply some damage on hard landings
        if (landingSpeed > 8) {
          // Heavy landing - could add damage here
        }
      }

      this.airTime = 0;

      // Ground driving physics
      const steerTarget = Math.max(-1, Math.min(1, input.steer));
      const steerRate = 10;
      this.steerSmoothed += (steerTarget - this.steerSmoothed) * Math.min(1, steerRate * dt);

      this.updateBasis();
      const forward = this.forwardVec;
      const right = this.rightVec;
      const vF = Vector3.Dot(this.velocity, forward);
      const vR = Vector3.Dot(this.velocity, right);

      const grip = surface.grip * (1 - handbrake * (1 - this.params.handbrakeGripScale));

      const speed = Math.abs(vF);
      const steerAngle = this.steerRad;
      const yawRate = (vF / Math.max(0.001, this.params.wheelbase)) * Math.tan(steerAngle) * grip;
      this.yawRad += yawRate * dt;
      this.updateBasis();

      // Determine if we should reverse
      const reverseThreshold = 2.0;
      const isReversing = vF < reverseThreshold && brake > 0 && throttle === 0;
      const maxReverseSpeed = 15;

      let longA: number;
      if (isReversing) {
        const reverseAccel = this.params.engineAccel * 0.4;
        longA = -brake * reverseAccel;
        if (vF < -maxReverseSpeed) {
          longA = Math.max(0, longA);
        }
      } else {
        // Apply nitro boost multiplier to engine acceleration
        // Boost acceleration when off-road and at low speed to prevent getting stuck
        const lowSpeedBoost = speed < 3 && surface.grip < 1 ? 1.3 : 1.0;
        const engineA = throttle * this.params.engineAccel * this.nitroBoostMultiplier * lowSpeedBoost;
        const brakeA = brake * this.params.brakeDecel;
        longA = engineA - (vF > 0 ? brakeA : -brakeA);
      }

      // Reduce drag at very low speeds to prevent getting stuck
      const dragReduction = speed < 2 ? 0.5 : 1.0;
      const dragA = (this.params.drag * speed * speed + this.params.rolling * speed) * dragReduction;
      const dragSigned = speed > 0.1 ? dragA * Math.sign(vF) : 0;

      const aLong = longA - dragSigned * surface.dragScale;
      const vF2 = vF + aLong * dt;

      const slipAngle = Math.atan2(vR, Math.abs(vF) + 1);
      const aLat = -slipAngle * this.params.lateralGrip * grip * Math.min(1, 0.25 + speed / 14);
      const vR2 = vR + aLat * dt;

      forward.scaleToRef(vF2, this.tmpVel);
      right.scaleToRef(vR2, this.tmpLat);
      this.tmpVel.addInPlace(this.tmpLat);
      // Increase max speed during nitro boost
      const max = this.params.maxSpeed * (this.nitroBoostMultiplier > 1 ? 1.5 : 1);
      const len = this.tmpVel.length();
      if (len > max) this.tmpVel.scaleInPlace(max / len);

      // Ramp jump physics - only launch when truly at the edge of the ramp
      if (ground.onRamp && ground.atRampEdge && ground.rampAngle && vF2 > 8) {
        // At the very top of the ramp - apply realistic launch velocity
        // The car should maintain its forward momentum and gain upward velocity based on the ramp angle
        const launchMultiplier = 0.55;  // Realistic conversion of forward to upward velocity
        const upwardVelocity = vF2 * Math.sin(ground.rampAngle) * launchMultiplier;
        this.tmpVel.y = Math.max(upwardVelocity, 3);  // Minimum upward velocity for satisfying jump
        // Mark as airborne immediately after launch
        this.isAirborne = true;
      } else if (ground.onRamp) {
        // On ramp but not at edge - car stays grounded and follows the surface
        // No upward velocity while driving on the ramp - car hugs the surface
        this.tmpVel.y = 0;
      } else {
        this.tmpVel.y = 0;
      }

      this.velocity.copyFrom(this.tmpVel);

      this.position.addInPlace(this.velocity.scale(dt));
      this.position.y = Math.max(groundHeight, this.position.y);

      // Pitch based on ground slope (for ramps)
      if (ground.onRamp) {
        const targetPitch = -Math.asin(ground.normal.z);
        this.pitchRad += (targetPitch - this.pitchRad) * Math.min(1, 8 * dt);
      } else {
        this.pitchRad += (0 - this.pitchRad) * Math.min(1, 5 * dt);
      }
    }

    // Acceleration estimate (world + local components) for camera/visual effects.
    if (dt > 1e-6) {
      this.velocity.subtractToRef(this.prevVelocity, this.accelWorld).scaleInPlace(1 / dt);
      this.accelWorld.y = 0;
      this.accelLongMps2 = Vector3.Dot(this.accelWorld, this.forwardVec);
      this.accelLatMps2 = Vector3.Dot(this.accelWorld, this.rightVec);
      this.prevVelocity.copyFrom(this.velocity);
    } else {
      this.accelWorld.set(0, 0, 0);
      this.accelLongMps2 = 0;
      this.accelLatMps2 = 0;
    }
  }
}
