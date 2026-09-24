import "server-only";
import Ajv from "ajv";
import { GatewayError } from "./gateway/errors";
import { gatewayContentText, type GatewayChatRequest, type GatewayProviderId, type GatewayStreamResult, type GatewayToolCall } from "./gateway/types";
import { applyAnthropicUsage, applyOpenAICompatibleUsage, createMutableGatewayUsage } from "./shared";
import { assertExecutable } from "./capabilities";
const fail = (code: string, status = 400): never => { throw new GatewayError({code, status, message: code}); };
const STRUCTURED_TOOL = "__ethen_structured_output";
const ajv = new Ajv({ strict:true, allErrors:false, validateFormats:false });
function schemaValidator(schema: Record<string, unknown>) {
  if (JSON.stringify(schema).length > 32768) fail("schema_too_large");
  // Untrusted schemas cannot introduce regex execution or recursive references.
  // Bound branching/depth as well as encoded size before invoking the compiler.
  let nodes = 0;
  const inspect = (value: unknown, depth: number) => {
    if (++nodes > 512 || depth > 12) fail("schema_complexity_limit");
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (["$ref", "$dynamicRef", "$recursiveRef", "pattern", "patternProperties"].includes(key)) fail("schema_keyword_unsupported");
        inspect(child, depth + 1);
      }
    }
  };
  inspect(schema, 0);
  try { const validator = ajv.compile(schema); ajv.removeSchema(schema); return validator; } catch { return fail("invalid_json_schema"); }
}
function validate(request: GatewayChatRequest) {
  if (JSON.stringify(request.messages).length > 8*1024*1024) fail("input_too_large",413);
  if ((request.tools?.length ?? 0) > 32) fail("too_many_tools");
  const names = new Set<string>();
  for (const tool of request.tools ?? []) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(tool.name) || tool.name === STRUCTURED_TOOL || names.has(tool.name)) fail("invalid_tool");
    names.add(tool.name); schemaValidator(tool.parameters);
  }
  if (typeof request.toolChoice === "object" && !names.has(request.toolChoice.name)) fail("unknown_tool_choice");
  if (request.toolChoice === "required" && names.size === 0) fail("tools_required");
  for (const message of request.messages) {
    if (message.role === "tool" && (!message.toolCallId || typeof message.content !== "string")) fail("invalid_tool_result");
    for (const part of typeof message.content === "string" ? [] : message.content) {
      if (part.type === "image" && (message.role !== "user" || !["image/png","image/jpeg","image/webp"].includes(part.mediaType) || part.data.length > 6*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(part.data))) fail("invalid_image_input",413);
    }
  }
}
export function contractV2Body(request: GatewayChatRequest, model: string, anthropic: boolean): Record<string, unknown> {
  validate(request);
  const format = request.responseFormat;
  if (format?.type === "json_schema") schemaValidator(format.schema);
  if (anthropic) {
    if (format && format.type !== "text" && (request.tools?.length || request.toolChoice)) fail("structured_output_tool_conflict");
    const messages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.role === "tool" ? [{type:"tool_result", tool_use_id:m.toolCallId, content:m.content}] : [
        ...(typeof m.content === "string" ? (m.content ? [{type:"text",text:m.content}] : []) : m.content.map(p => p.type === "text" ? p : {type:"image",source:{type:"base64",media_type:p.mediaType,data:p.data}})),
        ...(m.toolCalls ?? []).map(t => ({type:"tool_use",id:t.id,name:t.name,input:JSON.parse(t.arguments)})),
      ],
    }));
    const body: Record<string, unknown> = {model,max_tokens:request.maxOutputTokens ?? 2048,stream:true,messages,
      system:request.messages.filter(m => m.role === "system").map(m => gatewayContentText(m.content)).join("\n")};
    if (request.tools?.length) body.tools = request.tools.map(t => ({name:t.name,description:t.description,input_schema:t.parameters}));
    if (request.toolChoice) body.tool_choice = typeof request.toolChoice === "object" ? {type:"tool",name:request.toolChoice.name} : {type: request.toolChoice === "required" ? "any" : request.toolChoice};
    if (format && format.type !== "text") {
      body.tools = [{name:STRUCTURED_TOOL,description:"Return the structured answer",input_schema:format.type === "json_schema" ? format.schema : {type:"object"}}];
      body.tool_choice = {type:"tool",name:STRUCTURED_TOOL};
    }
    return body;
  }
  const body: Record<string, unknown> = {model,max_tokens:request.maxOutputTokens ?? 2048,stream:true,stream_options:{include_usage:true},
    messages:request.messages.map(m => ({ role:m.role, content:typeof m.content === "string" ? m.content : m.content.map(p => p.type === "text" ? p : {type:"image_url",image_url:{url:`data:${p.mediaType};base64,${p.data}`}}),
      ...(m.toolCallId ? {tool_call_id:m.toolCallId} : {}), ...(m.toolCalls?.length ? {tool_calls:m.toolCalls.map(t => ({id:t.id,type:"function",function:{name:t.name,arguments:t.arguments}}))} : {}) }))};
  if (request.tools?.length) body.tools = request.tools.map(t => ({type:"function",function:{name:t.name,description:t.description,parameters:t.parameters}}));
  if (request.toolChoice) body.tool_choice = typeof request.toolChoice === "object" ? {type:"function",function:{name:request.toolChoice.name}} : request.toolChoice;
  if (format) body.response_format = format.type === "json_schema" ? {type:"json_schema",json_schema:{name:format.name,schema:format.schema,strict:true}} : format;
  return body;
}

