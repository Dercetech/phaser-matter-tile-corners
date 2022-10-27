/**
 * @author       Jérémie Mercier <jem@dercetech.com>
 * @copyright    2022 Dercetech SRL (https://www.dercetech.com).
 * @license      {@link https://opensource.org/licenses/MIT|MIT License}
 */

export class TileIsland extends Phaser.GameObjects.GameObject {
  /** This is the properties map as recovered from a source tile. Careful here, we're using the COLLISION_CATEGORY to group tiles. If two different tileset tiles share the same COLLISION_CATEGORY but have other custom properties, then the result isn't merged (yet)*/
  properties: Record<string, any>;

  constructor(scene: Phaser.Scene) {
    super(scene, "TileIsland");
  }
}

/** Custom tile properties to define in the tileset. */
export enum TILEMAP_PROPERTIES {
  /** Phaser collision parsing property - used to have default square bodies on each tile marked with this property (boolean set to 'true') */
  COLLISION_DEFAULT = "collides",

  /** Collision category is for instance "WALL", "METAL", "DANGER" and allows enriching the tiles with gameplay behaviors as well as collision filtering */
  COLLISION_CATEGORY = "COLLISION_CATEGORY",
  /** ISLAND must be a boolean property and it tells the script what tiles should be considered when creating groups. */
  ISLAND = "ISLAND",
}

/** These two functions are run after creating an island and allow setting body properties such as restitution and friction as well as collision filter categories.
 * @see https://github.com/Dercetech/phaser-matter-tile-corners/blob/main/src/scenes/sandbox/sandbox.scene.ts : createTileIslandsUsingDercetechParser illustrates island post processing.
 */
interface PostProcessFunctions {
  setBodyProperties: (propertyMap: Record<string, any>, body: MatterJS.BodyType) => void;
  getCollisionFilterCategoryByName: (collisionCategoryName: string) => number;
}

/**
 * The Dercetech Island Parser create larger, single bodies out of contiguous tiles that share similar properties (see TILEMAP_PROPERTIES).
 * For instance, a single polygonal  body will be created to encompass all contiguous METAL tiles.
 *
 * @param {Phaser.Scene} scene the active Phaser scene with Matter where the island bodies will be created.
 *
 * @param {Phaser.Tilemaps.TilemapLayer} tilemapLayer the active tilemap layer that contains tiles to group into islands.
 * @param {PostProcessFunctions} postProcess  an optional set of functions to enrich the islands.
 */
export function createTilemapIslandBodies(
  scene: Phaser.Scene,
  tilemapLayer: Phaser.Tilemaps.TilemapLayer,
  postProcess?: PostProcessFunctions
) {
  const layerData = tilemapLayer.layer;
  const tiles = tilemapLayer.getTilesWithin(0, 0, layerData.width, layerData.height /*, { isColliding: true }*/);

  const tileGroups: Phaser.Tilemaps.Tile[][] = [];

  // 1. Group tiles that form islands
  tiles
    .filter((tile) => tile.collides)
    .filter((tile) => tile?.properties[TILEMAP_PROPERTIES.ISLAND])
    .forEach((tile) => {
      if (!isTileAlreadyPartOfAGroup(tile, tileGroups)) {
        const group = createNewGroup(tile, tileGroups);
        addContiguousTiles(tile, group);
      }
    });

  // 2. Turn bodies within a group into an island (polygon body)
  tileGroups.forEach((group) => turnGroupIntoIsland(scene, group, postProcess));
}

