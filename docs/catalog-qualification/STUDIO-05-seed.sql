-- STUDIO-05 seed SPEC (OWNER REVIEW ONLY). NEVER executed by the job that wrote it.
-- Companion to docs/catalog-qualification/STUDIO-05.md (read it first).
--
-- Purpose: make >= 1 endpoint per modality (image, video, audio, model/mesh)
-- reach QUALIFIED in the project-scoped Supabase catalog lane. Task families
-- covered: image.generate, video.generate, audio.generate, speech.synthesize,
-- music.generate, mesh.generate.
--
-- SAFETY MODEL (fail-closed):
--   * Whole file runs in ONE transaction that ends in ROLLBACK. Change the last
--     statement to COMMIT only after you have read the dry-run output.
--   * \set ON_ERROR_STOP on: the first error aborts everything.
--   * Attestation rows need owner-supplied values via psql variables
--     (-v attested_by=... -v canary_evidence_<family>=<sha256>). An undefined
--     variable leaves a literal :'name' in the statement => syntax error =>
--     abort. No canary evidence, no attestation.
--   * Nothing here writes price_status = 'VERIFIED' unless you also pass
--     -v verify_prices=1 AND per-endpoint -v price_evidence_<family>=<hash>.
--   * Inserts only (WHERE NOT EXISTS); no UPDATE/DELETE of existing rows.
--
-- UNVERIFIED ASSUMPTIONS (the migration DDL lives in the monolith repo, not here):
--   Column names below are taken from the code that reads these tables
--   (supabase-catalog.ts toSpec/toAttestation/listPriceRows, supabase-economics.ts
--   toPrice, spec-reader.ts specFromRow). NOT NULL / UNIQUE / CHECK constraints,
--   extra columns and defaults are UNKNOWN. Diff against
--   20260921230000_studio_v5_j06_catalog.sql, 20260921180000_studio_v5_j04_economics.sql
--   and 20260923120000_studio_v5_m2_catalog.sql before running.
--
-- Usage (owner, against a DISPOSABLE copy first):
--   psql "$DISPOSABLE_DB_URL" -v attested_by=owner@example.com \
--     -v canary_evidence_image=<sha256> -v canary_evidence_video=<sha256> \
--     -v canary_evidence_audio=<sha256> -v canary_evidence_speech=<sha256> \
--     -v canary_evidence_music=<sha256> -v canary_evidence_mesh=<sha256> \
--     -f docs/catalog-qualification/STUDIO-05-seed.sql

\set ON_ERROR_STOP on
begin;

-- Seed endpoints (marker lines are parsed by the unit test; keep the format).
-- SEED-ENDPOINT: fal-ai/bytedance/seedream/v4/text-to-image image.generate
-- SEED-ENDPOINT: fal-ai/minimax/video-01 video.generate
-- SEED-ENDPOINT: fal-ai/mmaudio-v2/text-to-audio audio.generate
-- SEED-ENDPOINT: fal-ai/kling-video/v1/tts speech.synthesize
-- SEED-ENDPOINT: fal-ai/minimax-music/v1.5 music.generate
-- SEED-ENDPOINT: fal-ai/triposr mesh.generate

