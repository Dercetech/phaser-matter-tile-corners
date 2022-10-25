import { AtariFont } from "../asset-meta";

import * as sandboxConstants from "./sandbox/sandbox.constants";

export class BootLoader extends Phaser.Scene {
  preload() {
    this.load.bitmapFont(AtariFont.key, AtariFont.url, AtariFont.meta);
  }

  create() {
    this.scene.stop(this);
    this.scene.start(sandboxConstants.KEYS.SCENE);
  }
}
