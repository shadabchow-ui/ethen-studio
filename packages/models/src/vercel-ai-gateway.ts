import "server-only";
import { getProviderApiKey } from "./gateway/env";
import { GatewayError } from "./gateway/errors";
import type { ProviderAdapter } from "./types";
import { streamContractV2 } from "./contract-v2";
export const vercelAIGatewayAdapter: ProviderAdapter = {
  providerId:"vercel-ai-gateway", label:"Vercel AI Gateway",
  getAvailability() {
    return process.env.ETHEN_VERCEL_AI_GATEWAY_ENABLED === "true" && getProviderApiKey("vercel-ai-gateway")
      ? {available:true} : {available:false,reason:"Vercel AI Gateway requires explicit enablement and a server API key."};
  },
  async streamChat({request,route,apiKeyOverride,signal}) {
    const key = apiKeyOverride ?? getProviderApiKey("vercel-ai-gateway");
    const model = route.selectedModelAlias ?? request.selectedModelId;
    if (process.env.ETHEN_VERCEL_AI_GATEWAY_ENABLED !== "true" || !key || !model) throw new GatewayError({code:"provider_not_configured",status:503,message:"Vercel AI Gateway requires enablement, credentials and an explicit model."});
    return streamContractV2({provider:"vercel-ai-gateway",request,model,apiKey:key,signal,url:"https://ai-gateway.vercel.sh/v1/chat/completions"});
  },
};
