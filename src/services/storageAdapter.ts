/**
 * StorageAdapter
 * 
 * Abstraction layer for data persistence.
 * Current implementation: localStorage via Zustand.
 * Future implementation: REST API calls.
 * 
 * This allows the UI and store to remain unchanged when we move to a real backend.
 */

import { Deal, Buyer, Offer, Activity, Doc, BlastLog, BuyerResponse, DealSuppression } from '../lib/types';

export interface StorageAdapter {
  // Deals
  getDeals(): Promise<Deal[]>;
  getDeal(id: string): Promise<Deal | undefined>;
  saveDeal(deal: Deal): Promise<Deal>;
  updateDeal(id: string, updates: Partial<Deal>): Promise<Deal>;
  deleteDeal(id: string): Promise<void>;

  // Buyers
  getBuyers(): Promise<Buyer[]>;
  getBuyer(id: string): Promise<Buyer | undefined>;
  saveBuyer(buyer: Buyer): Promise<Buyer>;
  updateBuyer(id: string, updates: Partial<Buyer>): Promise<Buyer>;
  deleteBuyer(id: string): Promise<void>;
  importBuyers(buyers: Buyer[]): Promise<{ added: number; dups: number; suppressed: number }>;

  // Offers
  getOffers(dealId: string): Promise<Offer[]>;
  saveOffer(dealId: string, offer: Offer): Promise<Offer>;

  // Activities
  getActivities(dealId: string): Promise<Activity[]>;
  logActivity(dealId: string | null, type: string, description: string): Promise<void>;

  // Documents
  getDocuments(dealId: string): Promise<Doc[]>;
  saveDocument(dealId: string, doc: Doc): Promise<Doc>;
  deleteDocument(dealId: string, docId: string): Promise<void>;

  // Blast Logs
  getBlastLogs(dealId: string): Promise<BlastLog[]>;
  saveBlastLog(dealId: string, log: BlastLog): Promise<BlastLog>;

  // Follow-ups
  getFollowUps(): Promise<any[]>;
  saveFollowUp(followUp: any): Promise<any>;
  updateFollowUp(id: string, updates: Partial<any>): Promise<any>;

  // Buyer Responses & Suppressions
  getBuyerResponses(buyerId: string): Promise<Record<string, BuyerResponse>>;
  saveBuyerResponse(buyerId: string, dealId: string, response: BuyerResponse): Promise<void>;

  getDealSuppressions(dealId: string): Promise<DealSuppression[]>;
  saveDealSuppression(dealId: string, suppression: DealSuppression): Promise<void>;
  removeDealSuppression(dealId: string, buyerId: string): Promise<void>;

  // Bulk operations (used by demo reset / import)
  exportAllData(): Promise<string>;
  importAllData(json: string): Promise<void>;

  // Settings (if we decide to persist them server-side later)
  getSettings(): Promise<any>;
  saveSettings(settings: any): Promise<void>;
}


