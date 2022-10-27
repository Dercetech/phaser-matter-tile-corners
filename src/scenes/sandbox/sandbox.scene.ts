import { levels, AtariFont } from "../../asset-meta";
import { createTilemapIslandBodies, TILEMAP_PROPERTIES, getUrlParam, setUrlParameter, TileIsland } from "../../utils";

import { BoilerplateScene, CONSOLE } from "../boilerplate.scene";

import { KEYS, SPRITES, CONSTANTS } from "./sandbox.constants";
import { PaddleData, SceneState } from "./sandbox.models";

enum COLLISION_FILTER_CATEGORY {
  BALL = 0b0000000000000010,
  SOLID = 0b000000000000100,
  PADDLE = 0b00000000001000,
  TRIGGER = 0b0000000010000,
  IGNORE = 0b00000000100000,
}

export class SanboxScene extends BoilerplateScene {
  constructor() {
    super(KEYS.SCENE);
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

    try {
      const levelIndex = parseInt(getUrlParam(KEYS.LEVEL));
      if (levelIndex >= 0 && levelIndex < levels.length) {
        this.gameState.levelIndex = levelIndex;
      } else {
        setUrlParameter(KEYS.LEVEL, 0);
        this.gameState.levelIndex = 0;
      }
    } catch (e: any) {
      // Ignore, no param was issued by URL
    }

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
    this.add.bitmapText(CONSOLE.CONSOLE_X - 2, 4, AtariFont.key, this.levelData.title, 8).setTint(0xbfca87);

    // Watches
    this.logVelocity();
    this.logPaddle();
    this.logCollidesWith();
  }

  protected createLevel() {
    const map = this.add.tilemap(this.levelData.tilemapUrl);
    const tileset = map.addTilesetImage(KEYS.TILESET, SPRITES.TILES, 16, 16, 0, 0);
    var tilemapLayer = map.createLayer(0, tileset);

    // First we create tiles that have the "collides" boolean property set to "true" in the tileset
    // Rem: let's also create custom shapes based on the "collision group" property (ie. this is the result of creating custom tiled bodies)
    this.createTilesFromPhaserParsing(tilemapLayer);

    // Then we looks for islands and create large polygons to avoid corners / verts across long flat surfaces that otherwise cause bad bounces
    this.createTileIslandsUsingDercetechParser(tilemapLayer);
  }

