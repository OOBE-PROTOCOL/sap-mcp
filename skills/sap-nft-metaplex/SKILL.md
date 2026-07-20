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

## SAP Bridged Identity

When the user wants an SAP agent picture, NFT-backed identity, MPL Core asset,
or Metaplex-linked profile:

1. Publish the image and metadata to a public URI. Desktop file paths are never
   valid on-chain metadata.
2. If creating a Metaplex NFT/MPL Core identity asset, mint or update that asset
   with the same public metadata and keep the owner/authority clear.
3. Register or update the SAP agent with `metadataUri`/`agentUri` pointing to
   the public metadata document or profile page.
4. In the metadata JSON, include a `metaplex` object with the asset or
   collection address when available.
5. Hosted users must use local `sap_payments_register_agent` or
   `sap_payments_update_agent` for SAP registry writes. Do not call hosted
   `sap_register_agent` or hosted `sap_update_agent` after
   `hosted_local_signer_required`.

Load `sap-agent-registry` together with this skill when the user says “register
my agent”, “add my picture”, “link my NFT identity”, or “bridge SAP with
Metaplex”.

## Safety

Minting, listing, buying, authority changes, and metadata updates are high-risk.
Never assume a collection or creator is trusted without verification.