-- A. Endpoint rows (inserted only if absent). Tuple convention copied from
--    packages/studio/src/server/providers/spec-reader.ts localSpecFor:
--    adapter fal-queue@2026-08-02, schema_version = snapshot bytes_sha256,
--    price_version 1.0.0, policy standard. If the live sync used another
--    convention, the existing rows win (NOT EXISTS) and section C copies
--    THEIR tuple into the attestation, so the tuple always self-matches.
insert into public.studio_v5_endpoints (
  endpoint_id, family_id, provider_id, task_name, label, description,
  adapter_name, adapter_version, schema_version, schema,
  required_controls, supported_controls, raw_params,
  price_version, policy_profile, identity_binding, capability_tags, enabled
)
select 'fal-ai/bytedance/seedream/v4/text-to-image', 'falfam/fal-ai-bytedance-v4', 'fal', 'image.generate', 'text-to-image', '',
  'fal-queue', '2026-08-02', 'e3cdb3c42e7d99fdc8efb89e2af0a6aff40caf20c1198d3b8bdf13b6d2a15b6d', $schema${"$refName":"BytedanceSeedreamV4TextToImageInput","type":"object","properties":{"seed":{"description":"Random seed to control the stochasticity of image generation.","anyOf":[{"type":"integer"},{"type":"null"}]},"enable_safety_checker":{"type":"boolean","examples":[true],"description":"If set to true, the safety checker will be enabled. Disabling it requires account authorization; unauthorized requests are always checked.","default":true},"num_images":{"minimum":1,"type":"integer","maximum":6,"description":"Number of separate model generations to be run with the prompt.","default":1},"enhance_prompt_mode":{"enum":["standard","fast"],"type":"string","description":"The mode to use for enhancing prompt enhancement. Standard mode provides higher quality results but takes longer to generate. Fast mode provides average quality results but takes less time to generate.","default":"standard"},"sync_mode":{"type":"boolean","description":"If `True`, the media will be returned as a data URI and the output data won't be available in the request history.","default":false},"image_size":{"default":{"width":2048,"height":2048},"examples":[{"width":4096,"height":4096}],"description":"The size of the generated image. Total pixels must be between 960x960 and 4096x4096.","anyOf":[{"$refName":"ImageSize","type":"object","properties":{"width":{"exclusiveMinimum":0,"type":"integer","maximum":14142,"description":"The width of the generated image.","default":512},"height":{"exclusiveMinimum":0,"type":"integer","maximum":14142,"description":"The height of the generated image.","default":512}}},{"enum":["square_hd","square","portrait_4_3","portrait_16_9","landscape_4_3","landscape_16_9","auto","auto_2K","auto_4K"],"type":"string"}]},"prompt":{"type":"string","examples":["A trendy restaurant with a digital menu board displaying \"Seedream 4.0 is available on fal\" in elegant script, with diners enjoying their meals."],"description":"The text prompt used to generate the image"},"max_images":{"minimum":1,"type":"integer","maximum":6,"description":"If set to a number greater than one, enables multi-image generation. The model will potentially return up to `max_images` images every generation, and in total, `num_images` generations will be carried out. In total, the number of images generated will be between `num_images` and `max_images*num_images`.","default":1}},"required":["prompt"]}$schema$::jsonb,
  array['prompt']::text[], array['seed', 'enable_safety_checker', 'num_images', 'enhance_prompt_mode', 'sync_mode', 'image_size', 'prompt', 'max_images']::text[], '{}'::jsonb,
  '1.0.0', 'standard', false, array['input:text']::text[], true
where not exists (select 1 from public.studio_v5_endpoints where endpoint_id = 'fal-ai/bytedance/seedream/v4/text-to-image');

insert into public.studio_v5_endpoints (
  endpoint_id, family_id, provider_id, task_name, label, description,
  adapter_name, adapter_version, schema_version, schema,
  required_controls, supported_controls, raw_params,
  price_version, policy_profile, identity_binding, capability_tags, enabled
)
select 'fal-ai/minimax/video-01', 'falfam/fal-ai-minimax', 'fal', 'video.generate', 'video-01', '',
  'fal-queue', '2026-08-02', 'cedd0f9976bca315f62e9b75dd7b3f248c72fd56287369818d7c7b616cc5fa31', $schema${"$refName":"MinimaxVideo01Input","required":["prompt"],"type":"object","properties":{"prompt_optimizer":{"description":"Whether to use the model's prompt optimizer","type":"boolean","default":true},"prompt":{"type":"string","maxLength":2000,"examples":["A stylish woman walks down a Tokyo street filled with warm glowing neon and animated city signage. She wears a black leather jacket, a long red dress, and black boots, and carries a black purse."]}}}$schema$::jsonb,
  array['prompt']::text[], array['prompt_optimizer', 'prompt']::text[], '{}'::jsonb,
  '1.0.0', 'standard', false, array['input:text']::text[], true
where not exists (select 1 from public.studio_v5_endpoints where endpoint_id = 'fal-ai/minimax/video-01');

