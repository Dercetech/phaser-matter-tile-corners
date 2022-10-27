import { AtariFont } from "../asset-meta";
import { PhaserMatterTileBody, GameData } from "../models";
enum REGISTRY_KEYS {
  GAME_STATE = "_state",
}

export enum CONSOLE {
  CONSOLE_X = 262,
  CONSOLE_TOP = 18,
  CONSOLE_LINEHEIGHT = 10,
  CONSOLE_0 = 0xffffff,
  CONSOLE_1 = 0x999999,
  CONSOLE_4 = 0x666666,
  CONSOLE_GREY_IDX = 8,
}

export class BoilerplateScene extends Phaser.Scene {
  private _consoleLines: Phaser.GameObjects.BitmapText[] = [];

  protected get gameState() {
    return this.registry.get(REGISTRY_KEYS.GAME_STATE) as GameData;
  }

  init() {
    // Shortcut: First run inits the game registry
    if (!this.gameState) {
      const gameData: GameData = { levelIndex: 0, drawPhysics: false };
      this.registry.set(REGISTRY_KEYS.GAME_STATE, gameData);
    }

    this.input.keyboard.on("keydown-D", this.onD, this);
    this.input.keyboard.on("keydown-R", this.onR, this);

    if (this.gameState.drawPhysics) {
      this.showPhysics();
    } else {
      this.hidePhysics();
    }
  }

  preload() {}

  create() {}

  update(time: number, delta: number): void {}

  // Console //

  protected log(line: string) {
    while (this._consoleLines.length > 12) {
      const bmpText = this._consoleLines.pop();
      bmpText.destroy();
    }

    this._consoleLines.forEach((bmpText, index) => {
      bmpText.y += CONSOLE.CONSOLE_LINEHEIGHT;
      if (index > 2 && index < CONSOLE.CONSOLE_GREY_IDX) {
        bmpText.setTint(CONSOLE.CONSOLE_1);
      } else if (index >= CONSOLE.CONSOLE_GREY_IDX) {
        bmpText.setTint(CONSOLE.CONSOLE_4);
      }
    });

    const bmpText = this.add.bitmapText(CONSOLE.CONSOLE_X, CONSOLE.CONSOLE_TOP, AtariFont.key, line, 8);
    this._consoleLines.unshift(bmpText);
  }

  protected clearConsole() {
    let line: Phaser.GameObjects.BitmapText;
    while ((line = this._consoleLines.pop())) {
      line.destroy();
    }
  }

  // Event & input handling //

  protected onD() {
    if (this.matter.world.drawDebug) {
      this.matter.world.debugGraphic.clear();
    }
    this.matter.world.drawDebug = !this.matter.world.drawDebug;
  }

  protected onR() {
    this.scene.restart();
  }

  // Physics //

  protected getTileMatterBody(tile: Phaser.Tilemaps.Tile) {
    if (tile.physics && (tile.physics as any).matterBody) {
      return (tile.physics as any).matterBody as PhaserMatterTileBody;
    }
    return null;
  }

  protected togglePhysics() {
    if (this.matter.world.drawDebug) {
      this.hidePhysics();
    } else {
      this.showPhysics();
    }
  }

  protected hidePhysics() {
    this.matter.world.debugGraphic.clear();
    this.matter.world.drawDebug = false;
  }

  protected showPhysics() {
    this.matter.world.drawDebug = true;
  }

  protected getEntityFromCollisionData(data: Phaser.Types.Physics.Matter.MatterCollisionData, entityDataKey: string) {
    let targetEntity: any;
    let otherEntity: any;

    const { bodyA, bodyB } = data;
    if (bodyA.gameObject && bodyA.gameObject.data && bodyA.gameObject.data.get("type") === entityDataKey) {
      targetEntity = bodyA.gameObject;

      if (bodyB.gameObject) {
        otherEntity = bodyB.gameObject;
      }
    }

    if (bodyB.gameObject && bodyB.gameObject.data && bodyB.gameObject.data.get("type") === entityDataKey) {
      targetEntity = bodyB.gameObject;

      if (bodyA.gameObject) {
        otherEntity = bodyA.gameObject;
      }
    }

    return { targetEntity, otherEntity };
  }
}
