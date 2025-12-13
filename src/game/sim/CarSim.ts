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

export class CarSim {
  position = new Vector3(0, 0.55, 0);
  velocity = new Vector3(0, 0, 0);
  yawRad = 0;

  private steerSmoothed = 0;
  readonly forwardVec = new Vector3(0, 0, 1);
  readonly rightVec = new Vector3(1, 0, 0);
  private readonly tmpVel = new Vector3(0, 0, 0);
  private readonly tmpLat = new Vector3(0, 0, 0);

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
    this.steerSmoothed = 0;
    this.updateBasis();
  }

  get speedMps() {
    return this.velocity.length();
  }

  get forwardSpeedMps() {
    return Vector3.Dot(this.velocity, this.forwardVec);
  }

  update(dt: number, input: { throttle: number; brake: number; handbrake: number; steer: number }, surface: { grip: number; dragScale: number }) {
    const { throttle, brake, handbrake } = input;

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

    const engineA = throttle * this.params.engineAccel;
    const brakeA = brake * this.params.brakeDecel;
    const longA = engineA - Math.sign(vF) * brakeA;

    const dragA = this.params.drag * speed * speed + this.params.rolling * speed;
    const dragSigned = dragA * Math.sign(vF);

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
    this.tmpVel.y = 0;
    this.velocity.copyFrom(this.tmpVel);

    this.position.addInPlace(this.velocity.scale(dt));
    this.position.y = 0.55;
  }
}
