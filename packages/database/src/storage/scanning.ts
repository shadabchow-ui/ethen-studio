/** Bounded admission checks; not malware certification. Unsupported files fail closed. */
export function scanUpload(bytes: Uint8Array, contentType: string): { status:"clean"|"quarantined"; reason:string } {
  if (bytes.byteLength === 0 || bytes.byteLength > 32*1024*1024) return {status:"quarantined",reason:"object_size_limit"};
  const mime=contentType.split(";",1)[0].trim().toLowerCase();
  const at=(offset:number,values:number[])=>values.every((b,i)=>bytes[offset+i]===b);
  const text=(offset:number,value:string)=>at(offset,[...value].map(c=>c.charCodeAt(0)));
  const known: Record<string,boolean> = {
    "image/png":at(0,[137,80,78,71,13,10,26,10]), "image/jpeg":at(0,[255,216,255]),
    "image/webp":text(0,"RIFF")&&text(8,"WEBP"), "image/gif":text(0,"GIF87a")||text(0,"GIF89a"),
    "audio/wav":text(0,"RIFF")&&text(8,"WAVE"), "audio/mpeg":text(0,"ID3")||(bytes[0]===255&&(bytes[1]&224)===224),
    "audio/ogg":text(0,"OggS"), "video/mp4":text(4,"ftyp"), "audio/mp4":text(4,"ftyp"),
    "video/webm":at(0,[26,69,223,163]), "application/pdf":text(0,"%PDF-"), "application/zip":at(0,[80,75,3,4]),
  };
  if (mime==="text/plain" || mime==="application/json") {
    try { const decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(decoded.includes("\0"))throw new Error();if(mime==="application/json")JSON.parse(decoded);return {status:"clean",reason:"validated_text"}; }
    catch {return {status:"quarantined",reason:"invalid_text"};}
  }
  return known[mime] ? {status:"clean",reason:"magic_bytes_match"} : {status:"quarantined",reason:"unsupported_or_mismatched_type"};
}
