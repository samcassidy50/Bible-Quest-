import Phaser from 'phaser';
import { eventsBetween, localTime, samplePose, type Clip } from '../../core/anim/clip';
import { HERO_CLIPS, type HeroClipName } from '../../core/anim/heroClips';
import { lerpPose, type Pose } from '../../core/anim/pose';

const OUTLINE = 0x2b1d14;
const LINE = 4;
const SKIN = 0xf1c27d;
const SKIN_BACK = 0xd9a866;
const HAIR = 0x5a3a22;
const TUNIC = 0x2e86de;
const TUNIC_BACK = 0x2468b0;
const TRIM = 0xf4c95d;
const LEGGING = 0x5a3b28;
const LEGGING_BACK = 0x46301f;
const SANDAL = 0x8b5a2b;

const HIP_Y = -54;
const BLEND_MS = 90;
const deg = Phaser.Math.DegToRad;

type G = Phaser.GameObjects.Graphics;

/** Fills then outlines, cartoon style. */
function outlined(g: G, fill: number, draw: (g: G, mode: 'fill' | 'stroke') => void): G {
  g.fillStyle(fill, 1);
  draw(g, 'fill');
  g.lineStyle(LINE, OUTLINE, 1);
  draw(g, 'stroke');
  return g;
}

const roundRect =
  (x: number, y: number, w: number, h: number, r: number) => (g: G, mode: 'fill' | 'stroke') =>
    mode === 'fill' ? g.fillRoundedRect(x, y, w, h, r) : g.strokeRoundedRect(x, y, w, h, r);

const circle = (x: number, y: number, r: number) => (g: G, mode: 'fill' | 'stroke') =>
  mode === 'fill' ? g.fillCircle(x, y, r) : g.strokeCircle(x, y, r);

const ellipse = (x: number, y: number, w: number, h: number) => (g: G, mode: 'fill' | 'stroke') =>
  mode === 'fill' ? g.fillEllipse(x, y, w, h) : g.strokeEllipse(x, y, w, h);

const poly = (points: number[][]) => (g: G, mode: 'fill' | 'stroke') => {
  const pts = points.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  return mode === 'fill' ? g.fillPoints(pts, true) : g.strokePoints(pts, true);
};

interface Joints {
  body: Phaser.GameObjects.Container;
  hips: Phaser.GameObjects.Container;
  torso: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Container;
  shoulderB: Phaser.GameObjects.Container;
  elbowB: Phaser.GameObjects.Container;
  shoulderF: Phaser.GameObjects.Container;
  elbowF: Phaser.GameObjects.Container;
  sword: Phaser.GameObjects.Container;
  thighB: Phaser.GameObjects.Container;
  kneeB: Phaser.GameObjects.Container;
  thighF: Phaser.GameObjects.Container;
  kneeF: Phaser.GameObjects.Container;
}

/**
 * The hero: an original chibi pilgrim drawn as jointed vector parts and animated with keyframed
 * poses (core/anim). Origin is at the feet; faces right.
 */
