import { z } from "zod";
import type { GatewayChatRequest, GatewayContentPart, GatewayToolCall } from "./types";
const jsonSchema=z.record(z.string(),z.unknown());
const fn=z.object({name:z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/),description:z.string().max(4096).optional(),parameters:jsonSchema});
const tool=z.object({type:z.literal("function"),function:fn});
const call=z.object({id:z.string().min(1).max(128),type:z.literal("function"),function:z.object({name:z.string().min(1).max(64),arguments:z.string().max(65536)})});
const content=z.union([z.string().max(1024*1024),z.array(z.discriminatedUnion("type",[
 z.object({type:z.literal("text"),text:z.string().max(1024*1024)}),
 z.object({type:z.literal("image_url"),image_url:z.object({url:z.string().max(6*1024*1024).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)})}),
])).max(32)]);
const schema=z.object({
 messages:z.array(z.object({role:z.enum(["system","user","assistant","tool"]),content:content.nullable(),tool_call_id:z.string().max(128).optional(),tool_calls:z.array(call).max(32).optional()})).min(1).max(128),
 tools:z.array(tool).max(32).optional(),
 tool_choice:z.union([z.enum(["auto","none","required"]),z.object({type:z.literal("function"),function:z.object({name:z.string().max(64)})})]).optional(),
 response_format:z.discriminatedUnion("type",[z.object({type:z.literal("text")}),z.object({type:z.literal("json_object")}),z.object({type:z.literal("json_schema"),json_schema:z.object({name:z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/),schema:jsonSchema,strict:z.boolean().optional()})})]).optional(),
});
export function normalizeOpenAIContract(input:unknown): Pick<GatewayChatRequest,"messages"|"tools"|"toolChoice"|"responseFormat"> {
 const body=schema.parse(input);
 return {messages:body.messages.map(m=>({role:m.role,content:typeof m.content==="string"?m.content:m.content===null?"":m.content.map((p):GatewayContentPart=>{
  if(p.type==="text")return p;const [metadata,data]=p.image_url.url.split(",");return {type:"image",mediaType:metadata.slice(5,-7) as "image/png"|"image/jpeg"|"image/webp",data};
 }),toolCallId:m.tool_call_id,toolCalls:m.tool_calls?.map(t=>({id:t.id,name:t.function.name,arguments:t.function.arguments}))})),
 tools:body.tools?.map(t=>t.function),toolChoice:typeof body.tool_choice==="object"?{name:body.tool_choice.function.name}:body.tool_choice,
 responseFormat:body.response_format?.type==="json_schema"?{type:"json_schema",name:body.response_format.json_schema.name,schema:body.response_format.json_schema.schema}:body.response_format};
}
export function openAIToolCalls(calls:GatewayToolCall[]=[]){return calls.map((t,index)=>({index,id:t.id,type:"function",function:{name:t.name,arguments:t.arguments}}));}
