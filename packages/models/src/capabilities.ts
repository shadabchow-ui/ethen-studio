import { GatewayError } from "./gateway/errors";
import type { GatewayChatRequest, GatewayProviderId } from "./gateway/types";
export interface AdapterCapabilities { tools: boolean; json: boolean; schema: boolean; vision: boolean }
export const ADAPTER_CAPABILITIES: Readonly<Record<GatewayProviderId, AdapterCapabilities>> = {
  mock: { tools:false,json:false,schema:false,vision:false },
  openai: { tools:true,json:true,schema:true,vision:true },
  anthropic: { tools:true,json:true,schema:true,vision:true },
  deepseek: { tools:true,json:true,schema:false,vision:false },
  // Endpoint/model capabilities are unknown until explicitly configured and certified.
  "openai-compatible": { tools:true,json:true,schema:true,vision:true },
  "vercel-ai-gateway": { tools:true,json:true,schema:true,vision:true },
};
export function needsContractV2(r: GatewayChatRequest): boolean {
  return Boolean(r.tools?.length || r.toolChoice || r.responseFormat?.type && r.responseFormat.type !== "text" || r.messages.some(m => typeof m.content !== "string" || m.role === "tool" || m.toolCalls?.length));
}
export function canExecute(provider: GatewayProviderId, request: GatewayChatRequest): boolean {
  const c = ADAPTER_CAPABILITIES[provider];
  if ((request.tools?.length || request.toolChoice || request.messages.some(m => m.role === "tool" || m.toolCalls?.length)) && !c.tools) return false;
  if (request.responseFormat?.type === "json_object" && !c.json) return false;
  if (request.responseFormat?.type === "json_schema" && !c.schema) return false;
  if (request.messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === "image")) && !c.vision) return false;
  return true;
}
export function assertExecutable(provider: GatewayProviderId, request: GatewayChatRequest): void {
  if (!canExecute(provider, request)) throw new GatewayError({ code:"capability_not_executable", message:"Selected adapter cannot execute the requested capability.", status:422 });
}
