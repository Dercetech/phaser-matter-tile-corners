export interface LevelData {
  title: string;
  description: string[];
  tilemapUrl: string;
  paddleStart: { x: number; y: number };
  initialVelocity: { x: number; y: number };
}