insert into public.studio_v5_endpoints (
  endpoint_id, family_id, provider_id, task_name, label, description,
  adapter_name, adapter_version, schema_version, schema,
  required_controls, supported_controls, raw_params,
  price_version, policy_profile, identity_binding, capability_tags, enabled
)
select 'fal-ai/mmaudio-v2/text-to-audio', 'falfam/fal-ai-mmaudio-v2', 'fal', 'audio.generate', 'text-to-audio', '',
  'fal-queue', '2026-08-02', 'b1c65dc2f230c4ef54f7f33231ef8931c75595ffaf0bed1634054218c631508d', $schema${"$refName":"MmaudioV2TextToAudioInput","type":"object","properties":{"prompt":{"type":"string","description":"The prompt to generate the audio for."},"seed":{"description":"The seed for the random number generator","anyOf":[{"type":"integer","minimum":0,"maximum":65535},{"type":"null"}]},"cfg_strength":{"type":"number","default":4.5,"minimum":0,"maximum":20,"description":"The strength of Classifier Free Guidance."},"negative_prompt":{"type":"string","default":"","description":"The negative prompt to generate the audio for."},"mask_away_clip":{"type":"boolean","default":false,"description":"Whether to mask away the clip."},"num_steps":{"type":"integer","default":25,"minimum":4,"maximum":50,"description":"The number of steps to generate the audio for."},"duration":{"type":"number","default":8,"minimum":1,"maximum":30,"description":"The duration of the audio to generate."}},"required":["prompt"]}$schema$::jsonb,
  array['prompt']::text[], array['prompt', 'seed', 'cfg_strength', 'negative_prompt', 'mask_away_clip', 'num_steps', 'duration']::text[], '{}'::jsonb,
  '1.0.0', 'standard', false, array['sfx']::text[], true
where not exists (select 1 from public.studio_v5_endpoints where endpoint_id = 'fal-ai/mmaudio-v2/text-to-audio');

insert into public.studio_v5_endpoints (
  endpoint_id, family_id, provider_id, task_name, label, description,
  adapter_name, adapter_version, schema_version, schema,
  required_controls, supported_controls, raw_params,
  price_version, policy_profile, identity_binding, capability_tags, enabled
)
select 'fal-ai/kling-video/v1/tts', 'falfam/fal-ai-kling-video-v1', 'fal', 'speech.synthesize', 'tts', '',
  'fal-queue', '2026-08-02', '811a38396daa05a1165a194e1230f1e12e441450e5edee3fe15f084289a8e945', $schema${"$refName":"KlingVideoV1TtsInput","type":"object","properties":{"text":{"type":"string","maxLength":500,"description":"The text to be converted to speech"},"voice_speed":{"type":"number","default":1,"minimum":0.8,"maximum":2,"description":"Rate of speech"},"voice_id":{"type":"string","enum":["genshin_vindi2","zhinen_xuesheng","AOT","ai_shatang","genshin_klee2","genshin_kirara","ai_kaiya","oversea_male1","ai_chenjiahao_712","girlfriend_4_speech02","chat1_female_new-3","chat_0407_5-1","cartoon-boy-07","uk_boy1","cartoon-girl-01","PeppaPig_platform","ai_huangzhong_712","ai_huangyaoshi_712","ai_laoguowang_712","chengshu_jiejie","you_pingjing","calm_story1","uk_man2","laopopo_speech02","heainainai_speech02","reader_en_m-v1","commercial_lady_en_f-v1","tiyuxi_xuedi","tiexin_nanyou","girlfriend_1_speech02","girlfriend_2_speech02","zhuxi_speech02","uk_oldman3","dongbeilaotie_speech02","chongqingxiaohuo_speech02","chuanmeizi_speech02","chaoshandashu_speech02","ai_taiwan_man2_speech02","xianzhanggui_speech02","tianjinjiejie_speech02","diyinnansang_DB_CN_M_04-v2","yizhipiannan-v1","guanxiaofang-v2","tianmeixuemei-v1","daopianyansang-v1","mengwa-v1"],"default":"genshin_vindi2","description":"The voice ID to use for speech synthesis"}},"required":["text"]}$schema$::jsonb,
  array['text']::text[], array['text', 'voice_speed', 'voice_id']::text[], '{}'::jsonb,
  '1.0.0', 'standard', false, '{}'::text[], true
