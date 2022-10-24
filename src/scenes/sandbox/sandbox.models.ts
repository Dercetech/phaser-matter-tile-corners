export interface SceneState {
  started: boolean;
  stickToPaddle: boolean;
}

export interface PaddleData {
  velocityX: number;
  velocityY: number;
}

export interface LevelData {
  title: string;
  description: string[];
  tilemapUrl: string;
  paddleStart: { x: number; y: number };
  initialVelocity: { x: number; y: number };
}
