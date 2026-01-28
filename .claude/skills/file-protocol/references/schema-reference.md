# JSON Schema Reference

Complete schemas for all game coordination file types.

## Game State Schema

```json
{
  "fileType": "game-state",
  "version": "1.0",
  "timestamp": "2024-01-27T14:30:00Z",
  "game": "UNO",
  "gameId": "uno-game-42",
  "turnNumber": 12,
  "gameActive": true,
  "players": [...],
  "currentPlayer": "player-1",
  "direction": 1,
  "deck": {...},
  "discardPile": [...]
}
```

See `../examples/state-schemas.json` for complete JSON Schema definitions with validation rules.

## Turn Signal Schema

Used to trigger player agent responses.

## Player Action Schema

Player decision output format.

## Validation

Use the schemas in `../examples/state-schemas.json` with tools like `ajv` or programmatic validation.
