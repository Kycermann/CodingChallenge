# The Game

There is a map.

The map is a grid of squares.

Each square can be:

- Land    (ID: 0)
- Lava    (ID: 1)
- Apple   (ID: 2)
- Player (each player has a unique ID)

Players have a maximum of 100 health.

Players can move in any direction, one square at a time. Moving costs 1 health.

If a player moves onto a square with lava or out of map bounds, they are destroyed and disconnected.

If a player moves onto a square with an apple, they gain the apple and when they move off the square, the square becomes land.

Players can eat apples. If a player eats 1 apple, they gain 10 health.
Players can smash apples. For every 3 apples a player smashes, they gain 1 strength.

If a player is within 2 squares of other players, they can attack a random player within 2 squares. This costs 1 health.

When a player is attacked, they lose health equal to the attacker's strength.

If a player's health reaches 0, they are destroyed and disconnected.

Your final score is the highest number of apples you have had (not eaten, but had in your posession) at any of the times you've disconnected.

## Connecting to the server

The server is available at `ws://ws-game.mieszko.xyz:4040`.

Each time you connect, your player data will be overwritten and you will start at a random location.

## Packets

All packets will be sent and received as a JSON object. Each object has a `type` that determines the packet type.

## Packets sent to the server

Aside from the `authenticate` packet, you must be authenticated to send any other packets.

When you receive a `setMapState` packet, you should send a `move` or `attack` or `eat` or `smash` packet within 1 second. If you don't, you will lose that turn.

### Authenticate

You must send your secret to be given a player ID or sent any other packets.

Each secret can only have one active connection at a time.

{
  "type": "authenticate",
  "secret": string
}

### Movement
```
{
  "type: "move",

  // {abs(directionX) + abs(directionY)} must be 1 or 2
  "directionX": oneOf(-1, 0, 1),
  "directionY": oneOf(-1, 0, 1)
}
```
### Attack
```
{
  "type": "attack"
}
```
You will attack a random player within 1 square of you, if there is one.

### Eat
```
{
  "type": "eat",
  "apples": number
}
```
You will eat n apples, if you have them.

### Smash
```
{
  "type": "smash",
  "apples": number
}
```
You will smash n apples, if you have them.

## Packets sent from the server

### Set map state
```
{
  "type": "setMapState",

  "width": number,
  "height": number,

  "squares": [
    number, // ID of the square (can be a player ID)
    ...
  ],

  "you": {
    "id": number,

    "health": number,
    "strength": number,
    "apples": number
  }
}
```
### Disconnect

If you are disconnected, you will be sent a reason for the disconnection as a string. If you had the new high score, the reason will include this information.
