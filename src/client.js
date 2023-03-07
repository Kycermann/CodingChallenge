import aStar from 'npm:a-star';

const socket = new WebSocket("ws://10.204.11.61:4040");

socket.onopen = () => {
  console.log("Connected");
  socket.send(JSON.stringify({ type: "authenticate", secret: "GzaGL0rn15LKVDEaefx1" }));
};

socket.onmessage = (event) => {
  const { width, height, squares, you } = JSON.parse(event.data);
  const { id: playerId, health, strength, apples } = you;

  console.log([
    `Health \x1b[0;30m→\x1b[0m \x1b[0;33m${health}\x1b[0m`,
    `Strength \x1b[0;30m→\x1b[0m \x1b[0;33m${strength}\x1b[0m`,
    `Apples \x1b[0;30m→\x1b[0m \x1b[0;33m${apples}\x1b[0m`,
    `\x1b[0;30mPlayer ID ${playerId}\x1b[0m`
  ].join("   "));

  // Pretty print the map to console
  for(let y = 0; y < height; y++) {
    const chars = [];

    for(let x = 0; x < width; x++) {
      const tile = squares[y * width + x];
      if(tile === playerId) chars.push("\x1b[1;31mX\x1b[0m");
      else if(tile === 0) chars.push(" ");
      else if(tile === 1) chars.push("█");
      else if(tile === 2) chars.push("\x1b[0;32m.\x1b[0m");
      else chars.push("P");
    }

    console.log(chars.join(""));
  }

  console.log("");

  function getTile(x, y) {
    return squares[y * width + x];
  }

  // Stay healthy
  if(health <= 90 && apples > 0) {
    socket.send(JSON.stringify({ type: "eat", apples: 1 }));
    return;
  }

  // If we have more than 10 apples and strength is less than 100
  if(apples > 100 && strength < 100) {
    socket.send(JSON.stringify({ type: "smash", apples: 90 }));
    return;
  }

  // Get my coordinates
  const x = squares.findIndex((tile) => tile === playerId) % width;
  const y = Math.floor(squares.findIndex((tile) => tile === playerId) / width);

  // If within 2 squares of a player, attack
  for(let ry = -2; ry <= 2; ry++) {
    for(let rx = -2; rx <= 2; rx++) {
      const nx = x + rx;
      const ny = y + ry;

      if(rx === 0 && ry === 0) continue;
      if(getTile(nx, ny) == playerId) continue;
      if(nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const tile = getTile(nx, ny);

      if(tile > 10) {
        if(apples > 3 && strength < 100) {
          socket.send(JSON.stringify({ type: "smash", apples }));
          return;
        }

        socket.send(JSON.stringify({ type: "attack" }));
        return;
      }
    }
  }

  const { path } = aStar({
    start: { x, y },
    isEnd: ({ x, y }) => getTile(x, y) === 2,
    neighbor: ({ x, y }) => {
      const neighbors = [];

      for(let ry = -1; ry <= 1; ry++) {
        for(let rx = -1; rx <= 1; rx++) {
          if(rx === 0 && ry === 0) continue;

          const nx = x + rx;
          const ny = y + ry;

          if(nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const tile = getTile(nx, ny);
          if(tile !== 0 && tile !== 2) continue;

          neighbors.push({ x: nx, y: ny });
        }
      }

      return neighbors;
    },
    distance: (a, b) => {
      const diff = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if(diff === 1 || diff === 2) return 1;
      else return Infinity;
    },
    heuristic: () => 1,
    hash: ({ x, y }) => `${x},${y}`
  });

  // Walk to next node in path
  const next = path[1];

  socket.send(JSON.stringify({
    type: "move",
    directionX: next.x - x,
    directionY: next.y - y
  }));
}

socket.onclose = (event) => {
  console.log("Disconnected", event.reason);
}

socket.onerror = (event) => {
  console.log("Error", event);
}