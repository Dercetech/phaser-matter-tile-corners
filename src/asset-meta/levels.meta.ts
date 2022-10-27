import { LevelData } from "../models/level-data.models";

const instructions: string[] = [
  "- - - - - - - -",
  "d: debug physics",
  "r: reset scene",
  "btn1: grab/shoot",
  "left: prev test",
  "right: next test",
];

export const levels: LevelData[] = [
  {
    title: "What's The Matter",
    description: ["Issue:", "tile corners", "make the ball", "bounce backwards", ...instructions].reverse(),
    tilemapUrl: "assets/sandbox.json",
    paddleStart: { x: 98, y: 212 },
    initialVelocity: { x: 2.5, y: -2.5 },
  },
  {
    title: "solution.bat",
    description: ["tile 'islands'", "are generated", "to share large", "polygon bodies", ...instructions].reverse(),
    tilemapUrl: "assets/islands.json",
    paddleStart: { x: 98, y: 212 },
    initialVelocity: { x: 2.1, y: -2.1 },
  },
]; //.reverse();