function addContiguousTiles(tile: Phaser.Tilemaps.Tile, group: Phaser.Tilemaps.Tile[]) {
  {
    const rightTile = getRightTile(tile);
    if (rightTile && !group.includes(rightTile) && areTilesOfSimilarCategory(tile, rightTile)) {
      group.push(rightTile);
      addContiguousTiles(rightTile, group);
    }
  }

  {
    const bottomTile = getBottomTile(tile);
    if (bottomTile && !group.includes(bottomTile) && areTilesOfSimilarCategory(tile, bottomTile)) {
      group.push(bottomTile);
      addContiguousTiles(bottomTile, group);
    }
  }

  {
    const leftTile = getLeftTile(tile);
    if (leftTile && !group.includes(leftTile) && areTilesOfSimilarCategory(tile, leftTile)) {
      group.push(leftTile);
      addContiguousTiles(leftTile, group);
    }
  }

  {
    const topTile = getTopTile(tile);
    if (topTile && !group.includes(topTile) && areTilesOfSimilarCategory(tile, topTile)) {
      group.push(topTile);
      addContiguousTiles(topTile, group);
    }
  }
}

function turnGroupIntoIsland(scene: Phaser.Scene, group: Phaser.Tilemaps.Tile[], postProcess?: PostProcessFunctions) {
  const verts: MatterJS.Vector[] = [];

  // Search clockwise - we start with a tile that has no one left nor top (we scan from left to right and top to bottom)
  let nextTile: Phaser.Tilemaps.Tile = group[0];
  let vertex: MatterJS.Vector = getUpperLeftVertex(nextTile);
  let nextDirection: Directions = Directions.RIGHT;

  do {
    verts.push(vertex);

    let result: TileSearchResult;
    switch (nextDirection) {
      case Directions.RIGHT: {
        result = lookRight_untilIsLastInLine_orHasTop(nextTile, group);
        break;
      }
      case Directions.DOWN: {
        result = lookDown_untilIsLastInLine_orHasRight(nextTile, group);
        break;
      }
      case Directions.LEFT: {
        result = lookLeft_untilIsLastInLine_orHasBottom(nextTile, group);
        break;
      }
      case Directions.UP: {
        result = lookUp_untilIsLastInLine_orHasLeft(nextTile, group);
        break;
      }
    }

    nextTile = result.nextTile;
    nextDirection = result.nextDirection;
    vertex = result.vertex;
  } while (!isVertexAlreadyInGroup(vertex, verts));

  // Keep track of the source properties using the properties from the last tile in this group
  // TODO Jem: merge properties of all tiles within the island
  const gameObject = new TileIsland(scene);
  gameObject.properties = nextTile.properties;

  const body = scene.matter.add.fromVertices(0, 0, verts, { isStatic: true });
  body.parts.forEach((part) => (part.gameObject = gameObject));

  // Even out the displacement due to the center of mass
  translateBodyToMatchTiles(scene, body, group);

  if (postProcess) {
    if (nextTile.properties) {
      // Enrich tile (friction, restitution/bounce, etc.)
      postProcess.setBodyProperties(nextTile.properties, body);

      // Assign collision filter category
      const collisionFilterCategoryName: string = nextTile.properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY];
      if (collisionFilterCategoryName) {
        const collisionFilterCategory = postProcess.getCollisionFilterCategoryByName(collisionFilterCategoryName);
        body.collisionFilter.category = collisionFilterCategory;
      }
    }
  }
}

/** Checks whether this tile already belongs to a group of tiles that have at least one contiguous */
function isTileAlreadyPartOfAGroup(tile: Phaser.Tilemaps.Tile, tileGroups: Phaser.Tilemaps.Tile[][]) {
  for (let i = 0; i < tileGroups.length; i++) {
    const group = tileGroups[i];
    if (group.includes(tile)) {
      return group;
    }
  }
  return null;
}

/** Tiles are of similar category when they either have no category or both have the same category */
function areTilesOfSimilarCategory(tileA: Phaser.Tilemaps.Tile, tileB: Phaser.Tilemaps.Tile) {
  const tileACategory: string = tileA.properties && tileA.properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY];
  const tileBCategory: string = tileB.properties && tileB.properties[TILEMAP_PROPERTIES.COLLISION_CATEGORY];

  if (tileACategory && tileBCategory) {
    return tileACategory === tileBCategory;
  } else if (tileACategory || tileBCategory) {
    return false;
  }
  return true;
}

function createNewGroup(tile: Phaser.Tilemaps.Tile, tileGroups: Phaser.Tilemaps.Tile[][]) {
  const group = [tile];
  tileGroups.push(group);
  return group;
}

