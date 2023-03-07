import { listenAndServe } from "https://deno.land/x/websocket_server/mod.ts";

const secretsToPlayers = Object.fromEntries(
  JSON.parse(Deno.readTextFileSync("./secrets.json"))
    .map(secret => [secret, null])
);

const LAND_ID = 0;
const LAVA_ID = 1;
const APPLE_ID = 2;

const width = 140;
const height = 30;
const tiles = Array(width * height).fill(LAND_ID);
let nextPlayerId = 6666;
let highScore = 0;

function getTile(x, y) {
  return tiles[y * width + x];
}

function setTile(x, y, id) {
  tiles[y * width + x] = id;
}

function findEmptyTile() {
  let x, y;

  do {
    x = Math.floor(Math.random() * width);
    y = Math.floor(Math.random() * height);
  } while(getTile(x, y) !== LAND_ID);

  return [ x, y ];
}

// Set edges of map to lava
for(let x = 0; x < width; x++) {
  setTile(x, 0, LAVA_ID);
  setTile(x, height - 1, LAVA_ID);
}

for(let y = 0; y < height; y++) {
  setTile(0, y, LAVA_ID);
  setTile(width - 1, y, LAVA_ID);
}

const maxFreeAppleCount = 300;
let freeAppleCount = 0;

setInterval(() => {
  // Place random apple on a {LAND_ID} tile, if there are less than {maxFreeAppleCount} free apples
  while(freeAppleCount < maxFreeAppleCount) {
    const [x, y] = findEmptyTile();
    setTile(x, y, APPLE_ID);
    freeAppleCount++;
  }

  // Remove any players that are not playing
  Object.values(secretsToPlayers)
  .filter(x => x)
  .filter(player => player.socket.isClosed)
  .forEach(player => {
    const tileIndex = tiles.indexOf(player.playerId);
    if(tileIndex !== -1) tiles[tileIndex] = LAND_ID;
  });
}, 777);

function errorWrap(callback) {
  return (...args) => {
    try {
      callback(...args);
    } catch(error) {
      console.log("Wrapped error", error);
    }
  };
}

function destroyPlayer(player, reason) {
  setTile(player.x, player.y, LAND_ID);
  secretsToPlayers[player.secret] = null;
  console.log(`[${player.playerId}, "${player.secret}", ${player.health}, ${player.apples}, ${player.smashedApples}, ${Date.now()}]`);

  if(player.apples > highScore) {
    highScore = player.apples;
    reason += ` (Your score sets the new highest score: ${highScore})`;
  }

  try {
    if(!player.socket.isClosed) player.socket.close(3000, reason);
  } catch(_error) {
    // Ignore
    console.log(_error);
  }

  // Delete player from map
  const tileIndex = tiles.indexOf(player.playerId);
  if(tileIndex !== -1) tiles[tileIndex] = LAND_ID;
}