where not exists (select 1 from public.studio_v5_endpoints where endpoint_id = 'fal-ai/kling-video/v1/tts');

insert into public.studio_v5_endpoints (
  endpoint_id, family_id, provider_id, task_name, label, description,
  adapter_name, adapter_version, schema_version, schema,
  required_controls, supported_controls, raw_params,
  price_version, policy_profile, identity_binding, capability_tags, enabled
)
select 'fal-ai/minimax-music/v1.5', 'falfam/fal-ai-minimax-music-v1-5', 'fal', 'music.generate', 'v1.5', '',
  'fal-queue', '2026-08-02', '41affe3b7b9412c5a444de322881d68a4a7017d1d8c8c07cacfd7be3d1f58a0a', $schema${"$refName":"MinimaxMusicV15Input","type":"object","properties":{"lyrics_prompt":{"type":"string","minLength":10,"maxLength":3000,"description":"Control music generation. 10-3000 characters."},"prompt":{"type":"string","minLength":10,"maxLength":600,"description":"Lyrics, supports [intro][verse][chorus][bridge][outro] sections. 10-600 characters."},"audio_setting":{"$refName":"AudioSetting","type":"object","properties":{"bitrate":{"type":"integer","enum":[32000,64000,128000,256000],"default":256000,"description":"Bitrate of generated audio"},"sample_rate":{"type":"integer","enum":[8000,16000,22050,24000,32000,44100],"default":44100,"description":"Sample rate of generated audio"},"format":{"type":"string","enum":["mp3","pcm","flac"],"default":"mp3","description":"Audio format"}}}},"required":["prompt","lyrics_prompt"]}$schema$::jsonb,
  array['prompt', 'lyrics_prompt']::text[], array['lyrics_prompt', 'prompt', 'audio_setting']::text[], '{}'::jsonb,
  '1.0.0', 'standard', false, '{}'::text[], true
where not exists (select 1 from public.studio_v5_endpoints where endpoint_id = 'fal-ai/minimax-music/v1.5');

insert into public.studio_v5_endpoints (
  endpoint_id, family_id, provider_id, task_name, label, description,
  adapter_name, adapter_version, schema_version, schema,
  required_controls, supported_controls, raw_params,
  price_version, policy_profile, identity_binding, capability_tags, enabled
)
select 'fal-ai/triposr', 'falfam/fal-ai-triposr', 'fal', 'mesh.generate', 'triposr', '',
  'fal-queue', '2026-08-02', 'd37e1c7df7e5617bd955c1c8c97ecc86ca277bfb28bc276eb347c5f1f083af0a', $schema${"$refName":"TriposrInput","type":"object","properties":{"mc_resolution":{"type":"integer","default":256,"minimum":32,"maximum":1024,"description":"Resolution of the marching cubes. Above 512 is not recommended."},"foreground_ratio":{"type":"number","default":0.9,"minimum":0.5,"maximum":1,"description":"Ratio of the foreground image to the original image."},"do_remove_background":{"type":"boolean","default":true,"description":"Whether to remove the background from the input image."},"image_url":{"type":"string","description":"Path for the image file to be processed."},"output_format":{"type":"string","enum":["glb","obj"],"default":"glb","description":"Output format for the 3D model."}},"required":["image_url"]}$schema$::jsonb,
  array['image_url']::text[], array['mc_resolution', 'foreground_ratio', 'do_remove_background', 'image_url', 'output_format']::text[], '{}'::jsonb,
  '1.0.0', 'standard', false, array['input:text', 'input:image']::text[], true
where not exists (select 1 from public.studio_v5_endpoints where endpoint_id = 'fal-ai/triposr');