export class HeroRig extends Phaser.GameObjects.Container {
  private readonly j: Joints;
  private clip: Clip = HERO_CLIPS.idle;
  private time = 0;
  private base: HeroClipName = 'idle';
  private pose: Pose = samplePose(HERO_CLIPS.idle, 0);
  private blendFrom?: Pose;
  private blendT = 0;
  private finish?: () => void;
  private onEvent?: (name: string) => void;
  /** Loops stay on their first frame (?freeze=1 screenshots); one-shots still play. */
  frozen = false;
  /** Every clip started, oldest first (exposed to tests). */
  readonly history: string[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.j = this.build();
    this.apply(this.pose);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
      this.finish?.();
    });
    scene.add.existing(this);
  }

  get currentClip(): string {
    return this.clip.name;
  }

  /** Switches the looping base animation (idle or run) and starts it now. */
  loop(name: 'idle' | 'run'): void {
    this.base = name;
    if (this.clip.name !== name) this.start(HERO_CLIPS[name]);
  }

  /**
   * Plays a one-shot clip. `onEvent` receives events such as "impact". Resolves when the clip
   * ends (then returns to the base loop unless the clip holds its last frame).
   * Any events not reached are still delivered if the clip is interrupted, so hits always land.
   */
  play(name: HeroClipName, onEvent?: (name: string) => void): Promise<void> {
    const clip: Clip = HERO_CLIPS[name];
    if (clip.loop) {
      this.loop(name as 'idle' | 'run');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.start(clip, onEvent, resolve);
    });
  }

  /** Shows one frame of a clip without ticking (animation viewer contact sheets). */
  showFrame(name: HeroClipName, t: number): void {
    this.clip = HERO_CLIPS[name];
    this.time = t;
    this.blendFrom = undefined;
    this.frozen = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.apply(samplePose(this.clip, t));
  }

  face(dir: 1 | -1): void {
    this.setScale(Math.abs(this.scaleX) * dir, this.scaleY);
  }

  private start(clip: Clip, onEvent?: (name: string) => void, finish?: () => void): void {
    this.flushPrevious();
    this.blendFrom = this.pose;
    this.blendT = 0;
    this.clip = clip;
    this.time = 0;
    this.onEvent = onEvent;
    this.finish = finish;
    this.history.push(clip.name);
    if (this.history.length > 30) this.history.shift();
  }

  /** Delivers outstanding events and resolves the clip being replaced. */
  private flushPrevious(): void {
    if (!this.clip.loop) {
      for (const e of eventsBetween(this.clip, this.time, this.clip.duration)) this.onEvent?.(e);
    }
    const done = this.finish;
    this.finish = undefined;
    this.onEvent = undefined;
    done?.();
  }

  private onUpdate(_t: number, delta: number): void {
    const dt = delta * this.scene.time.timeScale;
    const clip = this.clip;
    const before = this.time;
    if (!(clip.loop && this.frozen)) this.time += dt;

    if (!clip.loop) {
      for (const e of eventsBetween(clip, before, this.time)) this.onEvent?.(e);
    }

    let pose = samplePose(clip, this.time);
    if (this.blendFrom) {
      this.blendT += dt;
      if (this.blendT >= BLEND_MS) this.blendFrom = undefined;
      else pose = lerpPose(this.blendFrom, pose, this.blendT / BLEND_MS);
    }
    this.pose = pose;
    this.apply(pose);

    if (!clip.loop && localTime(clip, this.time) >= clip.duration) {
      const done = this.finish;
      this.finish = undefined;
      this.onEvent = undefined;
      if (!clip.hold) this.start(HERO_CLIPS[this.base]);
      done?.();
    }
  }

  private apply(p: Pose): void {
    const j = this.j;
    j.body.setRotation(deg(p.body)).setScale(1 / Math.sqrt(p.squash), p.squash);
    j.hips.setPosition(p.x, HIP_Y + p.y);
    j.torso.setRotation(deg(p.lean));
    j.head.setRotation(deg(p.head));
    j.shoulderB.setRotation(deg(-p.armB));
    j.elbowB.setRotation(deg(-p.elbowB));
    j.shoulderF.setRotation(deg(-p.armF));
    j.elbowF.setRotation(deg(-p.elbowF));
    j.sword.setRotation(deg(p.sword));
    j.thighB.setRotation(deg(-p.thighB));
    j.kneeB.setRotation(deg(p.kneeB));
    j.thighF.setRotation(deg(-p.thighF));
    j.kneeF.setRotation(deg(p.kneeF));
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private g(): G {
    return this.scene.add.graphics();
  }

  private build(): Joints {
    const c = (x = 0, y = 0) => this.scene.add.container(x, y);

    const body = c();
    const hips = c(0, HIP_Y);
    body.add(hips);

    const leg = (dx: number, legging: number) => {
      const thigh = c(dx, 0);
      thigh.add(outlined(this.g(), legging, roundRect(-9, -4, 18, 30, 8)));
      const knee = c(0, 24);
      knee.add(outlined(this.g(), legging, roundRect(-8, -4, 16, 24, 7)));
      // Sandal pointing forward, with a strap.
      const foot = this.g();
      outlined(foot, SANDAL, roundRect(-9, 16, 26, 11, 5));
      foot.lineStyle(3, OUTLINE, 1).lineBetween(-6, 10, 4, 18);
      knee.add(foot);
      thigh.add(knee);
      return { thigh, knee };
    };
    const back = leg(-6, LEGGING_BACK);
    const front = leg(6, LEGGING);

    const torso = c();
    const arm = (dx: number, sleeve: number, skin: number) => {
      const shoulder = c(dx, -38);
      shoulder.add(outlined(this.g(), sleeve, roundRect(-8, -6, 16, 26, 8)));
      const elbow = c(0, 18);
      elbow.add(outlined(this.g(), skin, roundRect(-6, -3, 12, 20, 6)));
      elbow.add(outlined(this.g(), skin, circle(0, 19, 8)));
      shoulder.add(elbow);
      return { shoulder, elbow };
    };
    const armB = arm(-4, TUNIC_BACK, SKIN_BACK);

    // Tunic: flared hem, belt with buckle, V collar.
    const tunic = this.g();
    outlined(
      tunic,
      TUNIC,
      poly([
        [-24, 10],
        [26, 10],
        [20, -46],
        [-18, -46],
      ]),
    );
    outlined(tunic, 0x6b4423, roundRect(-23, -8, 47, 9, 3));
    outlined(tunic, TRIM, roundRect(4, -10, 10, 13, 2));
    tunic.lineStyle(3, TRIM, 1).lineBetween(-24, 8, 26, 8);
    tunic.lineStyle(3, OUTLINE, 1).lineBetween(-4, -46, 4, -34).lineBetween(4, -34, 10, -46);

    const head = c(0, -46);
    const h = this.g();
    outlined(h, HAIR, circle(-4, -40, 37)); // back of hair
    outlined(h, SKIN, circle(-12, -30, 8)); // ear
    outlined(h, SKIN, circle(6, -32, 33)); // face
    // Fringe and headband.
    outlined(
      h,
      HAIR,
      poly([
        [-30, -52],
        [-10, -74],
        [24, -70],
        [40, -50],
        [26, -56],
        [18, -46],
        [8, -56],
        [-4, -48],
        [-14, -56],
      ]),
    );
    outlined(h, TUNIC, roundRect(-34, -58, 70, 9, 4));
    outlined(h, TRIM, circle(-30, -54, 5));
    // Big chibi eyes facing right, with highlights.
    for (const ex of [14, 30]) {
      outlined(h, 0x2a1a10, ellipse(ex, -32, 10, 15));
      h.fillStyle(0xffffff, 1).fillCircle(ex + 2, -36, 3);
    }
    h.fillStyle(0xf28b82, 0.6).fillEllipse(30, -18, 12, 6); // cheek
    h.lineStyle(3, OUTLINE, 1).beginPath().arc(24, -16, 6, deg(20), deg(140)).strokePath(); // smile
    head.add(h);

    const armF = arm(6, TUNIC, SKIN);
    const sword = c(0, 19);
    const s = this.g();
    outlined(
      s,
      0xdfe6ee,
      poly([
        [-5, -12],
        [5, -12],
        [5, -70],
        [0, -82],
        [-5, -70],
      ]),
    );
    s.lineStyle(2, 0x9aa7b4, 1).lineBetween(0, -16, 0, -72);
    outlined(s, 0x6b4423, roundRect(-3, -10, 6, 18, 2)); // grip
    outlined(s, TRIM, roundRect(-13, -15, 26, 6, 3)); // guard
    outlined(s, TRIM, circle(0, 11, 4)); // pommel
    sword.add(s);
    // The sword sits in the hand, drawn over the fingers.
    armF.elbow.add(sword);

    // The big chibi head is drawn over the front arm so raised arms tuck behind it.
    torso.add([armB.shoulder, tunic, armF.shoulder, head]);
    hips.add([back.thigh, front.thigh, torso]);

    const shadow = this.g();
    shadow.fillStyle(0x000000, 0.25).fillEllipse(0, 0, 100, 20);
    this.add([shadow, body]);

    return {
      body,
      hips,
      torso,
      head,
      shoulderB: armB.shoulder,
      elbowB: armB.elbow,
      shoulderF: armF.shoulder,
      elbowF: armF.elbow,
      sword,
      thighB: back.thigh,
      kneeB: back.knee,
      thighF: front.thigh,
      kneeF: front.knee,
    };
  }
}
