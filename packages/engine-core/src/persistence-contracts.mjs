import { ENGINE_CATALOG, ATLAS_WORKSPACE_ID } from "./catalog.mjs";
import { MAUSBOT_PRIMITIVES } from "./primitives.mjs";

/**
 * SHA-132: preconnection draft contracts, not an executor or an authorization
 * decision. Final actor/workspace/mission ownership MUST be re-read from DB.
 * No request body, secrets, raw tools or upstream URLs cross this boundary.
 */
export class EnginePersistenceInputError extends Error {
  constructor(code) { super(code); this.code=code; this.status=400; this.name="EnginePersistenceInputError"; }
}
const fail=code=>{throw new EnginePersistenceInputError(code);};
const record=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const uuid=x=>typeof x==="string"&&ATLAS_WORKSPACE_ID.test(x);
const digest=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
function expect(raw,fields){
  if(!record(raw))fail("ENGINE_PERSISTENCE_INPUT_INVALID");
  if(Object.keys(raw).some(k=>!fields.includes(k)))fail("ENGINE_PERSISTENCE_FIELD_FORBIDDEN");
  if(fields.some(k=>!Object.hasOwn(raw,k)))fail("ENGINE_PERSISTENCE_FIELD_MISSING");
}
const offline={callable:false,released:false,hostTested:false,
  requiresAuthenticatedActor:true,requiresDatabaseAuthorization:true,
  requiresDurableAudit:true};
export function planEngineRegistration(input){
  expect(input,["workspaceId","createdBy","engineKey","label","transport"]);
  if(!uuid(input.workspaceId)||!uuid(input.createdBy))fail("ENGINE_ID_INVALID");
  if(typeof input.label!=="string"||input.label.trim().length<1||input.label.trim().length>120)
    fail("ENGINE_LABEL_INVALID");
  const engine=ENGINE_CATALOG.find(e=>e.id===input.engineKey);
  if(!engine||!engine.transports.includes(input.transport))fail("ENGINE_TRANSPORT_NOT_AVAILABLE");
  return Object.freeze({...offline,kind:"engine-registration",
    workspaceId:input.workspaceId,createdBy:input.createdBy,engineKey:engine.id,
    label:input.label.trim(),transport:input.transport,connectionState:"offline",
    requiresOwnerOrAdmin:true});
}
export function planEngineRunDraft(input){
  expect(input,["workspaceId","instanceId","instanceWorkspaceId","missionId",
    "missionWorkspaceId","requestedBy","engineKey","primitiveId","idempotencyKey",
    "payloadSha256"]);
  for(const key of ["workspaceId","instanceId","instanceWorkspaceId","missionId",
    "missionWorkspaceId","requestedBy","idempotencyKey"])
    if(!uuid(input[key]))fail("ENGINE_ID_INVALID");
  if(input.instanceWorkspaceId!==input.workspaceId||input.missionWorkspaceId!==input.workspaceId)
    fail("ENGINE_WORKSPACE_MISMATCH");
  if(!digest(input.payloadSha256))fail("ENGINE_PAYLOAD_DIGEST_INVALID");
  // No Hermes fallback and no premature publication of catalog-only native tools.
  if(input.engineKey!=="mausbot")fail("ENGINE_RUNTIME_NOT_IMPLEMENTED");
  const primitive=MAUSBOT_PRIMITIVES.find(p=>p.id===input.primitiveId);
  if(!primitive)fail("ENGINE_PRIMITIVE_UNAVAILABLE");
  return Object.freeze({...offline,kind:"engine-run-draft",
    workspaceId:input.workspaceId,instanceId:input.instanceId,
    missionId:input.missionId,requestedBy:input.requestedBy,
    engineKey:"mausbot",primitiveId:primitive.id,primitiveMode:primitive.mode,
    idempotencyKey:input.idempotencyKey,payloadSha256:input.payloadSha256,
    requiresHumanApproval:primitive.mode!=="read",
    requiresIndependentApproval:primitive.mode!=="read",
    requiresMissionBinding:true,requiresInstanceBinding:true,
    requiresEncryptedOutbox:true,
    // The draft NEVER represents a queued/authorized/executable job.
    state:"draft",canEnqueue:false});
}