-- B. Price rows: DERIVED only, exactly as fal-price-parser.ts derives them
--    from the checked-in registry sentence. evidence_hash = pricing.raw_hash.
-- fal-ai/bytedance/seedream/v4/text-to-image: "Your request will cost $0.03 per image."
insert into public.studio_v5_price_configs (
  task_name, endpoint_id, price_version, meter_unit, unit_price_icu, minor_per_icu, sku_rate,
  effective_at, retired_at, price_status, evidence_hash
)
select 'image.generate', 'fal-ai/bytedance/seedream/v4/text-to-image', '1.0.0', 'image', 30, 1, 1,
  now(), null, 'DERIVED', '407660ce6e3754333ddbd5d66ff6ce1049d4a078d7800a9282390b5661180b48'
where not exists (select 1 from public.studio_v5_price_configs where endpoint_id = 'fal-ai/bytedance/seedream/v4/text-to-image' and price_version = '1.0.0');

-- fal-ai/minimax/video-01: "Your request will cost $0.5 per video."
insert into public.studio_v5_price_configs (
  task_name, endpoint_id, price_version, meter_unit, unit_price_icu, minor_per_icu, sku_rate,
  effective_at, retired_at, price_status, evidence_hash
)
select 'video.generate', 'fal-ai/minimax/video-01', '1.0.0', 'task_unit', 500, 1, 1,
  now(), null, 'DERIVED', '2cb4f80ee481dc99118e4d5247ad0396854335cbcec2735d67f664cf71df8eb2'
where not exists (select 1 from public.studio_v5_price_configs where endpoint_id = 'fal-ai/minimax/video-01' and price_version = '1.0.0');

-- fal-ai/mmaudio-v2/text-to-audio: "Your request will cost $0.001 per second."
insert into public.studio_v5_price_configs (
  task_name, endpoint_id, price_version, meter_unit, unit_price_icu, minor_per_icu, sku_rate,
  effective_at, retired_at, price_status, evidence_hash
)
select 'audio.generate', 'fal-ai/mmaudio-v2/text-to-audio', '1.0.0', 'second', 1, 1, 1,
  now(), null, 'DERIVED', '79040d3361522b65a89022f5dd647263adb16cf9ececd60e47ed4e67ac8d8262'
where not exists (select 1 from public.studio_v5_price_configs where endpoint_id = 'fal-ai/mmaudio-v2/text-to-audio' and price_version = '1.0.0');

-- fal-ai/kling-video/v1/tts: "Your request will cost $0.007 per generation."
insert into public.studio_v5_price_configs (
  task_name, endpoint_id, price_version, meter_unit, unit_price_icu, minor_per_icu, sku_rate,
  effective_at, retired_at, price_status, evidence_hash
)
select 'speech.synthesize', 'fal-ai/kling-video/v1/tts', '1.0.0', 'task_unit', 7, 1, 1,
  now(), null, 'DERIVED', 'af2a1557c883f60b90cfb8c461058549558e6cc1057de80533a82abdaa4779d3'
where not exists (select 1 from public.studio_v5_price_configs where endpoint_id = 'fal-ai/kling-video/v1/tts' and price_version = '1.0.0');

-- fal-ai/minimax-music/v1.5: "Your request will cost $0.03 per generation."
insert into public.studio_v5_price_configs (
  task_name, endpoint_id, price_version, meter_unit, unit_price_icu, minor_per_icu, sku_rate,
  effective_at, retired_at, price_status, evidence_hash
)
select 'music.generate', 'fal-ai/minimax-music/v1.5', '1.0.0', 'task_unit', 30, 1, 1,
  now(), null, 'DERIVED', '6f74e2b76916d19459d7870cb852dc8c8ea38e06ceb6f0d1fe2163c2d0f49946'
where not exists (select 1 from public.studio_v5_price_configs where endpoint_id = 'fal-ai/minimax-music/v1.5' and price_version = '1.0.0');

-- fal-ai/triposr: "Your request will cost $0.07 per generation."
insert into public.studio_v5_price_configs (
  task_name, endpoint_id, price_version, meter_unit, unit_price_icu, minor_per_icu, sku_rate,
  effective_at, retired_at, price_status, evidence_hash
)
select 'mesh.generate', 'fal-ai/triposr', '1.0.0', 'task_unit', 70, 1, 1,
  now(), null, 'DERIVED', '5c33f28a552f4d97f45d0cff92b989b9c226ac59c05c36883e1e21381da944ce'