function getRightTile(tile: Phaser.Tilemaps.Tile, inGroup?: Phaser.Tilemaps.Tile[]) {
  if (!tile.faceRight) {
    const contiguous = tile.tilemapLayer.getTileAt(tile.x + 1, tile.y);
    if (contiguous.collides) {
      if (contiguous?.properties[TILEMAP_PROPERTIES.ISLAND] && (!inGroup || inGroup.includes(contiguous))) {
        return contiguous;
      }
    }
  }
  return null;
}

function getBottomTile(tile: Phaser.Tilemaps.Tile, inGroup?: Phaser.Tilemaps.Tile[]) {
  if (!tile.faceBottom) {
    const contiguous = tile.tilemapLayer.getTileAt(tile.x, tile.y + 1);
    if (contiguous?.properties[TILEMAP_PROPERTIES.ISLAND] && (!inGroup || inGroup.includes(contiguous))) {
      return contiguous;
    }
  }
  return null;
}

function getLeftTile(tile: Phaser.Tilemaps.Tile, inGroup?: Phaser.Tilemaps.Tile[]) {
  if (!tile.faceLeft) {
    const contiguous = tile.tilemapLayer.getTileAt(tile.x - 1, tile.y);
    if (contiguous?.properties[TILEMAP_PROPERTIES.ISLAND] && (!inGroup || inGroup.includes(contiguous))) {
      return contiguous;
    }
  }
  return null;
}

function getTopTile(tile: Phaser.Tilemaps.Tile, inGroup?: Phaser.Tilemaps.Tile[]) {
  if (!tile.faceTop) {
    const contiguous = tile.tilemapLayer.getTileAt(tile.x, tile.y - 1);
    if (contiguous?.properties[TILEMAP_PROPERTIES.ISLAND] && (!inGroup || inGroup.includes(contiguous))) {
      return contiguous;
    }
  }
  return null;
}

function getMin(values: number[]) {
  return values.reduce((min, current) => {
    if (isNaN(min)) {
      return current;
    }
    return current < min ? current : min;
  }, NaN);
}

function getMax(values: number[]) {
  return values.reduce((max, current) => {
    if (isNaN(max)) {
      return current;
    }
    return current > max ? current : max;
  }, NaN);
}

function getShapeDimensions(verts: MatterJS.Vector[]) {
  const vertsX = verts.map((vert) => vert.x);
  const minX = getMin(vertsX);
  const maxX = getMax(vertsX);
  const width = Math.abs(maxX - minX);

  const vertsY = verts.map((vert) => vert.y);
  const minY = getMin(vertsY);
  const maxY = getMax(vertsY);
  const height = Math.abs(maxY - minY);

  return { width, height };
}

function getUpperRightVertex(tile: Phaser.Tilemaps.Tile): MatterJS.Vector {
  return { x: tile.pixelX + tile.width, y: tile.pixelY };
}

function getLowerRightVertex(tile: Phaser.Tilemaps.Tile): MatterJS.Vector {
  return { x: tile.pixelX + tile.width, y: tile.pixelY + tile.height };
}

function getLowerLeftVertex(tile: Phaser.Tilemaps.Tile): MatterJS.Vector {
  return { x: tile.pixelX, y: tile.pixelY + tile.height };
}

function getUpperLeftVertex(tile: Phaser.Tilemaps.Tile): MatterJS.Vector {
  return { x: tile.pixelX, y: tile.pixelY };
}

function isVertexAlreadyInGroup(vertex: MatterJS.Vector, vertices: MatterJS.Vector[]) {
  return !!vertices.find(({ x, y }) => vertex.x === x && vertex.y === y);
}

enum Directions {
  UP,
  RIGHT,
  DOWN,
  LEFT,
}

interface TileSearchResult {
  nextTile: Phaser.Tilemaps.Tile;
  nextDirection: Directions;
  vertex: MatterJS.Vector;
}

