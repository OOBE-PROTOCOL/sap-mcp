import {
  createPluginToolModule,
  registerToolFamilyPipelineTool,
  type ToolModuleDefinition,
} from '@oobe-protocol-labs/sap-mcp-server/tools';

export const acmePriceFeedModule: ToolModuleDefinition = createPluginToolModule({
  id: 'acme-price-feed',
  title: 'ACME Price Feed',
  description: 'Registers ACME market data tools for SAP MCP agent workflows.',
  category: 'integration',
  order: 5_000,
  expectedTools: ['acme_price_feed'],
  when: (context) => context.config.mode !== 'hosted-api',
  lifecycle: {
    beforeRegister: ({ module }) => {
      console.info(`[sap-mcp-plugin] registering ${module.id}`);
    },
    afterRegister: ({ module, addedCount }) => {
      console.info(`[sap-mcp-plugin] registered ${module.id} (${addedCount ?? 0} tools)`);
    },
    onRegisterError: ({ module, error }) => {
      console.error(`[sap-mcp-plugin] failed ${module.id}`, error);
    },
  },
  register: (server, context) => {
    registerToolFamilyPipelineTool(
      server,
      context,
      'acme_price_feed',
      {
        title: 'ACME Price Feed',
        description: 'Returns the current ACME price feed status.',
        inputSchema: {},
      },
      async () => ({
        status: 'template-ready',
        providerReady: false,
      }),
    );
  },
}, {
  namespace: 'acme',
  packageName: '@acme/sap-mcp-tools',
  version: '1.0.0',
});

export const toolModules = [
  acmePriceFeedModule,
] as const;