where not exists (select 1 from public.studio_v5_price_configs where endpoint_id = 'fal-ai/triposr' and price_version = '1.0.0');

-- C. Attestations (executable = true). OWNER GATE: each row needs a real canary
--    run's evidence hash. Tuple is copied from the endpoint row (self-matching).
--    expires_at is 30 days out; qualification lapses (ATTESTATION_EXPIRED) after.
insert into public.studio_v5_endpoint_attestations (
  endpoint_id, adapter_name, adapter_version, schema_version, policy_profile, price_version,
  executable, evidence_hash, attested_by, attested_at, expires_at
)
select e.endpoint_id, e.adapter_name, e.adapter_version, e.schema_version, e.policy_profile, e.price_version,
  true, :'canary_evidence_image', :'attested_by', now(), now() + interval '30 days'
from public.studio_v5_endpoints e
where e.endpoint_id = 'fal-ai/bytedance/seedream/v4/text-to-image' and e.enabled
  and not exists (select 1 from public.studio_v5_endpoint_attestations a where a.endpoint_id = e.endpoint_id
    and a.adapter_version = e.adapter_version and a.schema_version = e.schema_version
    and a.policy_profile = e.policy_profile and a.price_version = e.price_version and a.expires_at > now());

insert into public.studio_v5_endpoint_attestations (
  endpoint_id, adapter_name, adapter_version, schema_version, policy_profile, price_version,
  executable, evidence_hash, attested_by, attested_at, expires_at
)
select e.endpoint_id, e.adapter_name, e.adapter_version, e.schema_version, e.policy_profile, e.price_version,
  true, :'canary_evidence_video', :'attested_by', now(), now() + interval '30 days'
from public.studio_v5_endpoints e
where e.endpoint_id = 'fal-ai/minimax/video-01' and e.enabled
  and not exists (select 1 from public.studio_v5_endpoint_attestations a where a.endpoint_id = e.endpoint_id
    and a.adapter_version = e.adapter_version and a.schema_version = e.schema_version
    and a.policy_profile = e.policy_profile and a.price_version = e.price_version and a.expires_at > now());

insert into public.studio_v5_endpoint_attestations (
  endpoint_id, adapter_name, adapter_version, schema_version, policy_profile, price_version,
  executable, evidence_hash, attested_by, attested_at, expires_at
)
select e.endpoint_id, e.adapter_name, e.adapter_version, e.schema_version, e.policy_profile, e.price_version,
  true, :'canary_evidence_audio', :'attested_by', now(), now() + interval '30 days'
from public.studio_v5_endpoints e
where e.endpoint_id = 'fal-ai/mmaudio-v2/text-to-audio' and e.enabled
  and not exists (select 1 from public.studio_v5_endpoint_attestations a where a.endpoint_id = e.endpoint_id
    and a.adapter_version = e.adapter_version and a.schema_version = e.schema_version
    and a.policy_profile = e.policy_profile and a.price_version = e.price_version and a.expires_at > now());

insert into public.studio_v5_endpoint_attestations (
  endpoint_id, adapter_name, adapter_version, schema_version, policy_profile, price_version,
  executable, evidence_hash, attested_by, attested_at, expires_at
)
select e.endpoint_id, e.adapter_name, e.adapter_version, e.schema_version, e.policy_profile, e.price_version,
  true, :'canary_evidence_speech', :'attested_by', now(), now() + interval '30 days'
from public.studio_v5_endpoints e
where e.endpoint_id = 'fal-ai/kling-video/v1/tts' and e.enabled
  and not exists (select 1 from public.studio_v5_endpoint_attestations a where a.endpoint_id = e.endpoint_id
    and a.adapter_version = e.adapter_version and a.schema_version = e.schema_version
    and a.policy_profile = e.policy_profile and a.price_version = e.price_version and a.expires_at > now());

insert into public.studio_v5_endpoint_attestations (
  endpoint_id, adapter_name, adapter_version, schema_version, policy_profile, price_version,
  executable, evidence_hash, attested_by, attested_at, expires_at
)
select e.endpoint_id, e.adapter_name, e.adapter_version, e.schema_version, e.policy_profile, e.price_version,
  true, :'canary_evidence_music', :'attested_by', now(), now() + interval '30 days'