function lookRight_untilIsLastInLine_orHasTop(tile: Phaser.Tilemaps.Tile, group: Phaser.Tilemaps.Tile[]): TileSearchResult {
  let nextTile: Phaser.Tilemaps.Tile = tile;

  let candidateTile: Phaser.Tilemaps.Tile;
  while ((candidateTile = getRightTile(nextTile, group))) {
    nextTile = candidateTile;

    const perpendicularCounterClockwiseTile = getTopTile(nextTile, group);
    if (perpendicularCounterClockwiseTile) {
      return { nextTile: perpendicularCounterClockwiseTile, nextDirection: Directions.UP, vertex: getUpperLeftVertex(nextTile) };
    }
  }

  return { nextTile, nextDirection: Directions.DOWN, vertex: getUpperRightVertex(nextTile) };
}

function lookDown_untilIsLastInLine_orHasRight(tile: Phaser.Tilemaps.Tile, group: Phaser.Tilemaps.Tile[]): TileSearchResult {
  let nextTile: Phaser.Tilemaps.Tile = tile;

  let candidateTile: Phaser.Tilemaps.Tile;
  while ((candidateTile = getBottomTile(nextTile, group))) {
    nextTile = candidateTile;

    const perpendicularCounterClockwiseTile = getRightTile(nextTile, group);
    if (perpendicularCounterClockwiseTile) {
      return { nextTile: perpendicularCounterClockwiseTile, nextDirection: Directions.RIGHT, vertex: getUpperRightVertex(nextTile) };
    }
  }

  return { nextTile, nextDirection: Directions.LEFT, vertex: getLowerRightVertex(nextTile) };
}

function lookLeft_untilIsLastInLine_orHasBottom(tile: Phaser.Tilemaps.Tile, group: Phaser.Tilemaps.Tile[]): TileSearchResult {
  let nextTile: Phaser.Tilemaps.Tile = tile;

  let candidateTile: Phaser.Tilemaps.Tile;
  while ((candidateTile = getLeftTile(nextTile, group))) {
    nextTile = candidateTile;

    const perpendicularCounterClockwiseTile = getBottomTile(nextTile, group);
    if (perpendicularCounterClockwiseTile) {
      return { nextTile: perpendicularCounterClockwiseTile, nextDirection: Directions.DOWN, vertex: getLowerRightVertex(nextTile) };
    }
  }

  return { nextTile, nextDirection: Directions.UP, vertex: getLowerLeftVertex(nextTile) };
}

function lookUp_untilIsLastInLine_orHasLeft(tile: Phaser.Tilemaps.Tile, group: Phaser.Tilemaps.Tile[]): TileSearchResult {
  let nextTile: Phaser.Tilemaps.Tile = tile;

  let candidateTile: Phaser.Tilemaps.Tile;
  while ((candidateTile = getTopTile(nextTile, group))) {
    nextTile = candidateTile;

    const perpendicularCounterClockwiseTile = getLeftTile(nextTile, group);
    if (perpendicularCounterClockwiseTile) {
      return { nextTile: perpendicularCounterClockwiseTile, nextDirection: Directions.LEFT, vertex: getLowerLeftVertex(nextTile) };
    }
  }

  return { nextTile, nextDirection: Directions.RIGHT, vertex: getUpperLeftVertex(nextTile) };
}

function translateBodyToMatchTiles(scene: Phaser.Scene, body: MatterJS.BodyType, group: Phaser.Tilemaps.Tile[]) {
  // 1. Get top-left body bounds
  const vertsX = body.vertices.map((vert) => vert.x);
  const leftmostX = getMin(vertsX);

  const vertsY = body.vertices.map((vert) => vert.y);
  const topmostY = getMin(vertsY);

  // 2. Get top-left tile bounds
  const tilesX = group.map((tile) => tile.pixelX);
  const leftmostTile = getMin(tilesX);

  const tilesY = group.map((tile) => tile.pixelY);
  const topmostTile = getMin(tilesY);

  // z. Align body to tiles (to cancel the original center of mass being the body's origin)
  scene.matter.body.translate(body, { x: leftmostTile - leftmostX, y: topmostTile - topmostY });
}
