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
};

export class CarSim {
  position = new Vector3(0, 0.55, 0);
  velocity = new Vector3(0, 0, 0);
  yawRad = 0;
  pitchRad = 0; // For visual tilt on ramps
  isAirborne = false;
  airTime = 0;

  private steerSmoothed = 0;
  readonly forwardVec = new Vector3(0, 0, 1);
  readonly rightVec = new Vector3(1, 0, 0);
  private readonly tmpVel = new Vector3(0, 0, 0);
  private readonly tmpLat = new Vector3(0, 0, 0);

  private readonly gravity = 25; // Gravity in m/s²
  private readonly carHeight = 0.55; // Height of car centre above ground

  constructor(public readonly params: CarSimParams) {}

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
    this.updateBasis();
  }

  get speedMps() {
    return this.velocity.length();
  }

  get forwardSpeedMps() {
    return Vector3.Dot(this.velocity, this.forwardVec);
  }

  update(
    dt: number,
    input: { throttle: number; brake: number; handbrake: number; steer: number },
    surface: { grip: number; dragScale: number },
    ground: GroundInfo = { height: 0, normal: new Vector3(0, 1, 0), onRamp: false }
  ) {
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
      const steerAngle = this.steerSmoothed * this.params.maxSteerRad;
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
        const engineA = throttle * this.params.engineAccel;
        const brakeA = brake * this.params.brakeDecel;
        longA = engineA - (vF > 0 ? brakeA : -brakeA);
      }

      const dragA = this.params.drag * speed * speed + this.params.rolling * speed;
      const dragSigned = speed > 0.1 ? dragA * Math.sign(vF) : 0;

      const aLong = longA - dragSigned * surface.dragScale;
      const vF2 = vF + aLong * dt;

      const slipAngle = Math.atan2(vR, Math.abs(vF) + 1);
      const aLat = -slipAngle * this.params.lateralGrip * grip * Math.min(1, 0.25 + speed / 14);
      const vR2 = vR + aLat * dt;

      forward.scaleToRef(vF2, this.tmpVel);
      right.scaleToRef(vR2, this.tmpLat);
      this.tmpVel.addInPlace(this.tmpLat);
      const max = this.params.maxSpeed;
      const len = this.tmpVel.length();
      if (len > max) this.tmpVel.scaleInPlace(max / len);

      // Keep y velocity if on ramp
      if (ground.onRamp) {
        // Add upward velocity based on ramp slope and forward speed
        const slopeBoost = vF2 * ground.normal.z * -0.5;
        this.tmpVel.y = slopeBoost;
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
  }
}
