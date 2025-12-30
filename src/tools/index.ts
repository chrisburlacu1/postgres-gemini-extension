import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerQueryTools } from './query.js';
import { registerSchemaTools } from './schema.js';
import { registerAnalysisTools } from './analysis.js';
import { registerConnectionTools } from './connection.js';

export function registerAllTools(server: McpServer) {
  registerQueryTools(server);
  registerSchemaTools(server);
  registerAnalysisTools(server);
  registerConnectionTools(server);
}