listenAndServe({ port: 4040 }, errorWrap(({ socket, event }) => {
  event = JSON.parse(event);

  if (event.type === "authenticate") {
    // Disconnect old socket if exists
    // Delete old player if exists
    // Create new player

    if(secretsToPlayers[event.secret]) {
      // Disconnect old socket
      try {
        if(!secretsToPlayers[event.secret].socket.isClosed) destroyPlayer(secretsToPlayers[event.secret], "New connection");
      } catch(_error) {
        // Ignore
        console.log(_error);
      }
    }

    // Overwrite old player data
    const playerId = nextPlayerId++;
    const [spawnX, spawnY] = findEmptyTile();

    // Put player on map
    setTile(spawnX, spawnY, playerId);

    secretsToPlayers[event.secret] = {
      playerId,
      secret: event.secret,
      socket,

      health: 100,
      apples: 0,

      smashedApples: 0,
      strength: 1,

      get x() {
        return tiles.indexOf(playerId) % width;
      },

      get y() {
        return Math.floor(tiles.indexOf(playerId) / width);
      },

      setXY(x, y) {
        const oldIndex = tiles.indexOf(playerId);
        const oldX = oldIndex % width;
        const oldY = Math.floor(oldIndex / width);

        if(oldIndex === -1) {
          throw new Error("Player not on map");
        }

        setTile(oldX, oldY, LAND_ID);
        setTile(x, y, playerId);
      },

      canAct: true,
    };
  }

  const player = Object.values(secretsToPlayers).filter(x => x).find(x => x.socket === socket) || null;

  // If player is not authenticated, disconnect
  if(!player) {
    try {
      if(!socket.isClosed) socket.close(3000, "Not authenticated");
    } catch(_error) {
      // Ignore
      console.log(_error);
    }
    return;
  }


  // If a player's health is 0, disconnect & destroy
  if(player.health <= 0) {
    destroyPlayer(player, "Health reached 0");
    return;
  }

  // If player is not allowed to act, disconnect
  if(!player.canAct) {
    destroyPlayer(player, "Wait for a setMapState packet before doing that");
    return;
  }

  // If invalid packet type, disconnect
  if(!["move", "attack", "eat", "smash", "authenticate"].includes(event.type)) {
    destroyPlayer(player, "Invalid packet type: " + event.type);
    return;
  }

  // Move
  if(event.type === "move") {
    player.health -= 1;

    const { directionX, directionY } = event;

    const distance = Math.abs(directionX) + Math.abs(directionY);
    if(distance !== 1 && distance !== 2) {
      destroyPlayer(player, "abs(directionX) + abs(directionY) must add up to 1 or 2");
      return;
    }

    const newX = player.x + directionX;
    const newY = player.y + directionY;

    // Out of bounds?
    if(newX < 0 || newX >= width || newY < 0 || newY >= height) {
      destroyPlayer(player, "Out of bounds (coordinates out of range)");
      return;
    }

    // If colliding with another player, do nothing
    const tileId = getTile(newX, newY);

    if(tileId >= 100) {
      // Do nothing
    } else if(tileId === APPLE_ID) {
      // Eat apple
      player.apples++;
      freeAppleCount--;
      player.setXY(newX, newY);
    } else if(tileId === LAVA_ID) {
      // Kill & disconnect
      destroyPlayer(player, "Killed by lava");
      return;
    } else {
      // Move
      player.setXY(newX, newY);
    }
  }

  // Attack
  if(event.type === "attack") {
    player.health -= 1;

    // Get a random player within radius of 2
    const nearbyPlayerIds = tiles.filter((tileId, index) => {
      const x = index % width;
      const y = Math.floor(index / width);

      return tileId >= 100 && (Math.abs(x - player.x) + Math.abs(y - player.y)) <= 2;
    });

    if(nearbyPlayerIds.length > 0) {
      const targetPlayerId = nearbyPlayerIds[Math.floor(Math.random() * nearbyPlayerIds.length)];
      const targetPlayer = Object.values(secretsToPlayers).find(player => player.playerId === targetPlayerId);

      // Attack
      targetPlayer.health -= player.strength; 

      if(targetPlayer.health <= 0) {
        // Destroy player
        destroyPlayer(targetPlayer, "Killed by " + player.playerId);
      }
    }
  }

  // Eat apple
  if(event.type === "eat") {
    const apples = Number(event.apples) || 1;

    if(player.apples >= apples) {
      player.apples -= apples;
      player.health += apples * 10;

      player.health = Math.min(player.health, 100);
    } else {
      destroyPlayer(player, "Bad number of apples: " + apples);
      return;
    }
  }

  // Smash apples
  if(event.type === "smash") {
    const apples = Number(event.apples) || 1;

    if(player.apples >= apples) {
      player.apples -= apples;
      player.smashedApples = (player.smashedApples || 0) + apples;

      player.strength = 1 + Math.floor(player.smashedApples / 3);
    } else {
      destroyPlayer(player, "Bad number of apples: " + apples);
      return;
    }
  }

  // Set player to not be able to act
  player.canAct = false;

  // Give the player a new turn
  setTimeout(() => {
    // If dead now, disconnect
    if(player.health <= 0) {
      destroyPlayer(player, "Health reached 0");
      return;
    }

    if(player.socket.isClosed) return;

    player.canAct = true;

    player.socket.send(JSON.stringify({
      type: "setMapState",
      width,
      height,
      squares: tiles,
      
      you: {
        id: player.playerId,

        health: player.health,
        apples: player.apples,
        strength: player.strength,
      }
    }));
  }, 500);
}));