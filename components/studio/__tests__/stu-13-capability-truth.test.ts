import { strict as assert } from "node:assert";
import { getStudioCapabilityPresentation, isStudioV1Candidate, studioCapabilityLabel } from "../studio-capability-truth";

assert.equal(getStudioCapabilityPresentation("create-image"), "v1_candidate");
assert.equal(getStudioCapabilityPresentation("image-to-video"), "v1_candidate");
assert.equal(isStudioV1Candidate("marketing-studio"), false);
assert.match(studioCapabilityLabel("marketing-studio"), /Catalog only/);
console.log("STU-13 capability truth tests passed");