export async function streamContractV2(input: {provider:GatewayProviderId; request:GatewayChatRequest; model:string; url:string; apiKey:string; signal?:AbortSignal}): Promise<GatewayStreamResult> {
  const {provider,request} = input; assertExecutable(provider, request);
  const anthropic = provider === "anthropic";
  const body = contractV2Body(request,input.model,anthropic);
  let response: Response;
  const timeout = AbortSignal.timeout(60000);
  const signal = input.signal ? AbortSignal.any([input.signal,timeout]) : timeout;
  try { response = await fetch(input.url, {method:"POST",redirect:"error",signal,headers:anthropic ? {"content-type":"application/json","x-api-key":input.apiKey,"anthropic-version":"2023-06-01"} : {"content-type":"application/json", ...(input.apiKey ? {Authorization:`Bearer ${input.apiKey}`} : {})},body:JSON.stringify(body)}); }
  catch { return fail("provider_unavailable",503); }
  if (!response.ok || !response.body) return fail("provider_error", response.status === 429 ? 429 : 502);
  const usage = createMutableGatewayUsage({messages:request.messages});
  const calls: GatewayToolCall[] = []; const callsByIndex = new Map<number,GatewayToolCall>();
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  const structured = request.responseFormat && request.responseFormat.type !== "text";
  const validator = request.responseFormat?.type === "json_schema" ? schemaValidator(request.responseFormat.schema) : null;
  let output = ""; let consumed = 0; let terminal = false;
  const textStream = new ReadableStream<string>({
    async start(controller) {
      const emit = (text:string) => { output += text; usage.outputCharacters += text.length; if (!structured) controller.enqueue(text); };
      const call = (index:number) => {
        if (!Number.isInteger(index) || index < 0 || index > 127) fail("invalid_tool_stream",502);
        let value = callsByIndex.get(index); if (!value) { value={id:"",name:"",arguments:""}; callsByIndex.set(index,value); calls.push(value); } return value;
      };
      const consume = (line:string) => {
        if (!line.startsWith("data:")) return;
        const raw = line.slice(5).trim(); if (!raw) return; if (raw === "[DONE]") {terminal=true;return;}
        const event = JSON.parse(raw);
        if (event.error || event.type === "error") fail("provider_stream_error",502);
        if (anthropic) {
          if (event.type === "message_stop") terminal=true;
          applyAnthropicUsage(usage,event.message?.usage ?? event.usage);
          if (event.type === "content_block_start" && event.content_block?.type === "tool_use") Object.assign(call(event.index),{id:event.content_block.id,name:event.content_block.name});
          if (event.delta?.type === "text_delta") emit(event.delta.text);
          if (event.delta?.type === "input_json_delta") call(event.index).arguments += event.delta.partial_json;
        } else {
          applyOpenAICompatibleUsage(usage,event.usage);
          const delta = event.choices?.[0]?.delta;
          if (typeof delta?.content === "string") emit(delta.content);
          for (const t of delta?.tool_calls ?? []) { const value=call(t.index); value.id += t.id ?? ""; value.name += t.function?.name ?? ""; value.arguments += t.function?.arguments ?? ""; }
        }
      };
      try {
        let buffer="";
        while (true) {
          const next = await reader.read(); if (next.done) break;
          consumed += next.value.byteLength; if (consumed > 4*1024*1024) fail("provider_output_too_large",502);
          buffer += decoder.decode(next.value,{stream:true});
          let end; while ((end=buffer.indexOf("\n")) >= 0) {consume(buffer.slice(0,end).replace(/\r$/,""));buffer=buffer.slice(end+1);}
        }
        buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
        if (!terminal) fail("provider_stream_incomplete",502);
        for (const t of calls) {
          if (!t.id || !t.name) fail("invalid_tool_stream",502);
          const args = JSON.parse(t.arguments || "{}");
          if (structured && anthropic && t.name === STRUCTURED_TOOL) continue;
          const definition = request.tools?.find(tool => tool.name === t.name);
          if (!definition || !schemaValidator(definition.parameters)(args)) fail("invalid_tool_arguments",502);
          if (request.toolChoice === "none" || (typeof request.toolChoice === "object" && t.name !== request.toolChoice.name)) fail("invalid_tool_choice",502);
        }
        if (request.toolChoice === "required" && !calls.length) fail("required_tool_missing",502);
        if (structured) {
          if (anthropic) output = calls.find(t => t.name === STRUCTURED_TOOL)?.arguments ?? "";
          let parsed; try { parsed=JSON.parse(output); } catch { return fail("structured_output_invalid",502); }
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (validator && !validator(parsed))) fail("structured_output_invalid",502);
          if (anthropic) { calls.splice(0,calls.length); usage.outputCharacters=output.length; }
          controller.enqueue(output);
        }
        controller.close();
      } catch (error) { await reader.cancel().catch(() => {}); controller.error(error instanceof GatewayError ? error : new GatewayError({code:"provider_stream_error",status:502,message:"Provider stream could not be decoded."})); }
      finally { reader.releaseLock(); }
    },
    async cancel() { await reader.cancel(); },
  });
  return {textStream,usage,toolCalls:calls};
}
