import { BoilerplateScene, CONSOLE } from "../boilerplate.scene";

import { KEYS, SPRITES, CONSTANTS } from "./sandbox.constants";
import { levels } from "./sandbox.levels";
import { PaddleData, SceneState } from "./sandbox.models";

export class SanboxScene extends BoilerplateScene {
  constructor() {
    super("SandboxScene");
  }

  protected get state() {
    return this.data.get(KEYS.RUNTIME_DATA) as SceneState;
  }

  protected get levelData() {
    return levels[this.gameState.levelIndex];
  }

  protected get ball() {
    return this.children.getByName(KEYS.NAME_BALL) as Phaser.Physics.Matter.Image;
  }

  protected get paddle() {
    return this.children.getByName(KEYS.NAME_PADDLE) as Phaser.Physics.Matter.Image;
  }

  protected get paddleData() {
    return this.paddle?.data.get(KEYS.RUNTIME_DATA) as PaddleData;
  }

  init() {
    super.init();

    const startingRuntimeData: SceneState = {
      started: false,
      stickToPaddle: true,
    };
    this.data.set(KEYS.RUNTIME_DATA, startingRuntimeData);

    this.input.on("pointerdown", this.onClick, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.keyboard.on("keydown-LEFT", this.onLeft, this);
    this.input.keyboard.on("keydown-RIGHT", this.onRight, this);
  }

  preload() {
    super.preload();

    this.load.image(SPRITES.BALL, "assets/ball.png");
    this.load.image(SPRITES.HUD, "assets/hud.png");
    this.load.image(SPRITES.PADDLE, "assets/paddle-wide.png");

    this.load.image(SPRITES.TILES, "assets/tiles.png");
    this.load.tilemapTiledJSON(this.levelData.tilemapUrl, this.levelData.tilemapUrl);
  }

  create() {
    super.create();

    this.createHud();
    this.createLevel();
    this.createPaddle();
    this.createBall();
    this.finalizeCreation();
  }

  protected createHud() {
    this.add.image(256, 0, SPRITES.HUD).setOrigin(0, 0);

    // Title
    this.add.bitmapText(CONSOLE.CONSOLE_X - 2, 4, CONSOLE.ATARI, this.levelData.title, 8).setTint(0xbfca87);

    // Watches
    this.logVelocity(0, 0);
    this.logPaddle();
  }

  protected createLevel() {
    const map = this.add.tilemap(this.levelData.tilemapUrl);
    const tileset = map.addTilesetImage(KEYS.TILESET, SPRITES.TILES, 16, 16, 0, 0);
    var monolayer = map.createLayer(0, tileset);

    monolayer.setCollisionByProperty({ collides: true });
    this.matter.world.convertTilemapLayer(monolayer);

    monolayer.getTilesWithin(0, 0, monolayer.layer.width, monolayer.layer.height, { isColliding: true }).forEach((tile) => {
      const matterTileBody = this.getTileMatterBody(tile);
      matterTileBody.setBounce(1);
      matterTileBody.setFriction(0, 0, 0);
    });
  }

  protected createPaddle() {
    const paddle = this.matter.add.image(this.levelData.paddleStart.x, this.levelData.paddleStart.y, SPRITES.PADDLE, null, {
      isStatic: true,
    });
    paddle.setName(KEYS.NAME_PADDLE);

    const paddleData: PaddleData = { velocityX: 0, velocityY: 0 };
    paddle.setDataEnabled();
    paddle.setData(KEYS.RUNTIME_DATA, paddleData);
  }

  protected createBall() {
    const ball = this.matter.add.image(0, 0, SPRITES.BALL, null, { circleRadius: 4 });
    ball.setName(KEYS.NAME_BALL);
    ball.setBounce(1);
    ball.setFriction(0, 0, 0);
    // ball.setFixedRotation();
    this.stickBallToPaddle();
    this.matter.body.setInertia(ball.body as MatterJS.BodyType, Infinity);
  }

  protected finalizeCreation() {
    this.levelData.description.forEach((line) => this.log(line));
    // this.log("Click to start.");
  }

  // Update loop & game logic //

  update(time: number, delta: number): void {
    this.updatePaddle(delta);
    this.updateBall(delta);
    if (this.state.started) {
    } else {
      this.stickBallToPaddle();
    }
  }

  private updatePaddle(dt: number) {
    const { paddle, paddleData } = this;
    if (paddle && paddleData) {
      const minX = CONSTANTS.PADDLE_X_MIN + paddle.width / 2;
      const maxX = CONSTANTS.PADDLE_X_MAX - paddle.width / 2;
      paddle.x = Phaser.Math.Clamp(paddle.x + paddleData.velocityX / dt, minX, maxX);
      paddle.y = Phaser.Math.Clamp(paddle.y + paddleData.velocityY / dt, CONSTANTS.PADDLE_Y_MIN, CONSTANTS.PADDLE_Y_MAX);

      paddleData.velocityX = 0;
      paddleData.velocityY = 0;
    }
  }

  private updateBall(dt: number) {
    const { ball } = this;
    if (ball) {
      this.logVelocity();
      this.logPaddle();

      if (this.state.stickToPaddle) {
        this.stickBallToPaddle();
      }
    }
  }

  private stickBallToPaddle() {
    const { ball, paddle } = this;
    if (ball && paddle) {
      ball.x = paddle.x;
      ball.y = paddle.y - 10;
    }
  }

  // Console //

  protected logVelocity() {
    let bmpText = this.children.getByName(KEYS.TXT_VELOCITY) as Phaser.GameObjects.BitmapText;
    if (!bmpText) {
      bmpText = this.add
        .bitmapText(CONSOLE.CONSOLE_X, CONSTANTS.CONSOLE_VELOCITY_Y, CONSOLE.ATARI, "", 8)
        .setTint(0xbfca87)
        .setName(KEYS.TXT_VELOCITY);
    }

    const { ball } = this;
    if (ball) {
      const { x, y } = ball.body.velocity;
      bmpText.setText([`velocity:`, `${Phaser.Math.RoundTo(x, -1)}, ${Phaser.Math.RoundTo(y, -1)}`]);
    }
  }

  protected logPaddle() {
    let bmpText = this.children.getByName(KEYS.TXT_PADDLE_X) as Phaser.GameObjects.BitmapText;
    if (!bmpText) {
      bmpText = this.add
        .bitmapText(CONSOLE.CONSOLE_X, CONSTANTS.CONSOLE_PADDLE_Y, CONSOLE.ATARI, "", 8)
        .setTint(0xbfca87)
        .setName(KEYS.TXT_PADDLE_X);
    }

    const { paddle } = this;
    if (paddle) {
      bmpText.setText([`paddle x:`, `${Phaser.Math.RoundTo(paddle.x, -2)}, ${Phaser.Math.RoundTo(paddle.y, -2)}`]);
    }
  }

  // Event & input handling //

  protected onClick(evt) {
    this.input.mouse.requestPointerLock();

    if (this.state.started) {
      this.stickOrThrow();
    } else {
      this.startPlaying();
    }
  }

  protected onPointerMove(evt) {
    // use evet.velocity.x and .y in default mode (not locked)
    // console.log(evt.velocity.x + ", " + evt.velocity.y);

    // Use evt.movementX and Y in pointer lock mode
    // console.log(evt.movementX + ", " + evt.movementY);

    const { paddleData } = this;
    if (paddleData) {
      paddleData.velocityX = evt.movementX * CONSTANTS.MOUSE_SENSITIVITY;
      paddleData.velocityY = evt.movementY * CONSTANTS.MOUSE_SENSITIVITY;
    }
  }

  protected onLeft() {
    this.gameState.levelIndex--;
    if (this.gameState.levelIndex < 0) {
      this.gameState.levelIndex = levels.length - 1;
    }
    this.scene.restart();
  }

  protected onRight() {
    this.gameState.levelIndex++;
    if (this.gameState.levelIndex >= levels.length) {
      this.gameState.levelIndex = 0;
    }
    this.scene.restart();
  }

  // Gameplay lifecycle //

  protected startPlaying() {
    this.state.started = true;
    this.throwBall();
  }

  protected stickOrThrow() {
    if (this.state.stickToPaddle) {
      this.throwBall();
    } else {
      this.stickBall();
    }
  }

  protected stickBall() {
    if (this.ball) {
      this.ball.setVelocity(0, 0);
      this.state.stickToPaddle = true;
    }
  }

  protected throwBall() {
    if (this.ball) {
      this.state.stickToPaddle = false;
      this.ball.setVelocity(this.levelData.initialVelocity.x, this.levelData.initialVelocity.y);
    }
  }
}