from public.studio_v5_endpoints e
where e.endpoint_id = 'fal-ai/minimax-music/v1.5' and e.enabled
  and not exists (select 1 from public.studio_v5_endpoint_attestations a where a.endpoint_id = e.endpoint_id
    and a.adapter_version = e.adapter_version and a.schema_version = e.schema_version
    and a.policy_profile = e.policy_profile and a.price_version = e.price_version and a.expires_at > now());

insert into public.studio_v5_endpoint_attestations (
  endpoint_id, adapter_name, adapter_version, schema_version, policy_profile, price_version,
  executable, evidence_hash, attested_by, attested_at, expires_at
)
select e.endpoint_id, e.adapter_name, e.adapter_version, e.schema_version, e.policy_profile, e.price_version,
  true, :'canary_evidence_mesh', :'attested_by', now(), now() + interval '30 days'
from public.studio_v5_endpoints e
where e.endpoint_id = 'fal-ai/triposr' and e.enabled
  and not exists (select 1 from public.studio_v5_endpoint_attestations a where a.endpoint_id = e.endpoint_id
    and a.adapter_version = e.adapter_version and a.schema_version = e.schema_version
    and a.policy_profile = e.policy_profile and a.price_version = e.price_version and a.expires_at > now());

-- D. OPTIONAL price promotion DERIVED -> VERIFIED. Runs only with -v verify_prices=1
--    and requires per-family reconciliation evidence. Do NOT enable until each
--    price has been reconciled against a real provider invoice/dashboard.
\if :{?verify_prices}
update public.studio_v5_price_configs set price_status = 'VERIFIED', evidence_hash = :'price_evidence_image'
  where endpoint_id = 'fal-ai/bytedance/seedream/v4/text-to-image' and price_version = '1.0.0' and price_status = 'DERIVED' and retired_at is null;
update public.studio_v5_price_configs set price_status = 'VERIFIED', evidence_hash = :'price_evidence_video'
  where endpoint_id = 'fal-ai/minimax/video-01' and price_version = '1.0.0' and price_status = 'DERIVED' and retired_at is null;
update public.studio_v5_price_configs set price_status = 'VERIFIED', evidence_hash = :'price_evidence_audio'
  where endpoint_id = 'fal-ai/mmaudio-v2/text-to-audio' and price_version = '1.0.0' and price_status = 'DERIVED' and retired_at is null;
update public.studio_v5_price_configs set price_status = 'VERIFIED', evidence_hash = :'price_evidence_speech'
  where endpoint_id = 'fal-ai/kling-video/v1/tts' and price_version = '1.0.0' and price_status = 'DERIVED' and retired_at is null;
update public.studio_v5_price_configs set price_status = 'VERIFIED', evidence_hash = :'price_evidence_music'
  where endpoint_id = 'fal-ai/minimax-music/v1.5' and price_version = '1.0.0' and price_status = 'DERIVED' and retired_at is null;
update public.studio_v5_price_configs set price_status = 'VERIFIED', evidence_hash = :'price_evidence_mesh'
  where endpoint_id = 'fal-ai/triposr' and price_version = '1.0.0' and price_status = 'DERIVED' and retired_at is null;
\endif

-- E. Dry-run read-back (what the project-scoped catalog route will see).
select e.endpoint_id, e.task_name, a.executable, a.expires_at, p.price_status, p.unit_price_icu
from public.studio_v5_endpoints e
left join public.studio_v5_endpoint_attestations a on a.endpoint_id = e.endpoint_id
left join public.studio_v5_price_configs p on p.endpoint_id = e.endpoint_id and p.price_version = e.price_version
where e.endpoint_id in ('fal-ai/bytedance/seedream/v4/text-to-image', 'fal-ai/minimax/video-01', 'fal-ai/mmaudio-v2/text-to-audio', 'fal-ai/kling-video/v1/tts', 'fal-ai/minimax-music/v1.5', 'fal-ai/triposr')
order by e.task_name;

-- Default is ROLLBACK. Replace with COMMIT only after review of section E output.
rollback;
