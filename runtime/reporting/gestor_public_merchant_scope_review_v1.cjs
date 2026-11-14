'use strict';
/**
 * Gestor merchant ↔ public iFood storefront URL: PRIVATE, NON-AUTHORITATIVE.
 *
 * Brand link can point to another unit and a page URL need not equal the
 * partner's internal merchant key. A match is a lead for human/source review,
 * never authority to declare ITAIM, publish an order, or write a journal.
 * This function has no network/DOM/I/O and its enumerable result contains
 * no merchant IDs, order identities, product names, notes or customer fields.
 */
const SCHEMA='deliveryos.gestor-public-merchant-scope-review.v1';
const INPUT='deliveryos.gestor-mounted-order-review.v1';
const URL_PATTERN=/^https:\/\/www\.ifood\.com\.br\/delivery\/sao-paulo-sp\/[a-z0-9-]{3,100}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?UTM_Medium=share)?$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const result=(state,reason)=>Object.freeze({
  schema:SCHEMA,state,reason,referenceType:'PUBLIC_BRAND_IFOOD_LINK_UNSCOPED',
  comparedMerchantIdFormat:'UNKNOWN',referenceMatch:null,
  referenceProvenanceIndependentlyVerified:false,
  referenceBoundToItaim:false,gestorAccountIndependentlyVerified:false,
  merchantVerified:false,unitVerified:false,orderIdentityVerified:false,
  fullCoverageVerified:false,upstreamFreshnessVerified:false,
  ordersPublishable:0,homePublishAuthorized:false,printAuthorized:false,
  readOnly:true,actionsExecuted:0,storageWrites:0,networkRequests:0,
  publicOrPrivateIdsExported:0,rawOrderIdsExported:0,
  rawNotesExported:0,rawCustomerFieldsExported:0
});
function compareMountedMerchantWithPublicReference(review,publicStorefrontUrl){
  const deny=reason=>result('HOLD',reason);
  try {
    if(!review||typeof review!=='object'||Array.isArray(review)||
       review.schema!==INPUT||review.state!=='PRIVATE_REVIEW_ONLY'||
       review.readOnly!==true||review.actionsExecuted!==0||
       review.merchantVerified!==false||review.ordersPublishable!==0||
       review.homePublishAuthorized!==false||
       review.coverage!=='MOUNTED_CARDS_ONLY'||
       !Number.isSafeInteger(review.visibleCards)||review.visibleCards<1||
       review.visibleCards>200||
       review.candidateOrders!==review.visibleCards||
       !Array.isArray(review.privateCandidates)||
       review.privateCandidates.length!==review.visibleCards)
      return deny('GESTOR_REVIEW_NOT_QUALIFIED');
    if(typeof publicStorefrontUrl!=='string'||publicStorefrontUrl.length>240)
      return deny('PUBLIC_REFERENCE_UNSUPPORTED');
    const match=URL_PATTERN.exec(publicStorefrontUrl);
    if(!match)return deny('PUBLIC_REFERENCE_UNSUPPORTED');
    const merchants=new Set();
    for(const candidate of review.privateCandidates){
      if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
         typeof candidate.merchantId!=='string'||!candidate.merchantId.trim()||
         candidate.merchantId.length>128)
        return deny('CANDIDATE_MERCHANT_UNREADABLE');
      merchants.add(candidate.merchantId.trim().toLowerCase());
    }
    if(merchants.size!==1)return deny('MIXED_MERCHANT_IDS');
    const id=merchants.values().next().value;
    if(!UUID.test(id))return Object.freeze({
      ...result('HOLD','MERCHANT_ID_FORMAT_NOT_COMPARABLE'),
      comparedMerchantIdFormat:'NOT_STORE_UUID'
    });
    return Object.freeze({
      ...result('PRIVATE_CORRELATION_ONLY','UNSCOPED_PUBLIC_REFERENCE_NOT_PROOF'),
      comparedMerchantIdFormat:'UUID',referenceMatch:id===match[1].toLowerCase()
    });
  }catch{return deny('PRIVATE_COMPARISON_FAILED')}
}
module.exports=Object.freeze({SCHEMA,compareMountedMerchantWithPublicReference});