  /** This is the built-in Phaser approach, creating one body per tile. */
  protected createTilesFromPhaserParsing(tilemapLayer: Phaser.Tilemaps.TilemapLayer) {
    // Allow Phaser to generate custom tiled bodies (see Mike Westhad's tutorial: https://itnext.io/modular-game-worlds-in-phaser-3-tilemaps-4-meet-matter-js-abf4dfa65ca1)
    tilemapLayer.setCollisionFromCollisionGroup();

    // Ask Phaser to make tile collideable when they're marked with the boolean (true) property "collides" in the tileset
    tilemapLayer.setCollisionByProperty({ [TILEMAP_PROPERTIES.COLLISION_DEFAULT]: true });

    // Ask Phaser to create a tile body for each collidable tile (custom shapes AND default square shapes)
    this.matter.world.convertTilemapLayer(tilemapLayer);

    // Post processing
    tilemapLayer.getTilesWithin(0, 0, tilemapLayer.layer.width, tilemapLayer.layer.height, { isColliding: true }).forEach((tile) => {
      const matterTileBody = this.getTileMatterBody(tile);
      // Assign friction & restitution based on the tile's properties
      this.enrichBodyFromProperties(tile.properties, matterTileBody.body);

      // Assign collision category based on the tile's properties
      const category = this.getCollisionFilterCategoryByName(tile.properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY]);
      matterTileBody.body.collisionFilter.category = category;
    });
  }

  protected createTileIslandsUsingDercetechParser(tilemapLayer: Phaser.Tilemaps.TilemapLayer) {
    tilemapLayer.setCollisionByProperty({ [TILEMAP_PROPERTIES.ISLAND]: true }); // this sets the "interresting" faces, "faceLeft" & co are necessary to create islands
    createTilemapIslandBodies(this, tilemapLayer, {
      setBodyProperties: this.enrichBodyFromProperties,
      getCollisionFilterCategoryByName: this.getCollisionFilterCategoryByName,
    });
  }

  protected enrichBodyFromProperties(properties: Record<string, any>, body: MatterJS.BodyType) {
    if (properties) {
      if (properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY]) {
        const collisionCategory = properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY];
        switch (collisionCategory) {
          // You crash into mud
          case "MUD": {
            body.friction = 1;
            body.restitution = 0;
            break;
          }

          // You jump nicely off bouncy terrain
          case "BOUNCY": {
            body.friction = 0;
            body.restitution = 1;
            break;
          }

          // Sensors don't interfere with motion but still register collisions
          case "SENSOR": {
            body.isSensor = true;
            break;
          }
        }
      }
    }
  }

  protected getCollisionFilterCategoryByName(tiledCollisionCategory: string) {
    switch (tiledCollisionCategory) {
      case "MUD": {
      }

      case "BOUNCY": {
        return COLLISION_FILTER_CATEGORY.SOLID;
      }

      case "SENSOR": {
        return COLLISION_FILTER_CATEGORY.TRIGGER;
      }

      case "GHOST": {
        return COLLISION_FILTER_CATEGORY.IGNORE;
      }
    }

    return 0b0;
  }

  protected createPaddle() {
    const paddle = this.matter.add.image(this.levelData.paddleStart.x, this.levelData.paddleStart.y, SPRITES.PADDLE, null, {
      isStatic: true,
    });
    paddle.setName(KEYS.NAME_PADDLE);

    const paddleData: PaddleData = { velocityX: 0, velocityY: 0 };
    paddle.setDataEnabled();
    paddle.setData(KEYS.RUNTIME_DATA, paddleData);

    paddle.setFriction(0, 0, 0);
    paddle.setBounce(1);
    paddle.setCollisionCategory(COLLISION_FILTER_CATEGORY.PADDLE);
  }

  protected createBall() {
    const ball = this.matter.add.image(0, 0, SPRITES.BALL, null, { circleRadius: 4 });
    ball.setName(KEYS.NAME_BALL);

    ball.setBounce(0); // This makes the ball "inherit" the bouncy-ness of the surface it hits
    ball.setFriction(1, 0, 0); // Same, solid friction is 1 so that it inherits the surface's friction
    ball.setFixedRotation();

    ball.setCollisionCategory(COLLISION_FILTER_CATEGORY.BALL);
    ball.setCollidesWith([COLLISION_FILTER_CATEGORY.PADDLE, COLLISION_FILTER_CATEGORY.SOLID, COLLISION_FILTER_CATEGORY.TRIGGER]);

    ball.setOnCollide((data) => this.collider_ball(data));
    ball.setOnCollideEnd((data) => this.collider_ballEnd(data));

    this.stickBallToPaddle();

    // We don't want infinite bouncing - some surfaces might need to kill the velocity (like mud)
    // this.matter.body.setInertia(ball.body as MatterJS.BodyType, Infinity);
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
        .bitmapText(CONSOLE.CONSOLE_X, CONSTANTS.CONSOLE_VELOCITY_Y, AtariFont.key, "", 8)
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
        .bitmapText(CONSOLE.CONSOLE_X, CONSTANTS.CONSOLE_PADDLE_Y, AtariFont.key, "", 8)
        .setTint(0xbfca87)
        .setName(KEYS.TXT_PADDLE_X);
    }

    const { paddle } = this;
    if (paddle) {
      bmpText.setText([`paddle x:`, `${Phaser.Math.RoundTo(paddle.x, -2)}, ${Phaser.Math.RoundTo(paddle.y, -2)}`]);
    }
  }

  protected logCollidesWith(collidesWith?: string) {
    let bmpText = this.children.getByName(KEYS.TXT_COLLIDES_WITH) as Phaser.GameObjects.BitmapText;
    if (!bmpText) {
      bmpText = this.add
        .bitmapText(CONSOLE.CONSOLE_X, CONSTANTS.CONSOLE_COLLIDES_WITH_Y, AtariFont.key, "", 8)
        .setTint(0xbfca87)
        .setName(KEYS.TXT_COLLIDES_WITH);
    }

    bmpText.setText([`collides with:`, `${collidesWith || ""}`]);
  }

  // Event & input handling //

  protected onClick(evt: any) {
    this.input.mouse.requestPointerLock();

    if (this.state.started) {
      this.stickOrThrow();
    } else {
      this.startPlaying();
    }
  }

  protected onPointerMove(evt: any) {
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
    setUrlParameter(KEYS.LEVEL, this.gameState.levelIndex);
    this.scene.restart();
  }

  protected onRight() {
    this.gameState.levelIndex++;
    if (this.gameState.levelIndex >= levels.length) {
      this.gameState.levelIndex = 0;
    }
    setUrlParameter(KEYS.LEVEL, this.gameState.levelIndex);
    this.scene.restart();
  }

  // Collision handling //

  private collider_ball(data: Phaser.Types.Physics.Matter.MatterCollisionData) {
    const otherBody = data.bodyA.gameObject === this.ball ? data.bodyB : data.bodyA;

    const gameObject = otherBody.gameObject;

    if (otherBody.isSensor) {
      this.logCollidesWith("SENSOR");
      // Possible bug in phaser: matter sensor bodies.
      // TODO Jem: investigate
      // TODO: recover sensor trigger properties to activate trigger - eg. a pressure plate, a detector, etc.
    } else if (gameObject instanceof Phaser.Physics.Matter.Image) {
      if (gameObject === this.paddle) {
        this.logCollidesWith("PADDLE");
      }
    } else if (gameObject instanceof Phaser.Physics.Matter.TileBody) {
      this.logCollidesWith("TILE: " + gameObject.tile.properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY]);
    } else if (gameObject instanceof TileIsland) {
      this.logCollidesWith("ISLAND: " + gameObject.properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY]);
    }
  }

  private collider_ballEnd(data: Phaser.Types.Physics.Matter.MatterCollisionData) {
    // const otherBody = data.bodyA.gameObject === this.ball ? data.bodyB : data.bodyA;
    // this.logCollidesWith();
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
