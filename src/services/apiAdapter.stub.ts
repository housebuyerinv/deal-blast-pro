/**
 * apiAdapter.stub.ts
 * 
 * Placeholder for future real backend implementation.
 * 
 * When ready, replace the logic in this file (or create a new apiAdapter.ts)
 * that makes fetch calls to your backend.
 * 
 * The interface must stay identical to StorageAdapter.
 */


export class ApiAdapterStub /* implements StorageAdapter (stub shape matches at runtime) */ {
  private async throwNotImplemented(method: string): Promise<any> {
    console.warn(`[ApiAdapter] ${method} is not yet implemented.`);
    throw new Error(`Backend API not connected yet. Method: ${method}`);
  }

  // Deals
  getDeals = () => this.throwNotImplemented('getDeals');
  getDeal = () => this.throwNotImplemented('getDeal');
  saveDeal = () => this.throwNotImplemented('saveDeal');
  updateDeal = () => this.throwNotImplemented('updateDeal');
  deleteDeal = () => this.throwNotImplemented('deleteDeal');

  // Buyers
  getBuyers = () => this.throwNotImplemented('getBuyers');
  getBuyer = () => this.throwNotImplemented('getBuyer');
  saveBuyer = () => this.throwNotImplemented('saveBuyer');
  updateBuyer = () => this.throwNotImplemented('updateBuyer');
  deleteBuyer = () => this.throwNotImplemented('deleteBuyer');
  importBuyers = () => this.throwNotImplemented('importBuyers');

  // Offers
  getOffers = () => this.throwNotImplemented('getOffers');
  saveOffer = () => this.throwNotImplemented('saveOffer');

  // Activities
  getActivities = () => this.throwNotImplemented('getActivities');
  logActivity = () => this.throwNotImplemented('logActivity');

  // Documents
  getDocuments = () => this.throwNotImplemented('getDocuments');
  saveDocument = () => this.throwNotImplemented('saveDocument');
  deleteDocument = () => this.throwNotImplemented('deleteDocument');

  // Blast Logs
  getBlastLogs = () => this.throwNotImplemented('getBlastLogs');
  saveBlastLog = () => this.throwNotImplemented('saveBlastLog');

  // Follow-ups
  getFollowUps = () => this.throwNotImplemented('getFollowUps');
  saveFollowUp = () => this.throwNotImplemented('saveFollowUp');
  updateFollowUp = () => this.throwNotImplemented('updateFollowUp');

  // Responses & Suppressions
  getBuyerResponses = () => this.throwNotImplemented('getBuyerResponses');
  saveBuyerResponse = () => this.throwNotImplemented('saveBuyerResponse');
  getDealSuppressions = () => this.throwNotImplemented('getDealSuppressions');
  saveDealSuppression = () => this.throwNotImplemented('saveDealSuppression');
  removeDealSuppression = () => this.throwNotImplemented('removeDealSuppression');

  // Bulk
  exportAllData = () => this.throwNotImplemented('exportAllData');
  importAllData = () => this.throwNotImplemented('importAllData');

  // Settings
  getSettings = () => this.throwNotImplemented('getSettings');
  saveSettings = () => this.throwNotImplemented('saveSettings');
}

export const apiAdapter = new ApiAdapterStub();


