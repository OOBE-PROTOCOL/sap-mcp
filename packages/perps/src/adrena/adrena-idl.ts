/**
 * @name perps/adrena/adrena-idl
 * @description Vendored Adrena Anchor IDL (Anchor 0.31, program
 * v2.1.5, release release/39_5) embedded as a TypeScript module.
 *
 * Auto-generated from the canonical @adrena/abi JSON
 * (https://github.com/AdrenaFoundation/adrena-abi, idl_sha256
 * d6ef3b9b66f151c0e98b03a80c951b41...).
 * Do NOT edit by hand: update the adrena-abi pin and re-run
 * `node scripts/gen-adrena-idl.mjs`.
 *
 * @module perps/adrena/adrena-idl
 */

export const ADRENA_IDL = {
 "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet",
 "metadata": {
  "name": "adrena",
  "version": "2.1.5",
  "spec": "0.1.0",
  "description": "Adrena",
  "repository": "https://github.com/AdrenaFoundation/adrena"
 },
 "instructions": [
  {
   "name": "accept_admin",
   "discriminator": [
    112,
    42,
    45,
    90,
    116,
    181,
    13,
    170
   ],
   "accounts": [
    {
     "name": "pending_admin",
     "docs": [
      "The pending admin must sign to accept the transfer"
     ],
     "signer": true
    },
    {
     "name": "cortex",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "add_collateral_long",
   "discriminator": [
    101,
    191,
    243,
    208,
    154,
    22,
    72,
    19
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "funding_account",
      "position"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "token_program",
     "docs": [
      "#11"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#12"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddCollateralLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "add_collateral_short",
   "discriminator": [
    197,
    235,
    47,
    1,
    228,
    10,
    200,
    184
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "funding_account",
      "position"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "token_program",
     "docs": [
      "#11"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#12"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddCollateralShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "add_custody",
   "discriminator": [
    247,
    254,
    126,
    17,
    26,
    6,
    215,
    117
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "arg",
        "path": "params.seed"
       }
      ]
     }
    },
    {
     "name": "custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         97,
         99,
         99,
         111,
         117,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "custody"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "custody_token_mint",
     "docs": [
      "#9"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#10"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#11"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#12"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddCustodyParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "add_limit_order",
   "discriminator": [
    163,
    4,
    58,
    224,
    7,
    212,
    118,
    49
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "limit_order_book",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         105,
         109,
         105,
         116,
         95,
         111,
         114,
         100,
         101,
         114,
         95,
         98,
         111,
         111,
         107
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "collateral_escrow",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         101,
         115,
         99,
         114,
         111,
         119,
         95,
         97,
         99,
         99,
         111,
         117,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "account",
        "path": "collateral_custody"
       }
      ]
     }
    },
    {
     "name": "collateral_custody_mint",
     "docs": [
      "#8"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#9"
     ]
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#10"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#11"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#12"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "associated_token_program",
     "docs": [
      "#13"
     ],
     "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddLimitOrderParams"
      }
     }
    }
   ],
   "returns": "u64"
  },
  {
   "name": "add_liquid_stake",
   "discriminator": [
    255,
    64,
    163,
    23,
    209,
    84,
    185,
    124
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "funding_account",
      "reward_token_account",
      "lm_token_account"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#13"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#15"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#16"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#17"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm",
     "docs": [
      "#18",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#19"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#20",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#21",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "governance_program",
     "docs": [
      "#22"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#23"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#24"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#25"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddLiquidStakeParams"
      }
     }
    }
   ]
  },
  {
   "name": "add_liquidity",
   "discriminator": [
    181,
    157,
    89,
    67,
    143,
    182,
    52,
    72
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "funding_account"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "lp_token_account",
     "docs": [
      "#3 Front end will target the owner account, but not limited to"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "lp_staking",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "lp_token_mint"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#8",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "token_program",
     "docs": [
      "#12"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#13"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddLiquidityParams"
      }
     }
    }
   ]
  },
  {
   "name": "add_locked_stake",
   "discriminator": [
    254,
    95,
    156,
    177,
    106,
    141,
    151,
    61
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "funding_account",
      "reward_token_account"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#12"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm",
     "docs": [
      "#13",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#14"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#15",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#16",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "governance_program",
     "docs": [
      "#17"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#18"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#19"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#20"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddLockedStakeParams"
      }
     }
    }
   ]
  },
  {
   "name": "add_pool_part_one",
   "discriminator": [
    88,
    239,
    108,
    37,
    141,
    192,
    151,
    214
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "arg",
        "path": "params.name"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint_metadata",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "mpl_token_metadata_program",
     "docs": [
      "#10"
     ],
     "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#11"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "rent",
     "docs": [
      "#12"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddPoolPartOneParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "add_pool_part_two",
   "discriminator": [
    48,
    241,
    100,
    82,
    218,
    78,
    185,
    173
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#10"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddPoolPartTwoParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "add_synthetic_custody",
   "discriminator": [
    31,
    200,
    24,
    242,
    37,
    180,
    146,
    253
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "arg",
        "path": "params.seed"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddSyntheticCustodyParams"
      }
     }
    }
   ]
  },
  {
   "name": "add_vest",
   "discriminator": [
    213,
    88,
    26,
    9,
    37,
    186,
    193,
    59
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "vest_registry",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116,
         95,
         114,
         101,
         103,
         105,
         115,
         116,
         114,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "vest",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#15"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#16"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#17"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AddVestParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "autonom_market_opening",
   "discriminator": [
    241,
    41,
    90,
    7,
    173,
    189,
    79,
    3
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "AutonomMarketOpeningParams"
      }
     }
    }
   ]
  },
  {
   "name": "cancel_admin_transfer",
   "discriminator": [
    38,
    131,
    157,
    31,
    240,
    137,
    44,
    215
   ],
   "accounts": [
    {
     "name": "admin",
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "cancel_limit_order",
   "discriminator": [
    132,
    156,
    132,
    31,
    67,
    40,
    232,
    97
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "limit_order_book",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         105,
         109,
         105,
         116,
         95,
         111,
         114,
         100,
         101,
         114,
         95,
         98,
         111,
         111,
         107
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "collateral_escrow",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         101,
         115,
         99,
         114,
         111,
         119,
         95,
         97,
         99,
         99,
         111,
         117,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "account",
        "path": "collateral_custody"
       }
      ]
     }
    },
    {
     "name": "collateral_custody_mint",
     "docs": [
      "#8"
     ]
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#10"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#11"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "associated_token_program",
     "docs": [
      "#12"
     ],
     "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "CancelLimitOrderParams"
      }
     }
    }
   ]
  },
  {
   "name": "cancel_stop_loss",
   "discriminator": [
    120,
    201,
    10,
    102,
    12,
    9,
    111,
    126
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "cancel_take_profit",
   "discriminator": [
    123,
    224,
    30,
    252,
    159,
    1,
    250,
    124
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "cancel_vest",
   "discriminator": [
    180,
    223,
    215,
    39,
    132,
    45,
    20,
    38
   ],
   "accounts": [
    {
     "name": "admin",
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "owner",
     "relations": [
      "vest"
     ]
    },
    {
     "name": "payer",
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "vest_registry",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116,
         95,
         114,
         101,
         103,
         105,
         115,
         116,
         114,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "vest",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "claim_referral_fee",
   "discriminator": [
    152,
    108,
    147,
    123,
    190,
    36,
    134,
    62
   ],
   "accounts": [
    {
     "name": "referrer",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "referrer"
       }
      ]
     }
    },
    {
     "name": "referrer_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         114,
         101,
         102,
         101,
         114,
         114,
         101,
         114,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#7"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#8"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "claim_stakes",
   "discriminator": [
    254,
    140,
    24,
    53,
    197,
    234,
    35,
    121
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#3"
     ],
     "writable": true,
     "relations": [
      "reward_token_account",
      "lm_token_account"
     ]
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#5"
     ],
     "writable": true
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#13"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#15"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#16"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#17"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#18"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ClaimStakesParams"
      }
     }
    }
   ]
  },
  {
   "name": "claim_vest",
   "discriminator": [
    147,
    229,
    253,
    84,
    253,
    67,
    13,
    178
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ],
     "relations": [
      "vest"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "vest_registry",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116,
         95,
         114,
         101,
         103,
         105,
         115,
         116,
         114,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "vest",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_realm",
     "docs": [
      "#11",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#12"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#13",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#14",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "governance_program",
     "docs": [
      "#15"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#16"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#17"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#18"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#19"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [],
   "returns": "u64"
  },
  {
   "name": "close_position_long",
   "discriminator": [
    50,
    66,
    35,
    214,
    218,
    31,
    152,
    68
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ],
     "writable": true,
     "relations": [
      "receiving_account",
      "position"
     ]
    },
    {
     "name": "receiving_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#8"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#10"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#12"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#13"
     ],
     "writable": true,
     "optional": true
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#16"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ClosePositionLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "close_position_short",
   "discriminator": [
    158,
    216,
    38,
    16,
    140,
    37,
    15,
    131
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ],
     "writable": true,
     "relations": [
      "receiving_account",
      "position"
     ]
    },
    {
     "name": "receiving_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#8"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#10"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#12"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#13"
     ],
     "writable": true,
     "optional": true
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#16"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ClosePositionShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "delete_user_profile",
   "discriminator": [
    24,
    82,
    133,
    212,
    73,
    243,
    46,
    137
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "user",
     "docs": [
      "#2"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "user"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "disable_tokens_freeze_capabilities",
   "discriminator": [
    138,
    107,
    226,
    17,
    200,
    237,
    160,
    117
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "token_program",
     "docs": [
      "#7"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "distribute_fees",
   "discriminator": [
    120,
    56,
    27,
    7,
    53,
    176,
    113,
    186
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1",
      "Anyone can call this instruction"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_staking",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "lm_staking"
       }
      ]
     }
    },
    {
     "name": "lp_staking",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "lp_token_mint"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#7"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#9"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "lm_staking_reward_token_vault",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "lm_staking"
       }
      ]
     }
    },
    {
     "name": "lp_staking_reward_token_vault",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "lp_staking"
       }
      ]
     }
    },
    {
     "name": "referrer_reward_token_vault",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         114,
         101,
         102,
         101,
         114,
         114,
         101,
         114,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_custody",
     "docs": [
      "#13"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_custody_token_account",
     "docs": [
      "#15"
     ],
     "writable": true
    },
    {
     "name": "protocol_fee_recipient",
     "docs": [
      "#16"
     ],
     "writable": true
    },
    {
     "name": "token_program",
     "docs": [
      "#17"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "system_program",
     "docs": [
      "#18"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#19"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "DistributeFeesParams"
      }
     }
    }
   ]
  },
  {
   "name": "edit_user_profile",
   "discriminator": [
    253,
    8,
    161,
    147,
    64,
    21,
    60,
    145
   ],
   "accounts": [
    {
     "name": "user",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "user"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#4",
      "Apply this referrer to the user profile, If none, referrer_profile is set to default"
     ],
     "optional": true
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "EditUserProfileParams"
      }
     }
    }
   ]
  },
  {
   "name": "edit_user_profile_nickname",
   "discriminator": [
    132,
    19,
    244,
    18,
    78,
    181,
    31,
    50
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "user_profile",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "funding_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "old_user_nickname",
     "docs": [
      "#6"
     ],
     "writable": true,
     "optional": true
    },
    {
     "name": "user_nickname",
     "docs": [
      "#7",
      "Use PDA to make nicknames unique"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         110,
         105,
         99,
         107,
         110,
         97,
         109,
         101
        ]
       },
       {
        "kind": "arg",
        "path": "nickname"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "EditUserProfileNicknameParams"
      }
     }
    }
   ]
  },
  {
   "name": "execute_limit_order_long",
   "discriminator": [
    114,
    251,
    178,
    6,
    238,
    31,
    245,
    245
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "collateral_escrow",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         101,
         115,
         99,
         114,
         111,
         119,
         95,
         97,
         99,
         99,
         111,
         117,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "account",
        "path": "collateral_custody"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "limit_order_book",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         105,
         109,
         105,
         116,
         95,
         111,
         114,
         100,
         101,
         114,
         95,
         98,
         111,
         111,
         107
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#17"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ExecuteLimitOrderLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "execute_limit_order_short",
   "discriminator": [
    160,
    217,
    227,
    39,
    232,
    61,
    21,
    253
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "collateral_escrow",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         101,
         115,
         99,
         114,
         111,
         119,
         95,
         97,
         99,
         99,
         111,
         117,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "account",
        "path": "collateral_custody"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "limit_order_book",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         105,
         109,
         105,
         116,
         95,
         111,
         114,
         100,
         101,
         114,
         95,
         98,
         111,
         111,
         107
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#17"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ExecuteLimitOrderShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "finalize_genesis_lock_campaign",
   "discriminator": [
    53,
    212,
    137,
    237,
    78,
    217,
    150,
    203
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#6"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#7"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    }
   ],
   "args": []
  },
  {
   "name": "finalize_locked_stake",
   "discriminator": [
    202,
    160,
    165,
    78,
    142,
    237,
    39,
    59
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_realm",
     "docs": [
      "#9",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#10"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#11",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#12",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "governance_program",
     "docs": [
      "#13"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#15"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#16"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "FinalizeLockedStakeParams"
      }
     }
    }
   ]
  },
  {
   "name": "genesis_otc_in",
   "discriminator": [
    250,
    84,
    122,
    89,
    253,
    185,
    57,
    186
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account_one",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "funding_account_two",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "funding_account_three",
     "docs": [
      "#5"
     ],
     "writable": true
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#7"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody_one",
     "docs": [
      "#8"
     ],
     "writable": true
    },
    {
     "name": "custody_one_token_account",
     "docs": [
      "#9"
     ],
     "writable": true
    },
    {
     "name": "custody_two",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "custody_two_token_account",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "custody_three",
     "docs": [
      "#12"
     ],
     "writable": true
    },
    {
     "name": "custody_three_token_account",
     "docs": [
      "#13"
     ],
     "writable": true
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#15"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#16"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GenesisOtcInParams"
      }
     }
    }
   ]
  },
  {
   "name": "genesis_otc_out",
   "discriminator": [
    144,
    79,
    164,
    22,
    19,
    189,
    28,
    99
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "dao_receiving_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody_usdc",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "custody_usdc_token_account",
     "docs": [
      "#8"
     ],
     "writable": true
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "token_program",
     "docs": [
      "#10"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "genesis_stake_patch",
   "discriminator": [
    225,
    99,
    136,
    6,
    108,
    202,
    18,
    97
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#3"
     ],
     "relations": [
      "reward_token_account",
      "lm_token_account"
     ]
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#5"
     ],
     "writable": true
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#13"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#15"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#16"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#17"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#18"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "get_add_liquidity_amount_and_fee",
   "discriminator": [
    172,
    150,
    249,
    181,
    233,
    241,
    78,
    139
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#3",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetAddLiquidityAmountAndFeeParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "AmountAndFee"
    }
   }
  },
  {
   "name": "get_assets_under_management",
   "discriminator": [
    44,
    3,
    161,
    69,
    174,
    75,
    137,
    162
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetAssetsUnderManagementParams"
      }
     }
    }
   ],
   "returns": "u128"
  },
  {
   "name": "get_entry_price_and_fee",
   "discriminator": [
    134,
    30,
    231,
    199,
    83,
    72,
    27,
    99
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#3",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetEntryPriceAndFeeParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "NewPositionPricesAndFee"
    }
   }
  },
  {
   "name": "get_exit_price_and_fee",
   "discriminator": [
    73,
    77,
    94,
    31,
    8,
    9,
    92,
    32
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetExitPriceAndFeeParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "ExitPriceAndFee"
    }
   }
  },
  {
   "name": "get_liquidation_price",
   "discriminator": [
    73,
    174,
    119,
    65,
    149,
    5,
    73,
    239
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#5"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetLiquidationPriceParams"
      }
     }
    }
   ],
   "returns": "u64"
  },
  {
   "name": "get_liquidation_state",
   "discriminator": [
    127,
    126,
    199,
    117,
    90,
    89,
    29,
    50
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6"
     ]
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetLiquidationStateParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "get_lp_token_price",
   "discriminator": [
    71,
    172,
    21,
    25,
    176,
    168,
    60,
    10
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetLpTokenPriceParams"
      }
     }
    }
   ],
   "returns": "u64"
  },
  {
   "name": "get_open_position_with_swap_amount_and_fees",
   "discriminator": [
    105,
    20,
    255,
    69,
    225,
    245,
    10,
    189
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "receiving_custody",
     "docs": [
      "#3",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "principal_custody",
     "docs": [
      "#6",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#7"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetOpenPositionWithSwapAmountAndFeesParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "OpenPositionWithSwapAmountAndFees"
    }
   }
  },
  {
   "name": "get_pnl",
   "discriminator": [
    106,
    212,
    3,
    250,
    195,
    224,
    64,
    160
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6"
     ]
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetPnlParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "ProfitAndLoss"
    }
   }
  },
  {
   "name": "get_pool_info_snapshot",
   "discriminator": [
    115,
    34,
    247,
    123,
    65,
    121,
    105,
    116
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetPoolInfoSnapshotParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "PoolInfoSnapshot"
    }
   }
  },
  {
   "name": "get_pool_info_snapshot_pda",
   "discriminator": [
    69,
    34,
    242,
    173,
    45,
    25,
    187,
    245
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "pool_info_snapshot",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108,
         95,
         105,
         110,
         102,
         111,
         95,
         115,
         110,
         97,
         112,
         115,
         104,
         111,
         116
        ]
       },
       {
        "kind": "account",
        "path": "caller"
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#7"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "get_remove_liquidity_amount_and_fee",
   "discriminator": [
    194,
    226,
    233,
    102,
    14,
    21,
    196,
    7
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#3",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetRemoveLiquidityAmountAndFeeParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "AmountAndFee"
    }
   }
  },
  {
   "name": "get_swap_amount_and_fees",
   "discriminator": [
    247,
    121,
    40,
    99,
    35,
    82,
    100,
    32
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "receiving_custody",
     "docs": [
      "#3",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "dispensing_custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ]
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GetSwapAmountAndFeesParams"
      }
     }
    }
   ],
   "returns": {
    "defined": {
     "name": "SwapAmountAndFees"
    }
   }
  },
  {
   "name": "grant_or_remove_achievement",
   "discriminator": [
    31,
    192,
    107,
    213,
    24,
    175,
    248,
    248
   ],
   "accounts": [
    {
     "name": "whitelisted_caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "user",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "user_profile",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "user"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "GrantOrRemoveAchievementParams"
      }
     }
    }
   ]
  },
  {
   "name": "increase_position_long",
   "discriminator": [
    253,
    45,
    99,
    159,
    1,
    124,
    132,
    43
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1 Must be signer or not depending",
      "if the caller is the transfer_authority (internal call for limit order) or the owner",
      ""
     ],
     "relations": [
      "position"
     ]
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#8"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#9",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#10",
      "Collateral custody (stable for synthetic longs, equals `custody` for non-synthetic longs)",
      "Supports both token custodies (PDA from mint/seed) and synthetic custodies (PDA from seed)"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#12"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#17"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "IncreasePositionLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "increase_position_short",
   "discriminator": [
    115,
    188,
    112,
    206,
    233,
    246,
    231,
    166
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1 Must be signer or not depending",
      "if the caller is the transfer_authority (internal call for limit order) or the owner",
      ""
     ],
     "relations": [
      "position"
     ]
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#8"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#9",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#11",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#12"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#17"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "IncreasePositionShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "init_four_vesting",
   "discriminator": [
    3,
    142,
    244,
    213,
    166,
    217,
    186,
    48
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "vest_registry",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116,
         95,
         114,
         101,
         103,
         105,
         115,
         116,
         114,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#7"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#8"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "init_limit_order_book",
   "discriminator": [
    179,
    172,
    45,
    157,
    192,
    252,
    116,
    90
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "limit_order_book",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         105,
         109,
         105,
         116,
         95,
         111,
         114,
         100,
         101,
         114,
         95,
         98,
         111,
         111,
         107
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#4"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "init_one_core",
   "discriminator": [
    244,
    243,
    65,
    251,
    99,
    235,
    237,
    78
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "protocol_fee_recipient",
     "docs": [
      "#5"
     ]
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#6"
     ]
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#10"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "InitOneParams"
      }
     }
    }
   ]
  },
  {
   "name": "init_oracle",
   "discriminator": [
    78,
    100,
    33,
    183,
    96,
    207,
    60,
    91
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#6"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "InitOracleParams"
      }
     }
    }
   ]
  },
  {
   "name": "init_referrer_reward_token_vault",
   "discriminator": [
    176,
    41,
    31,
    155,
    206,
    39,
    94,
    108
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1",
      "Anyone"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "referrer_reward_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         114,
         101,
         102,
         101,
         114,
         114,
         101,
         114,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#6"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#7"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#8"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#9"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "init_staking_four",
   "discriminator": [
    12,
    112,
    94,
    2,
    114,
    242,
    65,
    25
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking_staked_token_mint"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#10"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "staking_staked_token_mint",
     "docs": [
      "#11"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#12"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [],
   "returns": "u8"
  },
  {
   "name": "init_staking_one",
   "discriminator": [
    120,
    240,
    246,
    179,
    166,
    109,
    128,
    211
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking_staked_token_mint"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#8"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "staking_staked_token_mint",
     "docs": [
      "#9"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#10"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#11"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#12"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#13"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "InitStakingOneParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "init_staking_three",
   "discriminator": [
    58,
    113,
    94,
    143,
    161,
    150,
    232,
    200
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#8"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#9"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#10"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [],
   "returns": "u8"
  },
  {
   "name": "init_staking_two",
   "discriminator": [
    117,
    31,
    227,
    147,
    59,
    7,
    139,
    131
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#8"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#9"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#10"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [],
   "returns": "u8"
  },
  {
   "name": "init_three_governance",
   "discriminator": [
    200,
    232,
    157,
    194,
    232,
    235,
    183,
    15
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_realm",
     "docs": [
      "#6",
      "A realm represent one project within the governance program"
     ]
    },
    {
     "name": "governance_program",
     "docs": [
      "#7"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#10"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "init_two_lm_token_metadata",
   "discriminator": [
    252,
    186,
    161,
    12,
    196,
    147,
    180,
    131
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint_metadata",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "mpl_token_metadata_program",
     "docs": [
      "#10"
     ],
     "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    },
    {
     "name": "rent",
     "docs": [
      "#11"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "init_user_profile",
   "discriminator": [
    148,
    35,
    126,
    247,
    28,
    169,
    135,
    175
   ],
   "accounts": [
    {
     "name": "user",
     "docs": [
      "#1"
     ]
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "user"
       }
      ]
     }
    },
    {
     "name": "user_nickname",
     "docs": [
      "#5",
      "Use PDA to make nicknames unique"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         110,
         105,
         99,
         107,
         110,
         97,
         109,
         101
        ]
       },
       {
        "kind": "arg",
        "path": "nickname"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#6",
      "Apply this referrer to the user profile, If none, referrer_profile is set to default"
     ],
     "optional": true
    },
    {
     "name": "cortex",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "InitUserProfileParams"
      }
     }
    }
   ]
  },
  {
   "name": "init_user_staking",
   "discriminator": [
    49,
    77,
    246,
    16,
    254,
    90,
    29,
    206
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#3"
     ],
     "relations": [
      "reward_token_account",
      "lm_token_account"
     ]
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#5"
     ],
     "writable": true
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#9"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#10"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#13"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#14"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#16"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#17"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "liquidate_long",
   "discriminator": [
    132,
    118,
    230,
    137,
    241,
    193,
    136,
    93
   ],
   "accounts": [
    {
     "name": "signer",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#11"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "position"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#12"
     ],
     "writable": true,
     "optional": true
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#15"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "LiquidateLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "liquidate_short",
   "discriminator": [
    197,
    62,
    252,
    198,
    25,
    93,
    177,
    131
   ],
   "accounts": [
    {
     "name": "signer",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#11"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "position"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#12"
     ],
     "writable": true,
     "optional": true
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#15"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "LiquidateShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "migrate_borrow_rate_params",
   "discriminator": [
    95,
    167,
    173,
    223,
    210,
    33,
    162,
    90
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "MigrateBorrowRateParamsParams"
      }
     }
    }
   ]
  },
  {
   "name": "migrate_cortex_v37_to_v38",
   "discriminator": [
    194,
    126,
    217,
    42,
    127,
    243,
    170,
    96
   ],
   "accounts": [
    {
     "name": "admin",
     "signer": true
    },
    {
     "name": "payer",
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "migrate_custody_v37_to_v38",
   "discriminator": [
    211,
    235,
    171,
    146,
    116,
    206,
    71,
    244
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2",
      "Account paying for the reallocation"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "pool",
     "docs": [
      "#3",
      "The pool owning the custody"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "account",
        "path": "mint"
       }
      ]
     }
    },
    {
     "name": "mint",
     "docs": [
      "#5",
      "The custody's mint (needed for PDA derivation)"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "migrate_custody_v38_to_v39",
   "discriminator": [
    232,
    50,
    146,
    156,
    202,
    71,
    167,
    26
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1",
      "The caller of this instruction (can be permissionless)"
     ],
     "signer": true
    },
    {
     "name": "pool",
     "docs": [
      "#2",
      "The pool owning the custody"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "account",
        "path": "custody"
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "migrate_oracle_v38_to_v39",
   "discriminator": [
    254,
    12,
    146,
    209,
    148,
    99,
    193,
    105
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1 - Permissionless caller"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2 - Account paying for reallocation"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "oracle",
     "docs": [
      "#3 - Oracle account (manual deserialization)"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#4"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "migrate_pool_fee_debt_to_split_v38_to_v39",
   "discriminator": [
    146,
    108,
    203,
    190,
    197,
    22,
    100,
    171
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1",
      "Anyone can call this instruction (permissionless)."
     ],
     "signer": true
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "migrate_pool_v37_to_v38",
   "discriminator": [
    217,
    93,
    167,
    97,
    238,
    100,
    140,
    139
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2",
      "Account paying for the reallocation"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#4"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "migrate_pool_v38_to_v39",
   "discriminator": [
    111,
    139,
    195,
    102,
    94,
    1,
    11,
    105
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1",
      "Admin authority (DAO controlled)"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "MigratePoolV38ToV39Params"
      }
     }
    }
   ]
  },
  {
   "name": "migrate_position_v37_to_v38",
   "discriminator": [
    255,
    129,
    242,
    223,
    169,
    234,
    73,
    230
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1",
      "The caller of this instruction (can be permissionless)"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2",
      "Account paying for the reallocation"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#3",
      "The position owner"
     ]
    },
    {
     "name": "pool",
     "docs": [
      "#4",
      "The pool"
     ]
    },
    {
     "name": "custody",
     "docs": [
      "#5",
      "The custody"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#7"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "MigratePositionV37ToV38Params"
      }
     }
    }
   ]
  },
  {
   "name": "migrate_user_profile_from_v1_to_v2",
   "discriminator": [
    213,
    121,
    86,
    235,
    129,
    177,
    108,
    49
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1",
      "Wallet related to the user profile"
     ]
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "user_profile",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "user_nickname",
     "docs": [
      "#5",
      "Use PDA to make nicknames unique"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         110,
         105,
         99,
         107,
         110,
         97,
         109,
         101
        ]
       },
       {
        "kind": "arg",
        "path": "nickname"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#7"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#8"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "MigrateUserProfileFromV1ToV2Params"
      }
     }
    }
   ]
  },
  {
   "name": "migrate_vest_from_v1_to_v2",
   "discriminator": [
    111,
    209,
    73,
    40,
    58,
    206,
    244,
    147
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1",
      "The caller of this instruction"
     ],
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2",
      "Wallet related to the vest"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#3",
      "Account paying for the reallocation"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "vest",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#6"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "rent",
     "docs": [
      "#7"
     ],
     "address": "SysvarRent111111111111111111111111111111111"
    }
   ],
   "args": []
  },
  {
   "name": "mint_all_lm_tokens",
   "discriminator": [
    219,
    78,
    135,
    10,
    185,
    169,
    57,
    247
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "lm_token_mint"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint_metadata",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "vest_registry",
     "docs": [
      "#7"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116,
         95,
         114,
         101,
         103,
         105,
         115,
         116,
         114,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "token_program",
     "docs": [
      "#8"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "mpl_token_metadata_program",
     "docs": [
      "#9"
     ],
     "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    },
    {
     "name": "system_program",
     "docs": [
      "#10"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "associated_token_program",
     "docs": [
      "#11"
     ],
     "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    },
    {
     "name": "sysvar_instructions",
     "docs": [
      "#12"
     ]
    }
   ],
   "args": []
  },
  {
   "name": "mint_lm_tokens_from_bucket",
   "discriminator": [
    7,
    255,
    166,
    0,
    86,
    35,
    197,
    106
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "token_program",
     "docs": [
      "#6"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "MintLmTokensFromBucketParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "mint_staked_lm_tokens_from_bucket",
   "discriminator": [
    37,
    153,
    105,
    98,
    59,
    127,
    123,
    240
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "adrena_program",
     "docs": [
      "#10"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#11"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#12"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "MintStakedLmTokensFromBucketParams"
      }
     }
    }
   ]
  },
  {
   "name": "open_or_increase_position_long",
   "discriminator": [
    32,
    214,
    230,
    112,
    201,
    7,
    118,
    230
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "funding_account"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6",
      "Collateral custody (stable for synthetic longs, equals `custody` for non-synthetic longs)",
      "Supports both token custodies (PDA from mint/seed) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#9"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#12"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#15"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "OpenOrIncreasePositionParams"
      }
     }
    }
   ]
  },
  {
   "name": "open_or_increase_position_short",
   "discriminator": [
    98,
    163,
    165,
    78,
    141,
    104,
    75,
    85
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "funding_account"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#6",
      "Supports both token custodies (PDA from mint/seed) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#9"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#12"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#15"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "OpenOrIncreasePositionParams"
      }
     }
    }
   ]
  },
  {
   "name": "open_or_increase_position_with_swap_long",
   "discriminator": [
    191,
    204,
    50,
    25,
    88,
    21,
    145,
    43
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "funding_account",
      "collateral_account"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "collateral_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "receiving_custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "receiving_custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "principal_custody",
     "docs": [
      "#8",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "principal_custody_token_account",
     "docs": [
      "#9"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#10"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#13"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#14"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#15"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#16"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#17"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#18"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "OpenPositionWithSwapParams"
      }
     }
    }
   ]
  },
  {
   "name": "open_or_increase_position_with_swap_short",
   "discriminator": [
    65,
    201,
    86,
    242,
    134,
    148,
    34,
    179
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "funding_account",
      "collateral_account"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "collateral_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "receiving_custody",
     "docs": [
      "#5",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "receiving_custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#8",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#9"
     ],
     "writable": true
    },
    {
     "name": "principal_custody",
     "docs": [
      "#10",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "principal_custody_token_account",
     "docs": [
      "#11"
     ]
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#12"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#13"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#15"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#16"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#17"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#18"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#19"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#20"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "OpenPositionWithSwapParams"
      }
     }
    }
   ]
  },
  {
   "name": "open_position_long",
   "discriminator": [
    224,
    114,
    146,
    60,
    127,
    166,
    244,
    56
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1 Must be signer or not depending",
      "if the caller is the transfer_authority (internal call for limit order) or the owner",
      ""
     ]
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#8"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#9",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#10",
      "Collateral custody (stable for synthetic longs, equals `custody` for non-synthetic longs)",
      "Supports both token custodies (PDA from mint/seed) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#12"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#14"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#15"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#17"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "OpenPositionLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "open_position_short",
   "discriminator": [
    196,
    212,
    161,
    82,
    250,
    39,
    201,
    102
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1 Must be signer or not depending",
      "if the caller is the transfer_authority (internal call for limit order) or the owner",
      ""
     ]
    },
    {
     "name": "caller",
     "docs": [
      "#2"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "funding_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "position",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#8",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#10",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#11"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#12"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "user_profile",
     "docs": [
      "#15"
     ],
     "writable": true,
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#16"
     ],
     "writable": true,
     "optional": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "OpenPositionShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "patch_custodies_oracles",
   "discriminator": [
    150,
    248,
    194,
    18,
    193,
    152,
    67,
    25
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "usdc_custody",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         69,
         80,
         106,
         70,
         87,
         100,
         100,
         53,
         65,
         117,
         102,
         113,
         83,
         83,
         113,
         101,
         77,
         50,
         113,
         78,
         49,
         120,
         122,
         121,
         98,
         97,
         112,
         67,
         56,
         71,
         52,
         119,
         69,
         71,
         71,
         107,
         90,
         119,
         121,
         84,
         68,
         116,
         49,
         118,
         34,
         41
        ]
       }
      ]
     }
    },
    {
     "name": "bonk_custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         68,
         101,
         122,
         88,
         65,
         90,
         56,
         122,
         55,
         80,
         110,
         114,
         110,
         82,
         74,
         106,
         122,
         51,
         119,
         88,
         66,
         111,
         82,
         103,
         105,
         120,
         67,
         97,
         54,
         120,
         106,
         110,
         66,
         55,
         89,
         97,
         66,
         49,
         112,
         80,
         66,
         50,
         54,
         51,
         34,
         41
        ]
       }
      ]
     }
    },
    {
     "name": "wbtc_custody",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         51,
         78,
         90,
         57,
         74,
         77,
         86,
         66,
         109,
         71,
         65,
         113,
         111,
         99,
         121,
         98,
         105,
         99,
         50,
         99,
         55,
         76,
         81,
         67,
         74,
         83,
         99,
         109,
         103,
         115,
         65,
         90,
         54,
         118,
         81,
         113,
         84,
         68,
         122,
         99,
         113,
         109,
         74,
         104,
         34,
         41
        ]
       }
      ]
     }
    },
    {
     "name": "jito_custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         74,
         49,
         116,
         111,
         115,
         111,
         49,
         117,
         67,
         107,
         51,
         82,
         76,
         109,
         106,
         111,
         114,
         104,
         84,
         116,
         114,
         86,
         119,
         89,
         57,
         72,
         74,
         55,
         88,
         56,
         86,
         57,
         121,
         89,
         97,
         99,
         54,
         89,
         55,
         107,
         71,
         67,
         80,
         110,
         34,
         41
        ]
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "patch_custody_locked_amount",
   "discriminator": [
    56,
    103,
    252,
    61,
    180,
    140,
    203,
    100
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "usdc_custody",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         69,
         80,
         106,
         70,
         87,
         100,
         100,
         53,
         65,
         117,
         102,
         113,
         83,
         83,
         113,
         101,
         77,
         50,
         113,
         78,
         49,
         120,
         122,
         121,
         98,
         97,
         112,
         67,
         56,
         71,
         52,
         119,
         69,
         71,
         71,
         107,
         90,
         119,
         121,
         84,
         68,
         116,
         49,
         118,
         34,
         41
        ]
       }
      ]
     }
    },
    {
     "name": "bonk_custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         68,
         101,
         122,
         88,
         65,
         90,
         56,
         122,
         55,
         80,
         110,
         114,
         110,
         82,
         74,
         106,
         122,
         51,
         119,
         88,
         66,
         111,
         82,
         103,
         105,
         120,
         67,
         97,
         54,
         120,
         106,
         110,
         66,
         55,
         89,
         97,
         66,
         49,
         112,
         80,
         66,
         50,
         54,
         51,
         34,
         41
        ]
       }
      ]
     }
    },
    {
     "name": "wbtc_custody",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         51,
         78,
         90,
         57,
         74,
         77,
         86,
         66,
         109,
         71,
         65,
         113,
         111,
         99,
         121,
         98,
         105,
         99,
         50,
         99,
         55,
         76,
         81,
         67,
         74,
         83,
         99,
         109,
         103,
         115,
         65,
         90,
         54,
         118,
         81,
         113,
         84,
         68,
         122,
         99,
         113,
         109,
         74,
         104,
         34,
         41
        ]
       }
      ]
     }
    },
    {
     "name": "jito_custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         117,
         115,
         116,
         111,
         100,
         121
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       },
       {
        "kind": "const",
        "value": [
         80,
         117,
         98,
         107,
         101,
         121,
         32,
         58,
         58,
         10,
         102,
         114,
         111,
         109,
         95,
         115,
         116,
         114,
         40,
         34,
         74,
         49,
         116,
         111,
         115,
         111,
         49,
         117,
         67,
         107,
         51,
         82,
         76,
         109,
         106,
         111,
         114,
         104,
         84,
         116,
         114,
         86,
         119,
         89,
         57,
         72,
         74,
         55,
         88,
         56,
         86,
         57,
         121,
         89,
         97,
         99,
         54,
         89,
         55,
         107,
         71,
         67,
         80,
         110,
         34,
         41
        ]
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "propose_admin",
   "discriminator": [
    121,
    214,
    199,
    212,
    87,
    39,
    117,
    234
   ],
   "accounts": [
    {
     "name": "admin",
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ProposeAdminParams"
      }
     }
    }
   ]
  },
  {
   "name": "register_oracle_feed",
   "discriminator": [
    87,
    251,
    248,
    255,
    188,
    177,
    69,
    71
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1",
      "Admin authority (DAO controlled via cortex.has_one = admin)."
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RegisterOracleFeedParams"
      }
     }
    }
   ]
  },
  {
   "name": "register_oracle_feeds_v38_to_v39",
   "discriminator": [
    104,
    198,
    152,
    9,
    214,
    247,
    48,
    32
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1",
      "Admin authority (DAO controlled via cortex.has_one = admin)."
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "remove_collateral_long",
   "discriminator": [
    179,
    122,
    186,
    139,
    223,
    72,
    205,
    58
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "receiving_account",
      "position"
     ]
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "adrena_program",
     "docs": [
      "#11"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "token_program",
     "docs": [
      "#12"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RemoveCollateralLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "remove_collateral_short",
   "discriminator": [
    242,
    74,
    116,
    29,
    106,
    148,
    241,
    205
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "receiving_account",
      "position"
     ]
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#9"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "adrena_program",
     "docs": [
      "#11"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "token_program",
     "docs": [
      "#12"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RemoveCollateralShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "remove_custody",
   "discriminator": [
    143,
    229,
    131,
    48,
    248,
    212,
    167,
    185
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#6"
     ],
     "writable": true
    },
    {
     "name": "custody_token_account",
     "docs": [
      "#7"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#8"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#9"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RemoveCustodyParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "remove_liquid_stake",
   "discriminator": [
    105,
    41,
    117,
    216,
    103,
    113,
    176,
    174
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "staked_token_account",
      "lm_token_account",
      "reward_token_account"
     ]
    },
    {
     "name": "staked_token_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#13"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#15"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#16"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm",
     "docs": [
      "#17",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#18"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#19",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#20",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "governance_program",
     "docs": [
      "#21"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#22"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#23"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#24"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RemoveLiquidStakeParams"
      }
     }
    }
   ]
  },
  {
   "name": "remove_liquidity",
   "discriminator": [
    80,
    85,
    209,
    72,
    24,
    206,
    177,
    108
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "lp_token_account"
     ]
    },
    {
     "name": "receiving_account",
     "docs": [
      "#2 Front end will target the owner account, but not limited to"
     ],
     "writable": true
    },
    {
     "name": "lp_token_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#7",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "custody_token_account",
     "docs": [
      "#9"
     ],
     "writable": true
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "token_program",
     "docs": [
      "#11"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#12"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RemoveLiquidityParams"
      }
     }
    }
   ]
  },
  {
   "name": "remove_locked_stake",
   "discriminator": [
    198,
    147,
    178,
    249,
    220,
    14,
    164,
    33
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "lm_token_account",
      "staked_token_account",
      "reward_token_account"
     ]
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "staked_token_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#13"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "staked_token_mint",
     "docs": [
      "#15"
     ],
     "writable": true,
     "relations": [
      "staking"
     ]
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#16"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#17"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm",
     "docs": [
      "#18",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#19"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#20",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#21",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "governance_program",
     "docs": [
      "#22"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#23"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#24"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#25"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "RemoveLockedStakeParams"
      }
     }
    }
   ]
  },
  {
   "name": "remove_pool",
   "discriminator": [
    132,
    42,
    53,
    138,
    28,
    220,
    170,
    55
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [],
   "returns": "u8"
  },
  {
   "name": "remove_synthetic_custody",
   "discriminator": [
    29,
    210,
    157,
    210,
    248,
    235,
    79,
    98
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#5",
      "Must be a synthetic custody owned by this pool (token custodies go through",
      "`remove_custody`, which also drains/closes their vault)."
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": []
  },
  {
   "name": "resolve_position_borrow_fees",
   "discriminator": [
    220,
    145,
    23,
    255,
    234,
    9,
    41,
    145
   ],
   "accounts": [
    {
     "name": "signer",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#5"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#7"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "collateral_custody",
     "docs": [
      "#8"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "user_profile",
     "docs": [
      "#9"
     ],
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         112,
         114,
         111,
         102,
         105,
         108,
         101
        ]
       },
       {
        "kind": "account",
        "path": "position"
       }
      ]
     }
    },
    {
     "name": "referrer_profile",
     "docs": [
      "#10"
     ],
     "writable": true,
     "optional": true
    },
    {
     "name": "token_program",
     "docs": [
      "#11"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#12"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#13"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "ResolvePositionBorrowFeesParams"
      }
     }
    }
   ]
  },
  {
   "name": "resolve_staking_round",
   "discriminator": [
    47,
    151,
    59,
    12,
    121,
    175,
    248,
    250
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#10"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "adrena_program",
     "docs": [
      "#11"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#12"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "set_admin",
   "discriminator": [
    251,
    163,
    0,
    52,
    91,
    194,
    187,
    92
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetAdminParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_all_pools_fee_shares",
   "docs": [
    "Updates fee shares for ALL pools in a single instruction.",
    "Pools are passed via remaining_accounts."
   ],
   "discriminator": [
    50,
    111,
    85,
    210,
    151,
    10,
    29,
    211
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetAllPoolsFeeSharesParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_confidence_band_bps",
   "discriminator": [
    212,
    89,
    194,
    80,
    123,
    208,
    20,
    64
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetConfidenceBandBpsParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_custody_allow_swap",
   "discriminator": [
    70,
    172,
    206,
    130,
    229,
    55,
    110,
    97
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyAllowSwapParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_custody_allow_trade",
   "discriminator": [
    97,
    76,
    66,
    219,
    109,
    177,
    5,
    67
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyAllowTradeParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_custody_config",
   "discriminator": [
    133,
    97,
    130,
    143,
    215,
    229,
    36,
    176
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyConfigParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "set_custody_max_cumulative_long_position_size_usd",
   "discriminator": [
    93,
    108,
    169,
    98,
    62,
    247,
    139,
    250
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint/seed) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyMaxCumulativeLongPositionSizeUsdParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_custody_max_cumulative_short_position_size_usd",
   "discriminator": [
    183,
    67,
    92,
    63,
    115,
    143,
    184,
    52
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyMaxCumulativeShortPositionSizeUsdParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_custody_trade_halt",
   "discriminator": [
    77,
    17,
    66,
    197,
    41,
    248,
    254,
    87
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed).",
      "release/39_5 — ALSO asserts `custody.pool == pool` (the explicit owning-pool bind",
      "the other per-custody setters leave implicit; mirrors migrate_custody_v38_to_v39)."
     ],
     "writable": true
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyTradeHaltParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_custody_virtual_funding",
   "discriminator": [
    48,
    2,
    26,
    117,
    168,
    226,
    147,
    4
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "pool",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "custody",
     "docs": [
      "#4",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "system_program",
     "docs": [
      "#5"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetCustodyVirtualFundingParams"
      }
     }
    }
   ],
   "returns": "u8"
  },
  {
   "name": "set_pool_allow_swap",
   "discriminator": [
    246,
    8,
    182,
    136,
    186,
    208,
    249,
    35
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolAllowSwapParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_allow_trade",
   "discriminator": [
    135,
    138,
    235,
    91,
    224,
    8,
    112,
    3
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolAllowTradeParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_aum_soft_cap_usd",
   "discriminator": [
    124,
    194,
    30,
    229,
    89,
    235,
    94,
    38
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolAumSoftCapUsdParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_fee_config",
   "discriminator": [
    215,
    49,
    53,
    3,
    8,
    246,
    219,
    117
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolFeeConfigParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_liquidity_state",
   "discriminator": [
    154,
    229,
    163,
    5,
    137,
    121,
    175,
    86
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolLiquidityStateParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_oracle_config",
   "discriminator": [
    26,
    200,
    232,
    158,
    142,
    234,
    102,
    125
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1",
      "Admin authority (DAO controlled)"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#4",
      "Read-only. Used to verify that the proposed multi_oracle_config is",
      "satisfiable given the currently-registered provider slots."
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolOracleConfigParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_position_exit_fee_config",
   "discriminator": [
    83,
    224,
    152,
    18,
    111,
    247,
    64,
    93
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetPoolPositionExitFeeConfigParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_pool_whitelisted_swapper",
   "discriminator": [
    164,
    104,
    239,
    240,
    105,
    120,
    245,
    213
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "whitelisted_swapper",
     "docs": [
      "#4"
     ]
    }
   ],
   "args": []
  },
  {
   "name": "set_protocol_fee_recipient",
   "discriminator": [
    129,
    247,
    28,
    179,
    155,
    143,
    49,
    7
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "protocol_fee_recipient",
     "docs": [
      "#3"
     ]
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#4"
     ],
     "relations": [
      "cortex"
     ]
    }
   ],
   "args": []
  },
  {
   "name": "set_staking_lm_emission_potentiometers",
   "discriminator": [
    254,
    56,
    180,
    137,
    121,
    53,
    128,
    13
   ],
   "accounts": [
    {
     "name": "admin",
     "docs": [
      "#1"
     ],
     "signer": true,
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetStakingLmEmissionPotentiometersParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_stop_loss_long",
   "discriminator": [
    114,
    218,
    115,
    58,
    115,
    232,
    35,
    150
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetStopLossLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_stop_loss_short",
   "discriminator": [
    91,
    5,
    98,
    54,
    75,
    233,
    9,
    236
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetStopLossShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_take_profit_long",
   "discriminator": [
    149,
    97,
    30,
    150,
    50,
    205,
    12,
    173
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetTakeProfitLongParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_take_profit_short",
   "discriminator": [
    39,
    205,
    117,
    205,
    83,
    9,
    69,
    160
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     },
     "relations": [
      "position"
     ]
    },
    {
     "name": "position",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "custody",
     "docs": [
      "#5"
     ],
     "writable": true,
     "relations": [
      "position"
     ]
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetTakeProfitShortParams"
      }
     }
    }
   ]
  },
  {
   "name": "set_vest_delegate",
   "discriminator": [
    13,
    252,
    155,
    199,
    243,
    105,
    252,
    251
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ],
     "relations": [
      "vest"
     ]
    },
    {
     "name": "payer",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "cortex",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "vest",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "system_program",
     "docs": [
      "#6"
     ],
     "address": "11111111111111111111111111111111"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SetVestDelegateParams"
      }
     }
    }
   ]
  },
  {
   "name": "swap",
   "discriminator": [
    248,
    198,
    158,
    145,
    225,
    117,
    135,
    200
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#2"
     ],
     "signer": true,
     "relations": [
      "funding_account",
      "receiving_account"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "receiving_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "receiving_custody",
     "docs": [
      "#8",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "oracle",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "receiving_custody_token_account",
     "docs": [
      "#10"
     ],
     "writable": true
    },
    {
     "name": "dispensing_custody",
     "docs": [
      "#11",
      "Supports both token custodies (PDA from mint) and synthetic custodies (PDA from seed)"
     ],
     "writable": true
    },
    {
     "name": "dispensing_custody_token_account",
     "docs": [
      "#12"
     ],
     "writable": true
    },
    {
     "name": "token_program",
     "docs": [
      "#13"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#14"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "SwapParams"
      }
     }
    }
   ]
  },
  {
   "name": "sync_user_voting_power",
   "discriminator": [
    94,
    1,
    234,
    111,
    197,
    70,
    50,
    127
   ],
   "accounts": [
    {
     "name": "caller",
     "docs": [
      "#1"
     ],
     "signer": true
    },
    {
     "name": "payer",
     "docs": [
      "#2"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "owner",
     "docs": [
      "#3"
     ],
     "relations": [
      "vest"
     ]
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#4"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#6"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#7"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "lm_token_mint",
     "docs": [
      "#8"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "governance_realm",
     "docs": [
      "#10",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#11"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#12",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#13",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "vest_registry",
     "docs": [
      "#14"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116,
         95,
         114,
         101,
         103,
         105,
         115,
         116,
         114,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "vest",
     "docs": [
      "#15"
     ],
     "optional": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         118,
         101,
         115,
         116
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       }
      ]
     }
    },
    {
     "name": "governance_program",
     "docs": [
      "#16"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "adrena_program",
     "docs": [
      "#17"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "system_program",
     "docs": [
      "#18"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#19"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": []
  },
  {
   "name": "update_oracle",
   "discriminator": [
    112,
    41,
    209,
    18,
    248,
    226,
    252,
    188
   ],
   "accounts": [
    {
     "name": "cortex",
     "docs": [
      "#1"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#2"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "UpdateOracleParams"
      }
     }
    }
   ]
  },
  {
   "name": "update_pool_aum",
   "discriminator": [
    10,
    125,
    230,
    234,
    157,
    184,
    236,
    241
   ],
   "accounts": [
    {
     "name": "payer",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true
    },
    {
     "name": "cortex",
     "docs": [
      "#2"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#3"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "oracle",
     "docs": [
      "#4"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         111,
         114,
         97,
         99,
         108,
         101
        ]
       }
      ]
     }
    },
    {
     "name": "lp_token_mint",
     "docs": [
      "#5"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         112,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "UpdatePoolAumParams"
      }
     }
    }
   ],
   "returns": "u128"
  },
  {
   "name": "upgrade_locked_stake",
   "discriminator": [
    151,
    103,
    128,
    107,
    112,
    115,
    67,
    172
   ],
   "accounts": [
    {
     "name": "owner",
     "docs": [
      "#1"
     ],
     "writable": true,
     "signer": true,
     "relations": [
      "funding_account",
      "reward_token_account",
      "lm_token_account"
     ]
    },
    {
     "name": "funding_account",
     "docs": [
      "#2"
     ],
     "writable": true
    },
    {
     "name": "reward_token_account",
     "docs": [
      "#3"
     ],
     "writable": true
    },
    {
     "name": "lm_token_account",
     "docs": [
      "#4"
     ],
     "writable": true
    },
    {
     "name": "staking_staked_token_vault",
     "docs": [
      "#5"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         115,
         116,
         97,
         107,
         101,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking_reward_token_vault",
     "docs": [
      "#6"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "transfer_authority",
     "docs": [
      "#7"
     ],
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         116,
         114,
         97,
         110,
         115,
         102,
         101,
         114,
         95,
         97,
         117,
         116,
         104,
         111,
         114,
         105,
         116,
         121
        ]
       }
      ]
     }
    },
    {
     "name": "user_staking",
     "docs": [
      "#8"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         117,
         115,
         101,
         114,
         95,
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "owner"
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "staking",
     "docs": [
      "#9"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "cortex",
     "docs": [
      "#10"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         99,
         111,
         114,
         116,
         101,
         120
        ]
       }
      ]
     }
    },
    {
     "name": "governance_token_mint",
     "docs": [
      "#11"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         111,
         118,
         101,
         114,
         110,
         97,
         110,
         99,
         101,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         109,
         105,
         110,
         116
        ]
       }
      ]
     }
    },
    {
     "name": "pool",
     "docs": [
      "#12"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         112,
         111,
         111,
         108
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "genesis_lock",
     "docs": [
      "#13"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         103,
         101,
         110,
         101,
         115,
         105,
         115,
         95,
         108,
         111,
         99,
         107
        ]
       },
       {
        "kind": "account",
        "path": "pool"
       }
      ]
     }
    },
    {
     "name": "lm_token_treasury",
     "docs": [
      "#14"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         108,
         109,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         116,
         114,
         101,
         97,
         115,
         117,
         114,
         121
        ]
       },
       {
        "kind": "account",
        "path": "cortex"
       }
      ]
     }
    },
    {
     "name": "fee_redistribution_mint",
     "docs": [
      "#15"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm",
     "docs": [
      "#16",
      "A realm represent one project within the governance program"
     ],
     "relations": [
      "cortex"
     ]
    },
    {
     "name": "governance_realm_config",
     "docs": [
      "#17"
     ]
    },
    {
     "name": "governance_governing_token_holding",
     "docs": [
      "#18",
      "Token account owned by governance program holding user's locked tokens"
     ],
     "writable": true
    },
    {
     "name": "governance_governing_token_owner_record",
     "docs": [
      "#19",
      "Account owned by governance storing user information"
     ],
     "writable": true
    },
    {
     "name": "staking_lm_reward_token_vault",
     "docs": [
      "#20"
     ],
     "writable": true,
     "pda": {
      "seeds": [
       {
        "kind": "const",
        "value": [
         115,
         116,
         97,
         107,
         105,
         110,
         103,
         95,
         108,
         109,
         95,
         114,
         101,
         119,
         97,
         114,
         100,
         95,
         116,
         111,
         107,
         101,
         110,
         95,
         118,
         97,
         117,
         108,
         116
        ]
       },
       {
        "kind": "account",
        "path": "staking"
       }
      ]
     }
    },
    {
     "name": "adrena_program",
     "docs": [
      "#21"
     ],
     "address": "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"
    },
    {
     "name": "governance_program",
     "docs": [
      "#22"
     ],
     "address": "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    },
    {
     "name": "system_program",
     "docs": [
      "#23"
     ],
     "address": "11111111111111111111111111111111"
    },
    {
     "name": "token_program",
     "docs": [
      "#24"
     ],
     "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    }
   ],
   "args": [
    {
     "name": "params",
     "type": {
      "defined": {
       "name": "UpgradeLockedStakeParams"
      }
     }
    }
   ]
  }
 ],
 "accounts": [
  {
   "name": "Cortex",
   "discriminator": [
    143,
    120,
    192,
    142,
    209,
    42,
    159,
    192
   ]
  },
  {
   "name": "Custody",
   "discriminator": [
    1,
    184,
    48,
    81,
    93,
    131,
    63,
    145
   ]
  },
  {
   "name": "GenesisLock",
   "discriminator": [
    9,
    73,
    164,
    119,
    222,
    166,
    147,
    239
   ]
  },
  {
   "name": "LimitOrderBook",
   "discriminator": [
    157,
    26,
    225,
    42,
    217,
    203,
    162,
    30
   ]
  },
  {
   "name": "Oracle",
   "discriminator": [
    139,
    194,
    131,
    179,
    140,
    179,
    229,
    244
   ]
  },
  {
   "name": "Pool",
   "discriminator": [
    241,
    154,
    109,
    4,
    17,
    177,
    109,
    188
   ]
  },
  {
   "name": "PoolInfoSnapshotPda",
   "discriminator": [
    38,
    144,
    57,
    133,
    214,
    128,
    126,
    170
   ]
  },
  {
   "name": "Position",
   "discriminator": [
    170,
    188,
    143,
    228,
    122,
    64,
    247,
    208
   ]
  },
  {
   "name": "Staking",
   "discriminator": [
    242,
    134,
    183,
    223,
    18,
    13,
    184,
    23
   ]
  },
  {
   "name": "UserProfile",
   "discriminator": [
    32,
    37,
    119,
    205,
    179,
    180,
    13,
    194
   ]
  },
  {
   "name": "UserStaking",
   "discriminator": [
    34,
    83,
    202,
    93,
    25,
    243,
    63,
    54
   ]
  },
  {
   "name": "Vest",
   "discriminator": [
    45,
    204,
    95,
    56,
    150,
    233,
    97,
    231
   ]
  },
  {
   "name": "VestRegistry",
   "discriminator": [
    57,
    105,
    96,
    158,
    49,
    154,
    10,
    29
   ]
  }
 ],
 "events": [
  {
   "name": "AddCollateralEvent",
   "discriminator": [
    86,
    118,
    79,
    201,
    155,
    39,
    36,
    236
   ]
  },
  {
   "name": "AddLockedStakeEvent",
   "discriminator": [
    66,
    214,
    75,
    185,
    144,
    20,
    143,
    129
   ]
  },
  {
   "name": "CancelStopLossEvent",
   "discriminator": [
    217,
    94,
    158,
    148,
    24,
    126,
    41,
    63
   ]
  },
  {
   "name": "CancelTakeProfitEvent",
   "discriminator": [
    137,
    114,
    24,
    141,
    168,
    57,
    22,
    173
   ]
  },
  {
   "name": "ClosePositionEvent",
   "discriminator": [
    198,
    217,
    115,
    95,
    191,
    120,
    142,
    137
   ]
  },
  {
   "name": "FinalizeLockedStakeEvent",
   "discriminator": [
    72,
    124,
    147,
    100,
    21,
    176,
    221,
    111
   ]
  },
  {
   "name": "IncreasePositionEvent",
   "discriminator": [
    245,
    113,
    85,
    52,
    214,
    187,
    153,
    132
   ]
  },
  {
   "name": "LiquidateEvent",
   "discriminator": [
    158,
    94,
    144,
    4,
    147,
    52,
    5,
    255
   ]
  },
  {
   "name": "OpenPositionEvent",
   "discriminator": [
    83,
    43,
    164,
    147,
    169,
    87,
    81,
    172
   ]
  },
  {
   "name": "RemoveCollateralEvent",
   "discriminator": [
    123,
    127,
    41,
    32,
    168,
    28,
    237,
    68
   ]
  },
  {
   "name": "RemoveLockedStakeEvent",
   "discriminator": [
    195,
    185,
    172,
    60,
    92,
    72,
    224,
    165
   ]
  },
  {
   "name": "SetStopLossEvent",
   "discriminator": [
    31,
    157,
    31,
    160,
    126,
    25,
    227,
    23
   ]
  },
  {
   "name": "SetTakeProfitEvent",
   "discriminator": [
    46,
    72,
    148,
    1,
    252,
    245,
    74,
    46
   ]
  },
  {
   "name": "UpgradeLockedStakeEvent",
   "discriminator": [
    47,
    163,
    41,
    116,
    38,
    163,
    237,
    195
   ]
  }
 ],
 "errors": [
  {
   "code": 6000,
   "name": "MathOverflow",
   "msg": "Overflow in arithmetic operation"
  },
  {
   "code": 6001,
   "name": "UnsupportedOracle",
   "msg": "Unsupported price oracle"
  },
  {
   "code": 6002,
   "name": "InvalidOracleAccount",
   "msg": "Invalid oracle account"
  },
  {
   "code": 6003,
   "name": "InvalidOracleState",
   "msg": "Invalid oracle state"
  },
  {
   "code": 6004,
   "name": "StaleOraclePrice",
   "msg": "Stale oracle price"
  },
  {
   "code": 6005,
   "name": "InvalidOraclePrice",
   "msg": "Invalid oracle price"
  },
  {
   "code": 6006,
   "name": "InvalidTimestamp",
   "msg": "Invalid oracle timestamp"
  },
  {
   "code": 6007,
   "name": "InvalidOracleProvider",
   "msg": "Invalid oracle provider"
  },
  {
   "code": 6008,
   "name": "InvalidEnvironment",
   "msg": "Instruction is not allowed in production"
  },
  {
   "code": 6009,
   "name": "InvalidPoolLiquidityState",
   "msg": "Invalid pool liquidity state"
  },
  {
   "code": 6010,
   "name": "InvalidCortexState",
   "msg": "Invalid cortex state"
  },
  {
   "code": 6011,
   "name": "InvalidStakingState",
   "msg": "Invalid staking state"
  },
  {
   "code": 6012,
   "name": "InvalidPoolState",
   "msg": "Invalid pool state"
  },
  {
   "code": 6013,
   "name": "InvalidPoolType",
   "msg": "Invalid pool type"
  },
  {
   "code": 6014,
   "name": "InvalidVestState",
   "msg": "Invalid vest state"
  },
  {
   "code": 6015,
   "name": "InvalidStakeState",
   "msg": "Invalid stake state"
  },
  {
   "code": 6016,
   "name": "InvalidCustody",
   "msg": "Invalid custody"
  },
  {
   "code": 6017,
   "name": "InvalidCustodyAccount",
   "msg": "Invalid custody account"
  },
  {
   "code": 6018,
   "name": "InvalidCustodyState",
   "msg": "Invalid custody state"
  },
  {
   "code": 6019,
   "name": "InvalidCollateralCustody",
   "msg": "Invalid collateral custody"
  },
  {
   "code": 6020,
   "name": "InvalidPositionState",
   "msg": "Invalid position state"
  },
  {
   "code": 6021,
   "name": "PositionNotInLiquidationRange",
   "msg": "The position is not in liquidation range"
  },
  {
   "code": 6022,
   "name": "InvalidStakingRoundState",
   "msg": "Invalid staking round state"
  },
  {
   "code": 6023,
   "name": "InvalidAdrenaConfig",
   "msg": "Invalid adrena config"
  },
  {
   "code": 6024,
   "name": "InvalidPoolConfig",
   "msg": "Invalid pool config"
  },
  {
   "code": 6025,
   "name": "InvalidCustodyConfig",
   "msg": "Invalid custody config"
  },
  {
   "code": 6026,
   "name": "InsufficientAmountReturned",
   "msg": "Insufficient token amount returned"
  },
  {
   "code": 6027,
   "name": "MaxPriceSlippage",
   "msg": "Price slippage limit exceeded"
  },
  {
   "code": 6028,
   "name": "MaxLeverage",
   "msg": "Position leverage limit exceeded"
  },
  {
   "code": 6029,
   "name": "MinLeverage",
   "msg": "Position leverage under minimum"
  },
  {
   "code": 6030,
   "name": "CustodyAmountLimit",
   "msg": "Custody amount limit exceeded"
  },
  {
   "code": 6031,
   "name": "PositionAmountLimit",
   "msg": "Position amount limit exceeded"
  },
  {
   "code": 6032,
   "name": "TokenRatioOutOfRange",
   "msg": "Token ratio out of range"
  },
  {
   "code": 6033,
   "name": "UnsupportedToken",
   "msg": "Token is not supported"
  },
  {
   "code": 6034,
   "name": "InstructionNotAllowed",
   "msg": "Instruction is not allowed at this time"
  },
  {
   "code": 6035,
   "name": "MaxUtilization",
   "msg": "Token utilization limit exceeded"
  },
  {
   "code": 6036,
   "name": "MaxRegisteredResolvedStakingRoundReached",
   "msg": "Max registered resolved staking round reached"
  },
  {
   "code": 6037,
   "name": "InvalidGovernanceProgram",
   "msg": "Governance program do not match Cortex's one"
  },
  {
   "code": 6038,
   "name": "InvalidGovernanceRealm",
   "msg": "Governance realm do not match Cortex's one"
  },
  {
   "code": 6039,
   "name": "InvalidVestingUnlockTime",
   "msg": "Vesting unlock time is too close or passed"
  },
  {
   "code": 6040,
   "name": "InvalidStakingLockingTime",
   "msg": "Invalid staking locking time"
  },
  {
   "code": 6041,
   "name": "UserStakeNotFound",
   "msg": "The user stake account specified could not be found"
  },
  {
   "code": 6042,
   "name": "InvalidAccountData",
   "msg": "Invalid account data"
  },
  {
   "code": 6043,
   "name": "UnresolvedStake",
   "msg": "Stake is not resolved"
  },
  {
   "code": 6044,
   "name": "BucketMintLimit",
   "msg": "Reached bucket mint limit"
  },
  {
   "code": 6045,
   "name": "GenesisAlpLimitReached",
   "msg": "Genesis ALP add liquidity limit reached"
  },
  {
   "code": 6046,
   "name": "PermissionlessOracleMissingSignature",
   "msg": "Permissionless oracle update must be preceded by Ed25519 signature verification instruction"
  },
  {
   "code": 6047,
   "name": "PermissionlessOracleMalformedEd25519Data",
   "msg": "Ed25519 signature verification data does not match expected format"
  },
  {
   "code": 6048,
   "name": "PermissionlessOracleSignerMismatch",
   "msg": "Ed25519 signature was not signed by the oracle authority"
  },
  {
   "code": 6049,
   "name": "PermissionlessOracleMessageMismatch",
   "msg": "Signed message does not match instruction params"
  },
  {
   "code": 6050,
   "name": "CustodyStableLockedAmountNotFound",
   "msg": "Cannot find custody stable locked amount"
  },
  {
   "code": 6051,
   "name": "CustodyNotFound",
   "msg": "Cannot find custody"
  },
  {
   "code": 6052,
   "name": "InsufficientBucketReserve",
   "msg": "The bucket does not contain enough token for reserving this allocation"
  },
  {
   "code": 6053,
   "name": "UserNicknameTooLong",
   "msg": "User nickname exceed 24 characters"
  },
  {
   "code": 6054,
   "name": "UserNicknameTooShort",
   "msg": "User nickname is less than 3 characters"
  },
  {
   "code": 6055,
   "name": "InvalidGenesisLockState",
   "msg": "Invalid genesis lock state"
  },
  {
   "code": 6056,
   "name": "GenesisLockCampaignFullySubscribed",
   "msg": "The campaign is fully subscribed"
  },
  {
   "code": 6057,
   "name": "PoolAumSoftCapUsdReached",
   "msg": "The pool is fully subscribed"
  },
  {
   "code": 6058,
   "name": "MaxRegisteredPool",
   "msg": "The number of registered pool reached max amount"
  },
  {
   "code": 6059,
   "name": "MaxRegisteredCustodies",
   "msg": "The number of registered custody reached max amount"
  },
  {
   "code": 6060,
   "name": "MaxCumulativeShortPositionSizeLimit",
   "msg": "The short limit for this asset has been reached"
  },
  {
   "code": 6061,
   "name": "MaxCumulativeLongPositionSizeLimit",
   "msg": "The long limit for this asset has been reached"
  },
  {
   "code": 6062,
   "name": "LockedStakeArrayFull",
   "msg": "The max number of LockedStaking has been reached"
  },
  {
   "code": 6063,
   "name": "IndexOutOfBounds",
   "msg": "Requested index is out of bounds"
  },
  {
   "code": 6064,
   "name": "InvalidCaller",
   "msg": "The instruction must be call with a specific account as caller"
  },
  {
   "code": 6065,
   "name": "InvalidBucketName",
   "msg": "Invalid bucket name"
  },
  {
   "code": 6066,
   "name": "InvalidThreadId",
   "msg": "(deprecated)The provided Sablier thread does not have the expected ID"
  },
  {
   "code": 6067,
   "name": "PythPriceExponentTooLargeIncurringPrecisionLoss",
   "msg": "The exponent used for pyth price lead to high precision loss"
  },
  {
   "code": 6068,
   "name": "MissingClosePositionPrice",
   "msg": "The close position price is mandatory"
  },
  {
   "code": 6069,
   "name": "InvalidVoteMultiplier",
   "msg": "Invalid vote multiplier"
  },
  {
   "code": 6070,
   "name": "PositionTooYoung",
   "msg": "A position cannot be close right after open or update, a slight delay is enforced"
  },
  {
   "code": 6071,
   "name": "InsufficientCollateral",
   "msg": "The minimum amount of collateral posted to open a position is not met"
  },
  {
   "code": 6072,
   "name": "InvalidLockDuration",
   "msg": "The provided lock duration isn't valid"
  },
  {
   "code": 6073,
   "name": "StakeNotEstablished",
   "msg": "The stake isn't established yet"
  },
  {
   "code": 6074,
   "name": "PositionAlreadyClosed",
   "msg": "The position is already pending cleanup and close"
  },
  {
   "code": 6075,
   "name": "InvalidLimitOrderState",
   "msg": "Invalid limit order state"
  },
  {
   "code": 6076,
   "name": "InvalidWallpaperOrProfilePictureOrTitle",
   "msg": "Wallpaper or Profile Picture or Title is invalid"
  },
  {
   "code": 6077,
   "name": "InvalidVersion",
   "msg": "Invalid version"
  },
  {
   "code": 6078,
   "name": "InvalidVestVersion",
   "msg": "Invalid vest version"
  },
  {
   "code": 6079,
   "name": "MissingOrInvalidReferrerAccount",
   "msg": "Missing or invalid referrer account"
  },
  {
   "code": 6080,
   "name": "WallpaperNotUnlocked",
   "msg": "The requested wallpaper has not been unlocked by this user"
  },
  {
   "code": 6081,
   "name": "ProfilePictureNotUnlocked",
   "msg": "The requested profile picture has not been unlocked by this user"
  },
  {
   "code": 6082,
   "name": "TitleNotUnlocked",
   "msg": "The requested title has not been unlocked by this user"
  },
  {
   "code": 6083,
   "name": "InvalidAchievement",
   "msg": "Invalid achievement ID"
  },
  {
   "code": 6084,
   "name": "UserNicknameInvalidFormat",
   "msg": "User nickname expected format: Monster followed by digits"
  },
  {
   "code": 6085,
   "name": "InvalidContinentOrTeam",
   "msg": "Continent or Team is invalid"
  },
  {
   "code": 6086,
   "name": "TeamImmutable",
   "msg": "The team can not be changed after being already set"
  },
  {
   "code": 6087,
   "name": "InvalidSigner",
   "msg": "Invalid signer"
  },
  {
   "code": 6088,
   "name": "MissingOraclePrice",
   "msg": "Missing at least one oracle price"
  },
  {
   "code": 6089,
   "name": "InvalidOracleSignature",
   "msg": "Invalid oracle signature"
  },
  {
   "code": 6090,
   "name": "CustodyBelowMinimum",
   "msg": "Custody amount is below minimum required"
  },
  {
   "code": 6091,
   "name": "CustodyAlreadyMigrated",
   "msg": "Custody borrow rate params already migrated"
  },
  {
   "code": 6092,
   "name": "InvalidFeedId",
   "msg": "Invalid feed id"
  },
  {
   "code": 6093,
   "name": "NoOracleEmptySlotFound",
   "msg": "No empty oracle slot found"
  },
  {
   "code": 6094,
   "name": "InvalidMarketOpeningData",
   "msg": "Invalid market opening data"
  },
  {
   "code": 6095,
   "name": "InvalidFeeDistribution",
   "msg": "Invalid fee distribution"
  },
  {
   "code": 6096,
   "name": "MarketIsClosed",
   "msg": "Market is closed"
  },
  {
   "code": 6097,
   "name": "MarketStockSpecialEvent",
   "msg": "Position is affected by a stock split or dividend event"
  },
  {
   "code": 6098,
   "name": "SwitchboardMissingAccounts",
   "msg": "Missing Switchboard remaining accounts"
  },
  {
   "code": 6099,
   "name": "SwitchboardInvalidQuoteAccount",
   "msg": "Invalid Switchboard quote account"
  },
  {
   "code": 6100,
   "name": "SwitchboardInvalidQueue",
   "msg": "Switchboard quote account queue does not match expected queue"
  },
  {
   "code": 6101,
   "name": "SwitchboardMalformedQuoteData",
   "msg": "Malformed Switchboard quote account data"
  },
  {
   "code": 6102,
   "name": "SwitchboardQuoteTooStale",
   "msg": "Switchboard quote is stale"
  },
  {
   "code": 6103,
   "name": "SwitchboardFeedMappingMissing",
   "msg": "Missing Switchboard feed mapping"
  },
  {
   "code": 6104,
   "name": "SwitchboardFeedMappingDuplicate",
   "msg": "Duplicate Switchboard feed mapping or duplicate feed update"
  },
  {
   "code": 6105,
   "name": "AdminTransferTooEarly",
   "msg": "Admin transfer delay has not elapsed"
  },
  {
   "code": 6106,
   "name": "InvalidArgument",
   "msg": "Invalid argument"
  },
  {
   "code": 6107,
   "name": "LiquidationPausedNoBackupOracle",
   "msg": "Liquidation paused: no backup oracle has fresh price for this asset"
  },
  {
   "code": 6108,
   "name": "LiquidationPausedCircuitBreaker",
   "msg": "Liquidation paused: backup oracle infrastructure is down"
  },
  {
   "code": 6109,
   "name": "InsufficientOracleCoverage",
   "msg": "Insufficient oracle coverage for pool custodies under proposed multi_oracle_config"
  },
  {
   "code": 6110,
   "name": "OracleAccountCapacityExhausted",
   "msg": "Oracle account does not have enough empty slots for the requested registrations"
  },
  {
   "code": 6111,
   "name": "TradeHalted",
   "msg": "Trade halted: this custody's close/liquidate exit path is halted by admin"
  }
 ],
 "types": [
  {
   "name": "AddCollateralEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "position",
      "type": "pubkey"
     },
     {
      "name": "custody_mint",
      "type": "pubkey"
     },
     {
      "name": "custody_seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "add_amount_usd",
      "type": "u64"
     },
     {
      "name": "new_collateral_amount_usd",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "AddCollateralLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "AddCollateralShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "AddCustodyParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "is_stable",
      "type": "bool"
     },
     {
      "name": "pricing",
      "type": {
       "defined": {
        "name": "PricingParams"
       }
      }
     },
     {
      "name": "allow_swap",
      "type": "bool"
     },
     {
      "name": "allow_trade",
      "type": "bool"
     },
     {
      "name": "fees",
      "type": {
       "defined": {
        "name": "Fees"
       }
      }
     },
     {
      "name": "borrow_rate",
      "type": {
       "defined": {
        "name": "BorrowRateParams"
       }
      }
     },
     {
      "name": "ratios",
      "type": {
       "array": [
        {
         "defined": {
          "name": "TokenRatios"
         }
        },
        8
       ]
      }
     },
     {
      "name": "oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "trade_oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     }
    ]
   }
  },
  {
   "name": "AddLimitOrderParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "trigger_price",
      "type": "u64"
     },
     {
      "name": "limit_price",
      "type": {
       "option": "u64"
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "AddLiquidStakeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "AddLiquidityParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount_in",
      "type": "u64"
     },
     {
      "name": "min_lp_amount_out",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "AddLockedStakeEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "staking",
      "type": "pubkey"
     },
     {
      "name": "locked_stake_id",
      "type": "u64"
     },
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "locked_days",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "AddLockedStakeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "locked_days",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "AddPoolPartOneParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "name",
      "type": "string"
     },
     {
      "name": "aum_soft_cap_usd",
      "type": "u64"
     },
     {
      "name": "lp_token_name",
      "type": "string"
     },
     {
      "name": "lp_token_symbol",
      "type": "string"
     },
     {
      "name": "lp_token_uri",
      "type": "string"
     },
     {
      "name": "pool_type",
      "type": {
       "option": "u8"
      }
     },
     {
      "name": "oracle_provider",
      "type": {
       "option": "u8"
      }
     },
     {
      "name": "manager_fee_recipient",
      "type": {
       "option": "pubkey"
      }
     }
    ]
   }
  },
  {
   "name": "AddPoolPartTwoParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "genesis_lock_campaign_duration",
      "type": "i64"
     },
     {
      "name": "genesis_reserved_grant_duration",
      "type": "i64"
     },
     {
      "name": "genesis_lock_campaign_start_date",
      "type": "i64"
     },
     {
      "name": "reserved_spots",
      "type": {
       "defined": {
        "name": "ReservedSpots"
       }
      }
     }
    ]
   }
  },
  {
   "name": "AddSyntheticCustodyParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "pricing",
      "type": {
       "defined": {
        "name": "PricingParams"
       }
      }
     },
     {
      "name": "allow_swap",
      "type": "bool"
     },
     {
      "name": "allow_trade",
      "type": "bool"
     },
     {
      "name": "fees",
      "type": {
       "defined": {
        "name": "Fees"
       }
      }
     },
     {
      "name": "borrow_rate",
      "type": {
       "defined": {
        "name": "BorrowRateParams"
       }
      }
     },
     {
      "name": "trade_oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "trade_oracle_feed_id",
      "type": "u8"
     },
     {
      "name": "seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     }
    ]
   }
  },
  {
   "name": "AddVestParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "origin_bucket",
      "type": "u8"
     },
     {
      "name": "unlock_start_timestamp",
      "type": "i64"
     },
     {
      "name": "unlock_end_timestamp",
      "type": "i64"
     },
     {
      "name": "vote_multiplier",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "AmountAndFee",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "fee",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "Assets",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "owned",
      "type": "u64"
     },
     {
      "name": "locked",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "AutonomMarketOpeningData",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "feeds",
      "type": "bytes"
     },
     {
      "name": "market_close_affected_feeds",
      "type": "bytes"
     },
     {
      "name": "market_open_timestamp",
      "type": "i64"
     },
     {
      "name": "market_close_timestamp",
      "type": "i64"
     },
     {
      "name": "feed_market_open_timestamps",
      "type": {
       "vec": "i64"
      }
     },
     {
      "name": "feed_market_close_timestamps",
      "type": {
       "vec": "i64"
      }
     },
     {
      "name": "signature",
      "type": {
       "array": [
        "u8",
        64
       ]
      }
     },
     {
      "name": "recovery_id",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "AutonomMarketOpeningParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "opening_data",
      "type": {
       "defined": {
        "name": "AutonomMarketOpeningData"
       }
      }
     }
    ]
   }
  },
  {
   "name": "BatchPrices",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "prices",
      "type": {
       "vec": {
        "defined": {
         "name": "PriceData"
        }
       }
      }
     },
     {
      "name": "signature",
      "type": {
       "array": [
        "u8",
        64
       ]
      }
     },
     {
      "name": "recovery_id",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "BatchPricesWithProvider",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "provider",
      "type": "u8"
     },
     {
      "name": "batch",
      "type": {
       "defined": {
        "name": "BatchPrices"
       }
      }
     }
    ]
   }
  },
  {
   "name": "BorrowRateParams",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "max_hourly_borrow_interest_rate",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "BorrowRateState",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "current_rate",
      "type": "u64"
     },
     {
      "name": "last_update",
      "type": "i64"
     },
     {
      "name": "cumulative_interest",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     }
    ]
   }
  },
  {
   "name": "CancelLimitOrderParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "id",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "CancelStopLossEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "position_side",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "CancelTakeProfitEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "position_side",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "ClaimStakesParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "locked_stake_indexes",
      "type": {
       "option": "bytes"
      }
     }
    ]
   }
  },
  {
   "name": "ClosePositionEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "position",
      "type": "pubkey"
     },
     {
      "name": "custody_mint",
      "type": "pubkey"
     },
     {
      "name": "custody_seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "size_usd",
      "type": "u64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral_amount_usd",
      "type": "u64"
     },
     {
      "name": "profit_usd",
      "type": "u64"
     },
     {
      "name": "loss_usd",
      "type": "u64"
     },
     {
      "name": "borrow_fee_usd",
      "type": "u64"
     },
     {
      "name": "exit_fee_usd",
      "type": "u64"
     },
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "percentage",
      "type": "u64"
     },
     {
      "name": "funding_paid_usd",
      "type": "u64"
     },
     {
      "name": "funding_received_usd",
      "type": "u64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "ClosePositionLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": {
       "option": "u64"
      }
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     },
     {
      "name": "percentage",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "ClosePositionShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": {
       "option": "u64"
      }
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     },
     {
      "name": "percentage",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "Cortex",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "transfer_authority_bump",
      "type": "u8"
     },
     {
      "name": "lm_token_bump",
      "type": "u8"
     },
     {
      "name": "governance_token_bump",
      "type": "u8"
     },
     {
      "name": "initialized",
      "type": "u8"
     },
     {
      "name": "fee_conversion_decimals",
      "type": "u8"
     },
     {
      "name": "confidence_band_bps",
      "type": "u16"
     },
     {
      "name": "lm_token_mint",
      "type": "pubkey"
     },
     {
      "name": "inception_time",
      "type": "i64"
     },
     {
      "name": "admin",
      "type": "pubkey"
     },
     {
      "name": "fee_redistribution_mint",
      "type": "pubkey"
     },
     {
      "name": "protocol_fee_recipient",
      "type": "pubkey"
     },
     {
      "name": "pools",
      "type": {
       "array": [
        "pubkey",
        4
       ]
      }
     },
     {
      "name": "user_profiles_count",
      "type": "u64"
     },
     {
      "name": "governance_program",
      "type": "pubkey"
     },
     {
      "name": "governance_realm",
      "type": "pubkey"
     },
     {
      "name": "core_contributor_bucket_allocation",
      "type": "u64"
     },
     {
      "name": "foundation_bucket_allocation",
      "type": "u64"
     },
     {
      "name": "ecosystem_bucket_allocation",
      "type": "u64"
     },
     {
      "name": "core_contributor_bucket_vested_amount",
      "type": "u64"
     },
     {
      "name": "core_contributor_bucket_minted_amount",
      "type": "u64"
     },
     {
      "name": "foundation_bucket_vested_amount",
      "type": "u64"
     },
     {
      "name": "foundation_bucket_minted_amount",
      "type": "u64"
     },
     {
      "name": "ecosystem_bucket_vested_amount",
      "type": "u64"
     },
     {
      "name": "ecosystem_bucket_minted_amount",
      "type": "u64"
     },
     {
      "name": "genesis_liquidity_alp_amount",
      "type": "u64"
     },
     {
      "name": "unique_position_id_counter",
      "type": "u64"
     },
     {
      "name": "pending_admin",
      "type": "pubkey"
     },
     {
      "name": "admin_transfer_request_time",
      "type": "i64"
     },
     {
      "name": "admin_transfer_min_delay_seconds",
      "type": "i64"
     }
    ]
   }
  },
  {
   "name": "Custody",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "token_account_bump",
      "type": "u8"
     },
     {
      "name": "allow_trade",
      "type": "u8"
     },
     {
      "name": "allow_swap",
      "type": "u8"
     },
     {
      "name": "decimals",
      "type": "u8"
     },
     {
      "name": "is_stable",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        2
       ]
      }
     },
     {
      "name": "pool",
      "type": "pubkey"
     },
     {
      "name": "mint",
      "type": "pubkey"
     },
     {
      "name": "token_account",
      "type": "pubkey"
     },
     {
      "name": "oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "trade_oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "pricing",
      "type": {
       "defined": {
        "name": "PricingParams"
       }
      }
     },
     {
      "name": "fees",
      "type": {
       "defined": {
        "name": "Fees"
       }
      }
     },
     {
      "name": "borrow_rate",
      "type": {
       "defined": {
        "name": "BorrowRateParams"
       }
      }
     },
     {
      "name": "collected_fees",
      "type": {
       "defined": {
        "name": "FeesStats"
       }
      }
     },
     {
      "name": "volume_stats",
      "type": {
       "defined": {
        "name": "VolumeStats"
       }
      }
     },
     {
      "name": "trade_stats",
      "type": {
       "defined": {
        "name": "TradeStats"
       }
      }
     },
     {
      "name": "assets",
      "type": {
       "defined": {
        "name": "Assets"
       }
      }
     },
     {
      "name": "long_positions",
      "type": {
       "defined": {
        "name": "PositionsAccounting"
       }
      }
     },
     {
      "name": "short_positions",
      "type": {
       "defined": {
        "name": "PositionsAccounting"
       }
      }
     },
     {
      "name": "borrow_rate_state",
      "type": {
       "defined": {
        "name": "BorrowRateState"
       }
      }
     },
     {
      "name": "optimal_utilization_bps",
      "type": "u64"
     },
     {
      "name": "virtual_funding",
      "type": {
       "defined": {
        "name": "VirtualFundingParams"
       }
      }
     },
     {
      "name": "virtual_funding_state",
      "type": {
       "defined": {
        "name": "VirtualFundingState"
       }
      }
     },
     {
      "name": "is_synthetic",
      "type": "u8"
     },
     {
      "name": "version",
      "type": "u8"
     },
     {
      "name": "oracle_feed_id",
      "type": "u8"
     },
     {
      "name": "trade_oracle_feed_id",
      "type": "u8"
     },
     {
      "name": "seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "_padding_autonom0",
      "type": {
       "array": [
        "u8",
        4
       ]
      }
     },
     {
      "name": "market_open_timestamp",
      "type": "i64"
     },
     {
      "name": "market_close_timestamp",
      "type": "i64"
     },
     {
      "name": "market_close_event_timestamp",
      "type": "i64"
     },
     {
      "name": "trade_halt",
      "type": "u8"
     },
     {
      "name": "_reserved",
      "type": {
       "array": [
        {
         "array": [
          "u8",
          32
         ]
        },
        5
       ]
      }
     },
     {
      "name": "_reserved_tail",
      "type": {
       "array": [
        "u8",
        31
       ]
      }
     }
    ]
   }
  },
  {
   "name": "CustodyInfoSnapshot",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "assets_value_usd",
      "type": "u64"
     },
     {
      "name": "owned",
      "type": "u64"
     },
     {
      "name": "locked",
      "type": "u64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "price_confidence",
      "type": "u64"
     },
     {
      "name": "trade_price",
      "type": "u64"
     },
     {
      "name": "trade_price_confidence",
      "type": "u64"
     },
     {
      "name": "short_pnl",
      "type": "i64"
     },
     {
      "name": "long_pnl",
      "type": "i64"
     },
     {
      "name": "open_interest_long_usd",
      "type": "u64"
     },
     {
      "name": "open_interest_short_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_profit_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_loss_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_swap_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_liquidity_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_close_position_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_liquidation_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_borrow_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_trading_volume_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "CustodyInfoSnapshotPda",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "assets_value_usd",
      "type": "u64"
     },
     {
      "name": "owned",
      "type": "u64"
     },
     {
      "name": "locked",
      "type": "u64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "trade_price",
      "type": "u64"
     },
     {
      "name": "short_pnl",
      "type": "i64"
     },
     {
      "name": "long_pnl",
      "type": "i64"
     },
     {
      "name": "open_interest_long_usd",
      "type": "u64"
     },
     {
      "name": "open_interest_short_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_profit_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_loss_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_swap_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_liquidity_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_close_position_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_liquidation_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_borrow_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_trading_volume_usd",
      "type": "u64"
     },
     {
      "name": "_padding1",
      "type": {
       "array": [
        "u64",
        4
       ]
      }
     }
    ]
   }
  },
  {
   "name": "DistributeFeesParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "EditUserProfileNicknameParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "nickname",
      "type": "string"
     }
    ]
   }
  },
  {
   "name": "EditUserProfileParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "profile_picture",
      "type": "u8"
     },
     {
      "name": "wallpaper",
      "type": "u8"
     },
     {
      "name": "title",
      "type": "u8"
     },
     {
      "name": "team",
      "type": {
       "option": "u8"
      }
     },
     {
      "name": "continent",
      "type": {
       "option": "u8"
      }
     }
    ]
   }
  },
  {
   "name": "ExecuteLimitOrderLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "id",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "ExecuteLimitOrderShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "id",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "ExitPriceAndFee",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "fee",
      "type": "u64"
     },
     {
      "name": "amount_out",
      "type": "u64"
     },
     {
      "name": "profit_usd",
      "type": "u64"
     },
     {
      "name": "loss_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "Fees",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "swap_in",
      "type": "u16"
     },
     {
      "name": "swap_out",
      "type": "u16"
     },
     {
      "name": "stable_swap_in",
      "type": "u16"
     },
     {
      "name": "stable_swap_out",
      "type": "u16"
     },
     {
      "name": "add_liquidity",
      "type": "u16"
     },
     {
      "name": "remove_liquidity",
      "type": "u16"
     },
     {
      "name": "close_position",
      "type": "u16"
     },
     {
      "name": "liquidation",
      "type": "u16"
     },
     {
      "name": "fee_max",
      "type": "u16"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        6
       ]
      }
     },
     {
      "name": "_padding2",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "FeesStats",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "swap_usd",
      "type": "u64"
     },
     {
      "name": "add_liquidity_usd",
      "type": "u64"
     },
     {
      "name": "remove_liquidity_usd",
      "type": "u64"
     },
     {
      "name": "close_position_usd",
      "type": "u64"
     },
     {
      "name": "liquidation_usd",
      "type": "u64"
     },
     {
      "name": "borrow_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "FinalizeLockedStakeEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "staking",
      "type": "pubkey"
     },
     {
      "name": "locked_stake_id",
      "type": "u64"
     },
     {
      "name": "early_exit",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "FinalizeLockedStakeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "locked_stake_id",
      "type": "u64"
     },
     {
      "name": "early_exit",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "GenesisLock",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "has_transitioned_to_fully_public",
      "type": "u8"
     },
     {
      "name": "has_completed_otc_in",
      "type": "u8"
     },
     {
      "name": "has_completed_otc_out",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        4
       ]
      }
     },
     {
      "name": "campaign_duration",
      "type": "i64"
     },
     {
      "name": "reserved_grant_duration",
      "type": "i64"
     },
     {
      "name": "campaign_start_date",
      "type": "i64"
     },
     {
      "name": "public_amount",
      "type": "u64"
     },
     {
      "name": "reserved_amount",
      "type": "u64"
     },
     {
      "name": "public_amount_claimed",
      "type": "u64"
     },
     {
      "name": "reserved_amount_claimed",
      "type": "u64"
     },
     {
      "name": "reserved_grant_owners",
      "type": {
       "array": [
        "pubkey",
        43
       ]
      }
     },
     {
      "name": "reserved_grant_amounts",
      "type": {
       "array": [
        "u64",
        43
       ]
      }
     },
     {
      "name": "_padding_unsafe",
      "type": {
       "array": [
        "u8",
        8
       ]
      }
     }
    ]
   }
  },
  {
   "name": "GenesisOtcInParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "custody_one_amount",
      "type": "u64"
     },
     {
      "name": "custody_two_amount",
      "type": "u64"
     },
     {
      "name": "custody_three_amount",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "GetAddLiquidityAmountAndFeeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount_in",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetAssetsUnderManagementParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetEntryPriceAndFeeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetExitPriceAndFeeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetLiquidationPriceParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "add_collateral",
      "type": "u64"
     },
     {
      "name": "remove_collateral",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetLiquidationStateParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetLpTokenPriceParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetOpenPositionWithSwapAmountAndFeesParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral_amount",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetPnlParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetPoolInfoSnapshotParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetRemoveLiquidityAmountAndFeeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "lp_amount_in",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GetSwapAmountAndFeesParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount_in",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "GrantOrRemoveAchievementParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "achievements",
      "type": "bytes"
     },
     {
      "name": "operation",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "IncreasePositionEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "position",
      "type": "pubkey"
     },
     {
      "name": "custody_mint",
      "type": "pubkey"
     },
     {
      "name": "custody_seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "size_usd",
      "type": "u64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral_amount_usd",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "IncreasePositionLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "IncreasePositionShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "InitOneParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "core_contributor_bucket_allocation",
      "type": "u64"
     },
     {
      "name": "foundation_bucket_allocation",
      "type": "u64"
     },
     {
      "name": "ecosystem_bucket_allocation",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "InitOracleParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "vec": {
        "defined": {
         "name": "OraclePricesSetup"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "InitStakingOneParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "staking_type",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "InitUserProfileParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "nickname",
      "type": "string"
     },
     {
      "name": "profile_picture",
      "type": "u8"
     },
     {
      "name": "wallpaper",
      "type": "u8"
     },
     {
      "name": "title",
      "type": "u8"
     },
     {
      "name": "team",
      "type": "u8"
     },
     {
      "name": "continent",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "LimitOrder",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "id",
      "type": "u64"
     },
     {
      "name": "trigger_price",
      "type": "u64"
     },
     {
      "name": "limit_price",
      "type": "u64"
     },
     {
      "name": "custody",
      "type": "pubkey"
     },
     {
      "name": "collateral_custody",
      "type": "pubkey"
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "initialized",
      "type": "u8"
     },
     {
      "name": "is_limit_price_set",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        5
       ]
      }
     },
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        4
       ]
      }
     }
    ]
   }
  },
  {
   "name": "LimitOrderBook",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "initialized",
      "type": "u8"
     },
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "registered_limit_order_count",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        5
       ]
      }
     },
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "limit_orders",
      "type": {
       "array": [
        {
         "defined": {
          "name": "LimitOrder"
         }
        },
        16
       ]
      }
     },
     {
      "name": "escrowed_lamports",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "LimitedString",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "value",
      "type": {
       "array": [
        "u8",
        31
       ]
      }
     },
     {
      "name": "length",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "LiquidStake",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "stake_time",
      "type": "i64"
     },
     {
      "name": "claim_time",
      "type": "i64"
     },
     {
      "name": "overlap_time",
      "type": "i64"
     },
     {
      "name": "overlap_amount",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "LiquidateEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "position",
      "type": "pubkey"
     },
     {
      "name": "custody_mint",
      "type": "pubkey"
     },
     {
      "name": "custody_seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "size_usd",
      "type": "u64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral_amount_usd",
      "type": "u64"
     },
     {
      "name": "loss_usd",
      "type": "u64"
     },
     {
      "name": "borrow_fee_usd",
      "type": "u64"
     },
     {
      "name": "exit_fee_usd",
      "type": "u64"
     },
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "funding_paid_usd",
      "type": "u64"
     },
     {
      "name": "funding_received_usd",
      "type": "u64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     },
     {
      "name": "confiscated_collateral_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "LiquidateLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "LiquidateShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "LockedStake",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "stake_time",
      "type": "i64"
     },
     {
      "name": "claim_time",
      "type": "i64"
     },
     {
      "name": "end_time",
      "type": "i64"
     },
     {
      "name": "lock_duration",
      "type": "u64"
     },
     {
      "name": "reward_multiplier",
      "type": "u32"
     },
     {
      "name": "lm_reward_multiplier",
      "type": "u32"
     },
     {
      "name": "vote_multiplier",
      "type": "u32"
     },
     {
      "name": "qualified_for_rewards_in_resolved_round_count",
      "type": "u32"
     },
     {
      "name": "amount_with_reward_multiplier",
      "type": "u64"
     },
     {
      "name": "amount_with_lm_reward_multiplier",
      "type": "u64"
     },
     {
      "name": "resolved",
      "type": "u8"
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        7
       ]
      }
     },
     {
      "name": "id",
      "type": "u64"
     },
     {
      "name": "early_exit",
      "type": "u8"
     },
     {
      "name": "_padding3",
      "type": {
       "array": [
        "u8",
        7
       ]
      }
     },
     {
      "name": "early_exit_fee",
      "type": "u64"
     },
     {
      "name": "is_genesis",
      "type": "u8"
     },
     {
      "name": "_padding4",
      "type": {
       "array": [
        "u8",
        7
       ]
      }
     },
     {
      "name": "genesis_claim_time",
      "type": "i64"
     }
    ]
   }
  },
  {
   "name": "MigrateBorrowRateParamsParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "optimal_utilization",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "MigratePoolV38ToV39Params",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "manager_fee_recipient",
      "type": "pubkey"
     }
    ]
   }
  },
  {
   "name": "MigratePositionV37ToV38Params",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "side",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "MigrateUserProfileFromV1ToV2Params",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "nickname",
      "type": "string"
     }
    ]
   }
  },
  {
   "name": "MintLmTokensFromBucketParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bucket_name",
      "type": "u8"
     },
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "reason",
      "type": "string"
     }
    ]
   }
  },
  {
   "name": "MintStakedLmTokensFromBucketParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bucket_name",
      "type": "u8"
     },
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "reason",
      "type": "string"
     },
     {
      "name": "locked_days",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "MultiBatchPrices",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "batches",
      "type": {
       "vec": {
        "defined": {
         "name": "BatchPricesWithProvider"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "MultiOracleConfig",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "providers",
      "type": {
       "array": [
        "u8",
        3
       ]
      }
     },
     {
      "name": "min_agree",
      "type": "u8"
     },
     {
      "name": "price_diff_threshold_bps",
      "type": "u16"
     },
     {
      "name": "staleness_seconds",
      "type": "u16"
     },
     {
      "name": "asymmetric_liquidation",
      "type": "u8"
     },
     {
      "name": "circuit_breaker_enabled",
      "type": "u8"
     },
     {
      "name": "circuit_breaker_seconds",
      "type": "u16"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        68
       ]
      }
     }
    ]
   }
  },
  {
   "name": "NewPositionPricesAndFee",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "entry_price",
      "type": "u64"
     },
     {
      "name": "liquidation_price",
      "type": "u64"
     },
     {
      "name": "exit_fee",
      "type": "u64"
     },
     {
      "name": "liquidation_fee",
      "type": "u64"
     },
     {
      "name": "size",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "NextStakingRound",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "total_stake",
      "type": "u64"
     },
     {
      "name": "_padding1",
      "type": {
       "array": [
        "u8",
        16
       ]
      }
     },
     {
      "name": "lm_total_stake",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "OpenOrIncreasePositionParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "OpenPositionEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "position",
      "type": "pubkey"
     },
     {
      "name": "custody_mint",
      "type": "pubkey"
     },
     {
      "name": "custody_seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "size_usd",
      "type": "u64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral_amount_usd",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "OpenPositionLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "OpenPositionShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "OpenPositionWithSwapAmountAndFees",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "entry_price",
      "type": "u64"
     },
     {
      "name": "liquidation_price",
      "type": "u64"
     },
     {
      "name": "swap_fee_in",
      "type": "u64"
     },
     {
      "name": "swap_fee_out",
      "type": "u64"
     },
     {
      "name": "exit_fee",
      "type": "u64"
     },
     {
      "name": "liquidation_fee",
      "type": "u64"
     },
     {
      "name": "size",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "OpenPositionWithSwapParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "collateral",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "Oracle",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "version",
      "type": "u8"
     },
     {
      "name": "registered_prices_count",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        5
       ]
      }
     },
     {
      "name": "updated_at",
      "type": "i64"
     },
     {
      "name": "prices",
      "type": {
       "array": [
        {
         "defined": {
          "name": "OraclePrice"
         }
        },
        50
       ]
      }
     }
    ]
   }
  },
  {
   "name": "OraclePrice",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "confidence",
      "type": "u64"
     },
     {
      "name": "timestamp",
      "type": "i64"
     },
     {
      "name": "exponent",
      "type": "i32"
     },
     {
      "name": "feed_id",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        3
       ]
      }
     },
     {
      "name": "name",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     }
    ]
   }
  },
  {
   "name": "OraclePricesSetup",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "name",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "feed_id",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "Pool",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "lp_token_bump",
      "type": "u8"
     },
     {
      "name": "nb_stable_custody",
      "type": "u8"
     },
     {
      "name": "initialized",
      "type": "u8"
     },
     {
      "name": "allow_trade",
      "type": "u8"
     },
     {
      "name": "allow_swap",
      "type": "u8"
     },
     {
      "name": "liquidity_state",
      "type": "u8"
     },
     {
      "name": "registered_custody_count",
      "type": "u8"
     },
     {
      "name": "name",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "custodies",
      "type": {
       "array": [
        "pubkey",
        8
       ]
      }
     },
     {
      "name": "fees_debt_usd",
      "type": "u64"
     },
     {
      "name": "referrers_fee_debt_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_referrer_fee_usd",
      "type": "u64"
     },
     {
      "name": "lp_token_price_usd",
      "type": "u64"
     },
     {
      "name": "whitelisted_swapper",
      "type": "pubkey"
     },
     {
      "name": "ratios",
      "type": {
       "array": [
        {
         "defined": {
          "name": "TokenRatios"
         }
        },
        8
       ]
      }
     },
     {
      "name": "last_aum_and_lp_token_price_usd_update",
      "type": "i64"
     },
     {
      "name": "unique_limit_order_id_counter",
      "type": "u64"
     },
     {
      "name": "aum_usd",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "inception_time",
      "type": "i64"
     },
     {
      "name": "aum_soft_cap_usd",
      "type": "u64"
     },
     {
      "name": "position_exit_fee_config",
      "type": {
       "defined": {
        "name": "PositionExitFeeConfig"
       }
      }
     },
     {
      "name": "last_lp_deposit_time",
      "type": "i64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     },
     {
      "name": "oracle_provider",
      "type": "u8"
     },
     {
      "name": "registered_synthetic_custody_count",
      "type": "u8"
     },
     {
      "name": "version",
      "type": "u8"
     },
     {
      "name": "_padding1",
      "type": {
       "array": [
        "u8",
        4
       ]
      }
     },
     {
      "name": "market_open_timestamp",
      "type": "i64"
     },
     {
      "name": "market_close_timestamp",
      "type": "i64"
     },
     {
      "name": "market_close_event_timestamp",
      "type": "i64"
     },
     {
      "name": "market_close_affected_feeds",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "lp_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "lm_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "referrer_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "protocol_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "manager_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        6
       ]
      }
     },
     {
      "name": "manager_fee_recipient",
      "type": "pubkey"
     },
     {
      "name": "manager_fee_debt_usd",
      "type": "u64"
     },
     {
      "name": "lm_fee_debt_usd",
      "type": "u64"
     },
     {
      "name": "protocol_fee_debt_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_protocol_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_lm_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_manager_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_lp_fee_usd",
      "type": "u64"
     },
     {
      "name": "multi_oracle_config",
      "type": {
       "defined": {
        "name": "MultiOracleConfig"
       }
      }
     },
     {
      "name": "synthetic_custodies",
      "type": {
       "array": [
        "pubkey",
        32
       ]
      }
     },
     {
      "name": "_reserved",
      "type": {
       "array": [
        "u8",
        704
       ]
      }
     }
    ]
   }
  },
  {
   "name": "PoolInfoSnapshot",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "current_time",
      "type": "u64"
     },
     {
      "name": "aum_usd",
      "type": "u64"
     },
     {
      "name": "lp_token_price",
      "type": "u64"
     },
     {
      "name": "custodies_info_snapshot",
      "type": {
       "vec": {
        "defined": {
         "name": "CustodyInfoSnapshot"
        }
       }
      }
     },
     {
      "name": "lp_circulating_supply",
      "type": "u64"
     },
     {
      "name": "cumulative_referrer_fee_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "PoolInfoSnapshotPda",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        7
       ]
      }
     },
     {
      "name": "current_time",
      "type": "i64"
     },
     {
      "name": "aum_usd",
      "type": "u64"
     },
     {
      "name": "lp_token_price",
      "type": "u64"
     },
     {
      "name": "custodies_info_snapshot",
      "type": {
       "array": [
        {
         "defined": {
          "name": "CustodyInfoSnapshotPda"
         }
        },
        8
       ]
      }
     },
     {
      "name": "synthetic_custodies_info_snapshot",
      "type": {
       "array": [
        {
         "defined": {
          "name": "SyntheticCustodyInfoSnapshotPda"
         }
        },
        32
       ]
      }
     },
     {
      "name": "lp_circulating_supply",
      "type": "u64"
     },
     {
      "name": "cumulative_referrer_fee_usd",
      "type": "u64"
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        120
       ]
      }
     }
    ]
   }
  },
  {
   "name": "Position",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "take_profit_is_set",
      "type": "u8"
     },
     {
      "name": "stop_loss_is_set",
      "type": "u8"
     },
     {
      "name": "_padding_unsafe",
      "type": {
       "array": [
        "u8",
        1
       ]
      }
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        3
       ]
      }
     },
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "pool",
      "type": "pubkey"
     },
     {
      "name": "custody",
      "type": "pubkey"
     },
     {
      "name": "collateral_custody",
      "type": "pubkey"
     },
     {
      "name": "open_time",
      "type": "i64"
     },
     {
      "name": "update_time",
      "type": "i64"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "size_usd",
      "type": "u64"
     },
     {
      "name": "borrow_size_usd",
      "type": "u64"
     },
     {
      "name": "collateral_usd",
      "type": "u64"
     },
     {
      "name": "unrealized_interest_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_interest_snapshot",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "locked_amount",
      "type": "u64"
     },
     {
      "name": "collateral_amount",
      "type": "u64"
     },
     {
      "name": "exit_fee_usd",
      "type": "u64"
     },
     {
      "name": "liquidation_fee_usd",
      "type": "u64"
     },
     {
      "name": "id",
      "type": "u64"
     },
     {
      "name": "take_profit_limit_price",
      "type": "u64"
     },
     {
      "name": "paid_interest_usd",
      "type": "u64"
     },
     {
      "name": "stop_loss_limit_price",
      "type": "u64"
     },
     {
      "name": "stop_loss_close_position_price",
      "type": "u64"
     },
     {
      "name": "cumulative_long_to_short_snapshot",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "cumulative_short_to_long_snapshot",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "unrealized_funding_paid_usd",
      "type": "u64"
     },
     {
      "name": "unrealized_funding_received_usd",
      "type": "u64"
     },
     {
      "name": "_reserved",
      "type": {
       "array": [
        {
         "array": [
          "u8",
          32
         ]
        },
        4
       ]
      }
     }
    ]
   }
  },
  {
   "name": "PositionExitFeeConfig",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "enabled",
      "type": "u8"
     },
     {
      "name": "_padding0",
      "type": {
       "array": [
        "u8",
        7
       ]
      }
     },
     {
      "name": "min_position_open_time_seconds",
      "type": "u64"
     },
     {
      "name": "min_position_update_time_before_close_seconds",
      "type": "u64"
     },
     {
      "name": "age_tier_1_seconds",
      "type": "u64"
     },
     {
      "name": "age_tier_2_seconds",
      "type": "u64"
     },
     {
      "name": "age_tier_3_seconds",
      "type": "u64"
     },
     {
      "name": "multiplier_tier_1_bps",
      "type": "u32"
     },
     {
      "name": "multiplier_tier_2_bps",
      "type": "u32"
     },
     {
      "name": "multiplier_tier_3_bps",
      "type": "u32"
     },
     {
      "name": "multiplier_after_tier_3_bps",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "PositionsAccounting",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "open_positions",
      "type": "u64"
     },
     {
      "name": "size_usd",
      "type": "u64"
     },
     {
      "name": "borrow_size_usd",
      "type": "u64"
     },
     {
      "name": "locked_amount",
      "type": "u64"
     },
     {
      "name": "weighted_price",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "total_quantity",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "cumulative_funding_paid_usd",
      "type": "u64"
     },
     {
      "name": "collateral_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_interest_snapshot",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "exit_fee_usd",
      "type": "u64"
     },
     {
      "name": "stable_locked_amount",
      "type": {
       "array": [
        {
         "defined": {
          "name": "StableLockedAmountStat"
         }
        },
        1
       ]
      }
     },
     {
      "name": "prepaid_interest_usd",
      "type": "u64"
     },
     {
      "name": "tmp_offset_end_ts",
      "type": "u64"
     },
     {
      "name": "tmp_offset",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "unrealized_interest_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_funding_received_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "PriceData",
   "docs": [
    "Individual price data within a batch."
   ],
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "feed_id",
      "type": "u8"
     },
     {
      "name": "price",
      "type": "u64"
     },
     {
      "name": "timestamp",
      "type": "i64"
     }
    ]
   }
  },
  {
   "name": "PricingParams",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "max_initial_leverage",
      "type": "u32"
     },
     {
      "name": "max_leverage",
      "type": "u32"
     },
     {
      "name": "max_position_locked_usd",
      "type": "u64"
     },
     {
      "name": "max_cumulative_short_position_size_usd",
      "type": "u64"
     },
     {
      "name": "max_cumulative_long_position_size_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "ProfitAndLoss",
   "docs": [
    "Specific to the codebase, this struct is used to store the profit and loss of a position."
   ],
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "profit_usd",
      "type": "u64"
     },
     {
      "name": "loss_usd",
      "type": "u64"
     },
     {
      "name": "exit_fee",
      "type": "u64"
     },
     {
      "name": "exit_fee_usd",
      "type": "u64"
     },
     {
      "name": "borrow_fee_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "ProposeAdminParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "new_admin",
      "type": "pubkey"
     }
    ]
   }
  },
  {
   "name": "RegisterOracleFeedParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "provider",
      "docs": [
       "`OracleProvider as u8`. Must agree with `feed_id`'s range."
      ],
      "type": "u8"
     },
     {
      "name": "feed_id",
      "docs": [
       "Global feed id. Must lie within `provider.feed_id_range()`."
      ],
      "type": "u8"
     },
     {
      "name": "name",
      "docs": [
       "Human-readable feed name used by `custody.oracle` / `custody.trade_oracle`",
       "lookups (e.g. \"BTCUSD\"). Must be non-default."
      ],
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     }
    ]
   }
  },
  {
   "name": "RemoveCollateralEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "position",
      "type": "pubkey"
     },
     {
      "name": "custody_mint",
      "type": "pubkey"
     },
     {
      "name": "custody_seed",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     },
     {
      "name": "side",
      "type": "u8"
     },
     {
      "name": "remove_amount_usd",
      "type": "u64"
     },
     {
      "name": "new_collateral_amount_usd",
      "type": "u64"
     },
     {
      "name": "leverage",
      "type": "u32"
     },
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "pool_type",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "RemoveCollateralLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral_usd",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "RemoveCollateralShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "collateral_usd",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "RemoveCustodyParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "ratios",
      "type": {
       "array": [
        {
         "defined": {
          "name": "TokenRatios"
         }
        },
        8
       ]
      }
     }
    ]
   }
  },
  {
   "name": "RemoveLiquidStakeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "RemoveLiquidityParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "lp_amount_in",
      "type": "u64"
     },
     {
      "name": "min_amount_out",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "RemoveLockedStakeEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "staking",
      "type": "pubkey"
     },
     {
      "name": "locked_stake_id",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "RemoveLockedStakeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "locked_stake_index",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "ReservedSpots",
   "type": {
    "kind": "enum",
    "variants": [
     {
      "name": "None"
     }
    ]
   }
  },
  {
   "name": "ResolvePositionBorrowFeesParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "SetAdminParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "new_admin",
      "type": "pubkey"
     }
    ]
   }
  },
  {
   "name": "SetAllPoolsFeeSharesParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "lp_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "lm_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "referrer_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "protocol_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "manager_fee_share_bps",
      "type": "u16"
     }
    ]
   }
  },
  {
   "name": "SetConfidenceBandBpsParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "band_bps",
      "type": "u16"
     }
    ]
   }
  },
  {
   "name": "SetCustodyAllowSwapParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "allow_swap",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "SetCustodyAllowTradeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "allow_trade",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "SetCustodyConfigParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "is_stable",
      "type": "bool"
     },
     {
      "name": "oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "trade_oracle",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "pricing",
      "type": {
       "defined": {
        "name": "PricingParams"
       }
      }
     },
     {
      "name": "fees",
      "type": {
       "defined": {
        "name": "Fees"
       }
      }
     },
     {
      "name": "borrow_rate",
      "type": {
       "defined": {
        "name": "BorrowRateParams"
       }
      }
     },
     {
      "name": "virtual_funding",
      "type": {
       "defined": {
        "name": "VirtualFundingParams"
       }
      }
     },
     {
      "name": "ratios",
      "type": {
       "array": [
        {
         "defined": {
          "name": "TokenRatios"
         }
        },
        8
       ]
      }
     }
    ]
   }
  },
  {
   "name": "SetCustodyMaxCumulativeLongPositionSizeUsdParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "max_cumulative_long_position_size_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SetCustodyMaxCumulativeShortPositionSizeUsdParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "max_cumulative_short_position_size_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SetCustodyTradeHaltParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "trade_halt",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "SetCustodyVirtualFundingParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "virtual_funding",
      "type": {
       "defined": {
        "name": "VirtualFundingParams"
       }
      }
     }
    ]
   }
  },
  {
   "name": "SetPoolAllowSwapParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "allow_swap",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "SetPoolAllowTradeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "allow_trade",
      "type": "bool"
     }
    ]
   }
  },
  {
   "name": "SetPoolAumSoftCapUsdParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "aum_soft_cap_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SetPoolFeeConfigParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "pool_type",
      "type": "u8"
     },
     {
      "name": "oracle_provider",
      "type": "u8"
     },
     {
      "name": "lp_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "lm_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "referrer_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "protocol_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "manager_fee_share_bps",
      "type": "u16"
     },
     {
      "name": "manager_fee_recipient",
      "type": "pubkey"
     }
    ]
   }
  },
  {
   "name": "SetPoolLiquidityStateParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "liquidity_state",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "SetPoolOracleConfigParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_provider",
      "type": "u8"
     },
     {
      "name": "multi_oracle_config",
      "type": {
       "defined": {
        "name": "MultiOracleConfig"
       }
      }
     }
    ]
   }
  },
  {
   "name": "SetPoolPositionExitFeeConfigParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "enabled",
      "type": "bool"
     },
     {
      "name": "min_position_open_time_seconds",
      "type": "u64"
     },
     {
      "name": "min_position_update_time_before_close_seconds",
      "type": "u64"
     },
     {
      "name": "age_tier_1_seconds",
      "type": "u64"
     },
     {
      "name": "age_tier_2_seconds",
      "type": "u64"
     },
     {
      "name": "age_tier_3_seconds",
      "type": "u64"
     },
     {
      "name": "multiplier_tier_1_bps",
      "type": "u32"
     },
     {
      "name": "multiplier_tier_2_bps",
      "type": "u32"
     },
     {
      "name": "multiplier_tier_3_bps",
      "type": "u32"
     },
     {
      "name": "multiplier_after_tier_3_bps",
      "type": "u32"
     }
    ]
   }
  },
  {
   "name": "SetStakingLmEmissionPotentiometersParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "lm_emission_potentiometer_bps",
      "type": "u16"
     }
    ]
   }
  },
  {
   "name": "SetStopLossEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "stop_loss_limit_price",
      "type": "u64"
     },
     {
      "name": "close_position_price",
      "type": {
       "option": "u64"
      }
     },
     {
      "name": "position_side",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "SetStopLossLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "stop_loss_limit_price",
      "type": "u64"
     },
     {
      "name": "close_position_price",
      "type": {
       "option": "u64"
      }
     }
    ]
   }
  },
  {
   "name": "SetStopLossShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "stop_loss_limit_price",
      "type": "u64"
     },
     {
      "name": "close_position_price",
      "type": {
       "option": "u64"
      }
     }
    ]
   }
  },
  {
   "name": "SetTakeProfitEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "position_id",
      "type": "u64"
     },
     {
      "name": "take_profit_limit_price",
      "type": "u64"
     },
     {
      "name": "position_side",
      "type": "u8"
     }
    ]
   }
  },
  {
   "name": "SetTakeProfitLongParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "take_profit_limit_price",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SetTakeProfitShortParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "take_profit_limit_price",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SetVestDelegateParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "delegate",
      "type": {
       "option": "pubkey"
      }
     }
    ]
   }
  },
  {
   "name": "StableLockedAmountStat",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "custody",
      "type": "pubkey"
     },
     {
      "name": "locked_amount",
      "type": "u64"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        8
       ]
      }
     }
    ]
   }
  },
  {
   "name": "Staking",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "staking_type",
      "type": "u8"
     },
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "staked_token_vault_bump",
      "type": "u8"
     },
     {
      "name": "reward_token_vault_bump",
      "type": "u8"
     },
     {
      "name": "lm_reward_token_vault_bump",
      "type": "u8"
     },
     {
      "name": "reward_token_decimals",
      "type": "u8"
     },
     {
      "name": "staked_token_decimals",
      "type": "u8"
     },
     {
      "name": "initialized",
      "type": "u8"
     },
     {
      "name": "nb_locked_tokens",
      "type": "u64"
     },
     {
      "name": "nb_liquid_tokens",
      "type": "u64"
     },
     {
      "name": "staked_token_mint",
      "type": "pubkey"
     },
     {
      "name": "resolved_reward_token_amount",
      "type": "u64"
     },
     {
      "name": "resolved_staked_token_amount",
      "type": "u64"
     },
     {
      "name": "resolved_lm_reward_token_amount",
      "type": "u64"
     },
     {
      "name": "resolved_lm_staked_token_amount",
      "type": "u64"
     },
     {
      "name": "current_staking_round",
      "type": {
       "defined": {
        "name": "StakingRound"
       }
      }
     },
     {
      "name": "current_staking_round_liquid_rewards_usd",
      "type": "u64"
     },
     {
      "name": "_padding1",
      "type": {
       "array": [
        "u8",
        16
       ]
      }
     },
     {
      "name": "next_staking_round",
      "type": {
       "defined": {
        "name": "NextStakingRound"
       }
      }
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        8
       ]
      }
     },
     {
      "name": "resolved_staking_rounds",
      "type": {
       "array": [
        {
         "defined": {
          "name": "StakingRound"
         }
        },
        32
       ]
      }
     },
     {
      "name": "registered_resolved_staking_round_count",
      "type": "u8"
     },
     {
      "name": "_padding3",
      "type": {
       "array": [
        "u8",
        3
       ]
      }
     },
     {
      "name": "lm_emission_potentiometer_bps",
      "type": "u16"
     },
     {
      "name": "months_elapsed_since_inception",
      "type": "u16"
     },
     {
      "name": "_padding_unsafe",
      "type": {
       "array": [
        "u8",
        8
       ]
      }
     },
     {
      "name": "emission_amount_per_round_last_update",
      "type": "i64"
     },
     {
      "name": "current_month_emission_amount_per_round",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "StakingRound",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "start_time",
      "type": "i64"
     },
     {
      "name": "end_time",
      "type": "i64"
     },
     {
      "name": "rate",
      "type": "u64"
     },
     {
      "name": "total_stake",
      "type": "u64"
     },
     {
      "name": "total_claim",
      "type": "u64"
     },
     {
      "name": "lm_rate",
      "type": "u64"
     },
     {
      "name": "lm_total_stake",
      "type": "u64"
     },
     {
      "name": "lm_total_claim",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SwapAmountAndFees",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount_out",
      "type": "u64"
     },
     {
      "name": "fee_in",
      "type": "u64"
     },
     {
      "name": "fee_out",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "SwapParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "amount_in",
      "type": "u64"
     },
     {
      "name": "min_amount_out",
      "type": "u64"
     },
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "SwitchboardFeedMapEntry",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "adrena_feed_id",
      "type": "u8"
     },
     {
      "name": "switchboard_feed_hash",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     }
    ]
   }
  },
  {
   "name": "SwitchboardUpdateParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "max_age_slots",
      "type": "u64"
     },
     {
      "name": "feed_map",
      "type": {
       "vec": {
        "defined": {
         "name": "SwitchboardFeedMapEntry"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "SyntheticCustodyInfoSnapshotPda",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "trade_price",
      "type": "u64"
     },
     {
      "name": "short_pnl",
      "type": "i64"
     },
     {
      "name": "long_pnl",
      "type": "i64"
     },
     {
      "name": "open_interest_long_usd",
      "type": "u64"
     },
     {
      "name": "open_interest_short_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_profit_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_loss_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_swap_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_liquidity_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_close_position_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_liquidation_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_borrow_fee_usd",
      "type": "u64"
     },
     {
      "name": "cumulative_trading_volume_usd",
      "type": "u64"
     },
     {
      "name": "_padding1",
      "type": {
       "array": [
        "u64",
        4
       ]
      }
     }
    ]
   }
  },
  {
   "name": "TokenRatios",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "target",
      "type": "u16"
     },
     {
      "name": "min",
      "type": "u16"
     },
     {
      "name": "max",
      "type": "u16"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        2
       ]
      }
     }
    ]
   }
  },
  {
   "name": "TradeStats",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "profit_usd",
      "type": "u64"
     },
     {
      "name": "loss_usd",
      "type": "u64"
     },
     {
      "name": "oi_long_usd",
      "type": "u64"
     },
     {
      "name": "oi_short_usd",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "U128Split",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "high",
      "type": "u64"
     },
     {
      "name": "low",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "UpdateOracleParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     },
     {
      "name": "switchboard_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "SwitchboardUpdateParams"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "UpdatePoolAumParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "BatchPrices"
        }
       }
      }
     },
     {
      "name": "multi_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "MultiBatchPrices"
        }
       }
      }
     },
     {
      "name": "switchboard_oracle_prices",
      "type": {
       "option": {
        "defined": {
         "name": "SwitchboardUpdateParams"
        }
       }
      }
     }
    ]
   }
  },
  {
   "name": "UpgradeLockedStakeEvent",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "staking",
      "type": "pubkey"
     },
     {
      "name": "locked_stake_id",
      "type": "u64"
     },
     {
      "name": "amount",
      "type": {
       "option": "u64"
      }
     },
     {
      "name": "locked_days",
      "type": {
       "option": "u32"
      }
     }
    ]
   }
  },
  {
   "name": "UpgradeLockedStakeParams",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "locked_stake_id",
      "type": "u64"
     },
     {
      "name": "amount",
      "type": {
       "option": "u64"
      }
     },
     {
      "name": "locked_days",
      "type": {
       "option": "u32"
      }
     }
    ]
   }
  },
  {
   "name": "UserProfile",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "version",
      "type": "u8"
     },
     {
      "name": "profile_picture",
      "type": "u8"
     },
     {
      "name": "wallpaper",
      "type": "u8"
     },
     {
      "name": "title",
      "type": "u8"
     },
     {
      "name": "team",
      "type": "u8"
     },
     {
      "name": "continent",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": "u8"
     },
     {
      "name": "nickname",
      "type": {
       "defined": {
        "name": "LimitedString"
       }
      }
     },
     {
      "name": "created_at",
      "type": "i64"
     },
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "achievements",
      "type": {
       "array": [
        "u8",
        256
       ]
      }
     },
     {
      "name": "referrer_profile",
      "type": "pubkey"
     },
     {
      "name": "claimable_referral_fee_usd",
      "type": "u64"
     },
     {
      "name": "total_referral_fee_usd",
      "type": "u64"
     },
     {
      "name": "rolling_trade_window_start",
      "type": "i64"
     },
     {
      "name": "trades_in_window",
      "type": "u16"
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        6
       ]
      }
     }
    ]
   }
  },
  {
   "name": "UserStaking",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "_unused_unsafe",
      "type": {
       "array": [
        "u8",
        1
       ]
      }
     },
     {
      "name": "staking_type",
      "type": "u8"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        5
       ]
      }
     },
     {
      "name": "locked_stake_id_counter",
      "type": "u64"
     },
     {
      "name": "liquid_stake",
      "type": {
       "defined": {
        "name": "LiquidStake"
       }
      }
     },
     {
      "name": "locked_stakes",
      "type": {
       "array": [
        {
         "defined": {
          "name": "LockedStake"
         }
        },
        32
       ]
      }
     }
    ]
   }
  },
  {
   "name": "Vest",
   "serialization": "bytemuck",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "origin_bucket",
      "type": "u8"
     },
     {
      "name": "cancelled",
      "type": "u8"
     },
     {
      "name": "version",
      "type": "u8"
     },
     {
      "name": "vote_multiplier",
      "type": "u32"
     },
     {
      "name": "amount",
      "type": "u64"
     },
     {
      "name": "unlock_start_timestamp",
      "type": "i64"
     },
     {
      "name": "unlock_end_timestamp",
      "type": "i64"
     },
     {
      "name": "claimed_amount",
      "type": "u64"
     },
     {
      "name": "last_claim_timestamp",
      "type": "i64"
     },
     {
      "name": "owner",
      "type": "pubkey"
     },
     {
      "name": "delegate",
      "type": "pubkey"
     },
     {
      "name": "has_delegate",
      "type": "u8"
     },
     {
      "name": "_padding2",
      "type": {
       "array": [
        "u8",
        7
       ]
      }
     },
     {
      "name": "_padding3",
      "type": {
       "array": [
        "u8",
        32
       ]
      }
     }
    ]
   }
  },
  {
   "name": "VestRegistry",
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "bump",
      "type": "u8"
     },
     {
      "name": "vests",
      "type": {
       "vec": "pubkey"
      }
     },
     {
      "name": "vesting_token_amount",
      "type": "u64"
     },
     {
      "name": "vested_token_amount",
      "type": "u64"
     }
    ]
   }
  },
  {
   "name": "VirtualFundingParams",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "max_hourly_funding_rate",
      "type": "u64"
     },
     {
      "name": "min_total_oi_usd",
      "type": "u64"
     },
     {
      "name": "imbalance_sensitivity_bps",
      "type": "u16"
     },
     {
      "name": "_padding",
      "type": {
       "array": [
        "u8",
        6
       ]
      }
     }
    ]
   }
  },
  {
   "name": "VirtualFundingState",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "current_rate_long_to_short",
      "type": "i64"
     },
     {
      "name": "last_update",
      "type": "i64"
     },
     {
      "name": "cumulative_long_to_short",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     },
     {
      "name": "cumulative_short_to_long",
      "type": {
       "defined": {
        "name": "U128Split"
       }
      }
     }
    ]
   }
  },
  {
   "name": "VolumeStats",
   "repr": {
    "kind": "c"
   },
   "type": {
    "kind": "struct",
    "fields": [
     {
      "name": "swap_usd",
      "type": "u64"
     },
     {
      "name": "add_liquidity_usd",
      "type": "u64"
     },
     {
      "name": "remove_liquidity_usd",
      "type": "u64"
     },
     {
      "name": "open_position_usd",
      "type": "u64"
     },
     {
      "name": "close_position_usd",
      "type": "u64"
     },
     {
      "name": "liquidation_usd",
      "type": "u64"
     }
    ]
   }
  }
 ]
} as const;
