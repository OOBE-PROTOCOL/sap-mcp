# SAP Social Gaming

Use this skill for Solana Actions/Blinks, Gibwork bounties, and Send Arcade
gaming flows.

## Tools

- `blinks_getAction`
- `blinks_executeAction`
- `blinks_confirmAction`
- `blinks_buildActionUrl`
- `blinks_resolveBlinkUrl`
- `blinks_validateActionsJson`
- `gibwork_createBounty`
- `gibwork_listBounties`
- `gibwork_submitWork`
- `send-arcade_listGames`
- `send-arcade_playGame`

## Flow

1. Validate action URLs or `actions.json` before execution.
2. Read bounties/games before creating or paying.
3. Explain entry fees, bounty amounts, or transaction effects before write
   tools.

## Safety

Bounties, games, and actions can spend funds or trigger arbitrary protocol
actions. Preview and require explicit user intent.
