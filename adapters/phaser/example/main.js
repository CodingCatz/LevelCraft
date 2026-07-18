/**
 * Minimal Phaser 3 demo for the official LevelCraft loader.
 * Serves with any static server from adapters/phaser/example/ (or repo root).
 *
 * Controls: ← → move, ↑ / space jump. Overlap hazard = reset. Touch switch = tint door.
 */
import { loadLevelCraft } from '../levelcraft-phaser.js';

const UNIT_PX = 32;

class DemoScene extends Phaser.Scene {
  constructor() {
    super('demo');
  }

  preload() {
    this.load.json('level', './level-demo.json');
  }

  create() {
    const json = this.cache.json.get('level');
    this.level = loadLevelCraft(this, json, {
      unitPx: UNIT_PX,
      debug: true,
      fillAlpha: 0.85,
    });

    this.cameras.main.setBounds(0, 0, this.level.world.w, this.level.world.h);
    this.physics.world.setBounds(0, 0, this.level.world.w, this.level.world.h);
    this.add
      .rectangle(
        this.level.world.w / 2,
        this.level.world.h / 2,
        this.level.world.w,
        this.level.world.h,
        0x1a202c,
      )
      .setDepth(-10);

    // Decor: draw as soft green blocks (no physics)
    for (const d of this.level.decor) {
      this.add.rectangle(d.cx, d.cy, d.w, d.h, 0x68d391, 0.55).setDepth(-1);
    }

    // Labels for object zones
    this.level.objects.getChildren().forEach((go) => {
      const type = go.lcType || go.getData('type');
      const id = go.lcId || go.getData('id');
      this.add
        .text(go.x, go.y - 18, `${type}\n${id}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#e2e8f0',
          align: 'center',
        })
        .setOrigin(0.5);
    });

    const spawn = this.level.spawn || { x: 64, y: 64 };
    this.player = this.add.rectangle(spawn.x, spawn.y, 20, 28, 0xf6e05e);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setMaxVelocity(280, 600);
    this.player.body.setDragX(900);

    this.physics.add.collider(this.player, this.level.solids);

    this.physics.add.overlap(this.player, this.level.hazards, () => {
      this.resetPlayer('hazard');
    });

    this.physics.add.overlap(this.player, this.level.objects, (_p, obj) => {
      const type = obj.lcType || obj.getData('type');
      if (type === 'switch' && !obj.getData('fired')) {
        obj.setData('fired', true);
        const targets = this.level.resolveLinks(obj);
        for (const t of targets) {
          if (t && t.setTint) t.setTint(0x48bb78);
          // zones have no setTint — tint debug gfx if present
          const gfx = typeof t.getData === 'function' ? t.getData('debugGfx') : null;
          if (gfx && gfx.setFillStyle) gfx.setFillStyle(0x48bb78, 0.7);
        }
        this.flash(`switch → ${targets.length} link(s)`);
      }
      if (type === 'goal') {
        this.flash('goal!');
      }
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ space: 'SPACE', r: 'R' });

    this.status = this.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#a0aec0',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.flash(
      `LevelCraft Phaser demo · solids ${this.level.solids.countActive()} · hazards ${this.level.hazards.countActive()} · objects ${this.level.objects.countActive()} · decor ${this.level.decor.length}`,
    );
  }

  flash(msg) {
    this._msg = msg;
    this._msgUntil = this.time.now + 2200;
  }

  resetPlayer(reason) {
    const spawn = this.level.spawn || { x: 64, y: 64 };
    this.player.setPosition(spawn.x, spawn.y);
    this.player.body.setVelocity(0, 0);
    this.flash(`reset (${reason})`);
  }

  update() {
    const body = this.player.body;
    const onFloor = body.blocked.down || body.touching.down;
    if (this.cursors.left.isDown) body.setVelocityX(-200);
    else if (this.cursors.right.isDown) body.setVelocityX(200);

    if ((this.cursors.up.isDown || this.keys.space.isDown) && onFloor) {
      body.setVelocityY(-380);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.resetPlayer('manual');

    this.cameras.main.centerOn(this.player.x, this.player.y);

    const msg =
      this.time.now < (this._msgUntil || 0)
        ? this._msg
        : '← → move · ↑/space jump · R reset · touch switch to resolveLinks(door)';
    this.status.setText(msg);
  }
}

// Phaser is loaded as a global from CDN in index.html
// eslint-disable-next-line no-undef
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#0d1117',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 980 }, debug: false },
  },
  scene: DemoScene,
});
