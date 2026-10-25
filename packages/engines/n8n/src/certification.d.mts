export type N8nCertificationTarget="sandbox"|"saas"|"production";
export type N8nRequirement=Readonly<{
  id:string;stage:"review"|"sandbox"|"saas"|"production";
  requirement:string;verified:false;blocked:true;
}>;
export const N8N_CERTIFICATION_REQUIREMENTS:readonly N8nRequirement[];
export const N8N_RELEASE_REVIEW_TARGETS:readonly N8nCertificationTarget[];
export type N8nReleaseNoGo=Readonly<{
  kind:"n8n-release-assessment";
  target:N8nCertificationTarget;decision:"NO_GO";
  authority:"none";independentlySigned:false;
  releaseAuthorized:false;canDeploy:false;canActivateProvider:false;
  canIssueMcpToken:false;canDispatch:false;canLiftSqlOfflineCheck:false;
  ciIsNotLiveE2e:true;providerAttestation:"missing";
  licenseAttestation:"not-cleared";sqlOfflineGateExpected:true;
  releaseCode:string;blockingCount:number;
  blockingRequirements:readonly N8nRequirement[];
  next:string;
}>;
export function assessN8nReleaseReadiness(
  input?:{target?:N8nCertificationTarget}
):N8nReleaseNoGo;
