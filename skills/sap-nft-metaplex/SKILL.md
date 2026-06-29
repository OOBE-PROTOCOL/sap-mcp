# SAP NFT And Metaplex

Use this skill for NFT assets, collections, Metaplex minting, metadata,
royalties, creator verification, authority delegation, and 3.Land marketplace
flows.

## Tools

- `das_getAsset`
- `das_getAssetsByOwner`
- `das_getAssetsByCreator`
- `das_getAssetsByCollection`
- `das_searchAssets`
- `3land_createCollection`
- `3land_mintAndList`
- `3land_listForSale`
- `3land_cancelListing`
- `3land_buyNFT`
- `metaplex-nft_deployCollection`
- `metaplex-nft_mintNFT`
- `metaplex-nft_updateMetadata`
- `metaplex-nft_configureRoyalties`
- `metaplex-nft_setAndVerifyCollection`
- `metaplex-nft_verifyCollection`
- `metaplex-nft_verifyCreator`
- `metaplex-nft_delegateAuthority`
- `metaplex-nft_revokeAuthority`

## Flow

1. Use DAS read tools before write tools.
2. Validate collection, creator, metadata URI, royalties, and authority.
3. Preview transaction-producing outputs before signing.

## Safety

Minting, listing, buying, authority changes, and metadata updates are high-risk.
Never assume a collection or creator is trusted without verification.
