import { LevelData } from "../../models/level-data.models";

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
    description: ["First issue:", "tile corners", "make the ball", "bounce backwards", ...instructions].reverse(),
    tilemapUrl: "assets/sandbox.json",
    paddleStart: { x: 98, y: 212 },
    initialVelocity: { x: 2.5, y: 2.5 },
  },

  {
    title: "Velocity = 2",
    description: ["ball doesn't", "bounce back when", "velocity is of 2", ...instructions].reverse(),
    tilemapUrl: "assets/sandbox.json",
    paddleStart: { x: 148, y: 212 },
    initialVelocity: { x: 2, y: -2 },
  },
  {
    title: "paddle.bat /bricks",
    description: ["Adding bricks", "velocity: 2", ...instructions].reverse(),
    tilemapUrl: "assets/bricks.json",
    paddleStart: { x: 146, y: 212 },
    initialVelocity: { x: 2, y: -2 },
  },
]; //.reverse();
