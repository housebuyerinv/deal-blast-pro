/**
 * localStorageAdapter
 * 
 * Current production implementation for Deal Blast Pro.
 * This adapter wraps the existing Zustand + localStorage behavior
 * so we can later swap it for an API adapter without touching the UI.
 */

import { StorageAdapter } from './storageAdapter';
import { useAppStore } from '../store/useAppStore';
import { Deal, Buyer, Offer, Activity, Doc, BlastLog, BuyerResponse, DealSuppression } from '../lib/types';

// This adapter mostly delegates to the existing store methods
// In a real migration we would move the logic here.

export class LocalStorageAdapter implements StorageAdapter {
  private get store() {
    return useAppStore.getState();
  }

  // === Deals ===
  async getDeals(): Promise<Deal[]> {
    return this.store.deals;
  }

  async getDeal(id: string): Promise<Deal | undefined> {
    return this.store.getDeal(id);
  }

  async saveDeal(deal: Deal): Promise<Deal> {
    // The store's addDeal already handles ID + timestamps
    return this.store.addDeal(deal as any);
  }

  async updateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
    this.store.updateDeal(id, updates);
    const updated = this.store.getDeal(id);
    if (!updated) throw new Error('Deal not found after update');
    return updated;
  }

  async deleteDeal(id: string): Promise<void> {
    this.store.deleteDeal(id);
  }

  // === Buyers ===
  async getBuyers(): Promise<Buyer[]> {
    return this.store.buyers;
  }

  async getBuyer(id: string): Promise<Buyer | undefined> {
    return this.store.getBuyer(id);
  }

  async saveBuyer(buyer: Buyer): Promise<Buyer> {
    return this.store.addBuyer(buyer as any);
  }

  async updateBuyer(id: string, updates: Partial<Buyer>): Promise<Buyer> {
    this.store.updateBuyer(id, updates);
    const updated = this.store.getBuyer(id);
    if (!updated) throw new Error('Buyer not found');
    return updated;
  }

  async deleteBuyer(id: string): Promise<void> {
    // Simple implementation for demo
    useAppStore.setState(state => ({
      buyers: state.buyers.filter(b => b.id !== id)
    }));
  }

  async importBuyers(buyers: Buyer[]): Promise<{ added: number; dups: number; suppressed: number }> {
    return this.store.importBuyers(buyers as any);
  }

  // === Offers ===
  async getOffers(dealId: string): Promise<Offer[]> {
    return this.store.offers[dealId] || [];
  }

  async saveOffer(dealId: string, offer: Offer): Promise<Offer> {
    this.store.addOffer(dealId, offer as any);
    return offer;
  }

  // === Activities ===
  async getActivities(dealId: string): Promise<Activity[]> {
    return this.store.getActivities(dealId);
  }

  async logActivity(dealId: string | null, type: string, description: string): Promise<void> {
    this.store.logActivity(dealId, type, description);
  }

  // === Documents ===
  async getDocuments(dealId: string): Promise<Doc[]> {
    return this.store.documents[dealId] || [];
  }

  async saveDocument(dealId: string, doc: Doc): Promise<Doc> {
    this.store.addDocument(dealId, doc as any);
    return doc;
  }

  async deleteDocument(dealId: string, docId: string): Promise<void> {
    this.store.removeDocument(dealId, docId);
  }

  // === Blast Logs ===
  async getBlastLogs(dealId: string): Promise<BlastLog[]> {
    return this.store.getBlastLogs(dealId);
  }

  async saveBlastLog(dealId: string, log: BlastLog): Promise<BlastLog> {
    this.store.recordBlastLog(dealId, log as any);
    return log;
  }

  // === Follow-ups ===
  async getFollowUps(): Promise<any[]> {
    return this.store.followUps;
  }

  async saveFollowUp(followUp: any): Promise<any> {
    // Using existing scheduleFollowUp for now
    this.store.scheduleFollowUp(followUp.dealId, followUp.buyerId, 0, followUp.type);
    return followUp;
  }

  async updateFollowUp(id: string, updates: Partial<any>): Promise<any> {
    if (updates.completed) {
      this.store.completeFollowUp(id);
    }
    const fu = this.store.followUps.find(f => f.id === id);
    return { ...fu, ...updates } as any;
  }

  // === Responses & Suppressions ===
  async getBuyerResponses(buyerId: string): Promise<Record<string, BuyerResponse>> {
    return this.store.buyerResponses[buyerId] || {};
  }

  async saveBuyerResponse(buyerId: string, dealId: string, response: BuyerResponse): Promise<void> {
    this.store.setBuyerResponse(buyerId, dealId, response.status, response.notes);
  }

  async getDealSuppressions(dealId: string): Promise<DealSuppression[]> {
    return this.store.dealSuppressions[dealId] || [];
  }

  async saveDealSuppression(dealId: string, suppression: DealSuppression): Promise<void> {
    this.store.suppressBuyerFromDeal(dealId, suppression.buyerId, suppression.reason);
  }

  async removeDealSuppression(dealId: string, buyerId: string): Promise<void> {
    this.store.removeDealSuppression(dealId, buyerId);
  }

  // === Bulk ===
  async exportAllData(): Promise<string> {
    return this.store.exportAllData();
  }

  async importAllData(json: string): Promise<void> {
    this.store.importAllData(json);
  }

  // === Settings (stub for future) ===
  async getSettings(): Promise<any> {
    return this.store.settings;
  }

  async saveSettings(settings: any): Promise<void> {
    this.store.updateSettings(settings);
  }
}

// Singleton instance for the app to use
export const localStorageAdapter = new LocalStorageAdapter();


