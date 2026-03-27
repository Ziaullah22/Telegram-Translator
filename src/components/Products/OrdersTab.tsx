import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Calendar, User, X, ArrowRight,
  ChevronLeft, ChevronRight, Layers, Hash,
  Filter, Eye, CheckCircle2, AlertCircle, Truck, Box, CheckCircle, Trash2
} from 'lucide-react';
import { salesAPI } from '../../services/api';
import type { Order } from '../../types';

const OrderDetailModal: React.FC<{
  order: Order;
  onClose: () => void;
  onStatusUpdate: () => void;
}> = ({ order, onClose, onStatusUpdate }) => {
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDisapproveDialog, setShowDisapproveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [reason, setReason] = useState("");

  const handleUpdateStatus = async (status: string, reason?: string) => {
    setIsUpdating(true);
    try {
      await (salesAPI as any).updateOrderStatus(order.id, status, reason);
      onStatusUpdate();
    } catch (err) {
      alert('Failed to update order status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteOrder = async () => {
    setIsUpdating(true);
    try {
      await (salesAPI as any).deleteOrder(order.id);
      onStatusUpdate();
      onClose();
    } catch (err) {
      alert('Failed to delete order.');
    } finally {
      setIsUpdating(false);
      setShowDeleteDialog(false);
    }
  };

  const photos = (order.photo_urls && order.photo_urls.length > 0) 
    ? order.photo_urls 
    : ['/placeholder-product.png'];

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % photos.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-[73px] z-[10000] flex items-center justify-center p-0">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      
      <div className="relative w-full h-full flex flex-col bg-white dark:bg-[#1a222c] overflow-hidden animate-fade-in">
        <div className="border-b border-blue-100 dark:border-white/5 bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-blue-600 shadow-blue-600/20">
                <Package className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">
                  Order Details
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Transaction & Fulfillment Record
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button disabled={isUpdating} onClick={() => setShowDeleteDialog(true)} className="w-10 h-10 mr-2 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500" title="Delete Order">
                <Trash2 className="w-5 h-5" />
              </button>
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 dark:bg-[#111827]">
          <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
            
            <div className="bg-white dark:bg-[#1e293b] rounded-[32px] p-2 border border-gray-100 dark:border-white/5 shadow-sm">
              <div className="h-[300px] md:h-[400px] relative rounded-[28px] bg-gray-100 dark:bg-black/30 overflow-hidden group flex items-center justify-center">
                <img 
                  src={photos[currentImageIndex]} 
                  alt={`${order.product_name} - ${currentImageIndex + 1}`} 
                  className="w-full h-full object-contain transition-opacity duration-300"
                />
                {photos.length > 1 && (
                  <>
                    <button 
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/70 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ChevronLeft className="w-6 h-6 ml-[-2px]" />
                    </button>
                    <button 
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/70 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ChevronRight className="w-6 h-6 mr-[-2px]" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] rounded-[32px] p-10 border border-gray-100 dark:border-white/5 shadow-sm space-y-10">
                <div className="space-y-4">
                  <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                    {order.product_name}
                  </h1>
                  <div className="flex items-center gap-2">
                    <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-blue-500/20">
                      PO: {order.po_number}
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100 dark:bg-white/5" />

                {((order.proof_history && order.proof_history.length > 0) || order.payment_screenshot_path) && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Eye className="w-4 h-4" /> Proof History
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Show current/latest primary proof first if it exists */}
                      {order.payment_screenshot_path && (
                        <div className="bg-white dark:bg-black/20 rounded-[24px] p-4 border-2 border-blue-500 shadow-lg shadow-blue-500/10 overflow-hidden">
                          <p className="text-[8px] font-black uppercase text-blue-500 mb-2 tracking-widest text-center">Primary Proof</p>
                          <div className="group relative rounded-xl overflow-hidden bg-gray-900 aspect-video flex items-center justify-center">
                            <img 
                              src={`/media/files/${order.payment_screenshot_path}`}
                              alt="Primary Payment Receipt"
                              className="max-h-full max-w-full object-contain hover:scale-105 transition-transform duration-500 cursor-pointer"
                              onClick={() => window.open(`/media/files/${order.payment_screenshot_path}`, '_blank')}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Show historical proofs */}
                      {order.proof_history?.filter(p => p !== order.payment_screenshot_path).map((path, idx) => (
                        <div key={idx} className="bg-white dark:bg-black/20 rounded-[24px] p-4 border border-gray-200 dark:border-white/5 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                          <p className="text-[8px] font-black uppercase text-gray-400 mb-2 tracking-widest text-center">Previous Attempt</p>
                          <div className="group relative rounded-xl overflow-hidden bg-gray-900 aspect-video flex items-center justify-center">
                            <img 
                              src={`/media/files/${path}`}
                              alt={`Historical Receipt ${idx + 1}`}
                              className="max-h-full max-w-full object-contain hover:scale-105 transition-transform duration-500 cursor-pointer"
                              onClick={() => window.open(`/media/files/${path}`, '_blank')}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Product Details
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[16px] whitespace-pre-wrap">
                    {order.product_description || 'No detailed specifications provided.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="w-4 h-4" /> Customer Profile
                  </h3>
                  <div 
                  className="bg-gray-50 dark:bg-black/20 rounded-2xl p-6 border border-blue-500/20 flex items-center gap-5 hover:border-blue-500/50 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 cursor-pointer transition-all group shadow-sm hover:shadow-md hover:shadow-blue-500/10"
                  onClick={() => {
                    onClose();
                    navigate('/', { state: { openAccountId: order.telegram_account_id, openPeerId: order.telegram_peer_id } });
                  }}
                >
                    <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-black shadow-lg shadow-blue-600/20 group-hover:scale-105 transition-transform">
                      {order.customer_name?.[0].toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-black text-gray-900 dark:text-white">{order.customer_name || 'Anonymous User'}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {order.customer_username && (
                          <span className="text-xs font-bold text-blue-600">@{order.customer_username}</span>
                        )}
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">TG-{order.telegram_peer_id}</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 mt-2 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <ArrowRight className="w-3 h-3" /> Open Chat
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" /> Fulfillment Details
                  </h3>
                  <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-6 border border-gray-100 dark:border-white/5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                         <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Method</p>
                         <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{order.delivery_method?.replace('_', ' ') || 'N/A'}</p>
                       </div>
                       {order.delivery_time_slot && (
                         <div>
                           <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Time Slot</p>
                           <p className="text-sm font-bold text-gray-900 dark:text-white">{order.delivery_time_slot}</p>
                         </div>
                       )}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Address</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{order.delivery_address || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-lg shadow-blue-600/20 space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Final Settlement</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black">${order.total_price.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
                     <div>
                        <p className="text-[8px] font-black uppercase opacity-60">Price/Unit</p>
                        <p className="text-sm font-black">${order.unit_price.toLocaleString()}</p>
                     </div>
                     <div>
                        <p className="text-[8px] font-black uppercase opacity-60">Total Qty</p>
                        <p className="text-sm font-black">× {order.quantity}</p>
                     </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1e293b] rounded-[32px] p-8 border border-gray-100 dark:border-white/5 shadow-sm space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Hash className="w-4 h-4" /> Transaction Details
                    </h3>
                    <div className="space-y-3">
                       <div className="flex items-center justify-between text-xs font-bold">
                         <span className="text-gray-400 uppercase tracking-widest">Status</span>
                         <span className={`px-2 py-0.5 rounded-lg border uppercase tracking-widest text-[9px] font-black ${
                           order.status === 'paid' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                           order.status === 'pending_payment' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 
                           order.status === 'disapproved' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                           'bg-blue-500/10 text-blue-600 border-blue-500/20'
                         }`}>
                           {order.status.replace('_', ' ')}
                         </span>
                       </div>
                       
                       {order.disapproval_reason && (order.status === 'disapproved' || order.status === 'pending_payment') && (
                         <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                            <p className="text-[8px] font-black uppercase text-red-500 mb-1 tracking-widest font-black">Verification Issue</p>
                            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 italic">"{order.disapproval_reason}"</p>
                         </div>
                       )}
                    </div>
                  </div>

                  {order.status === 'pending_payment' && (
                    <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-white/5">
                      {order.payment_screenshot_path ? (
                        <>
                          <button
                            onClick={() => handleUpdateStatus('paid')}
                            disabled={isUpdating}
                            className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 disabled:opacity-50 flex items-center justify-center gap-3"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve Payment
                          </button>
                          
                          <button
                            onClick={() => setShowDisapproveDialog(true)}
                            disabled={isUpdating}
                            className="w-full px-6 py-4 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                          >
                            <AlertCircle className="w-4 h-4" /> Disapprove
                          </button>
                        </>
                      ) : (
                        <div className="py-8 px-6 rounded-[28px] bg-amber-500/5 border border-amber-500/20 text-center space-y-4 shadow-sm">
                           <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
                              <AlertCircle className="w-6 h-6 text-amber-600" />
                           </div>
                           <div className="space-y-1">
                              <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Awaiting Screenshot</p>
                              <p className="text-[10px] text-amber-600/60 font-bold leading-relaxed px-4">Verification buttons will unlock once the customer uploads proof of payment.</p>
                           </div>
                        </div>
                      )}
                    </div>
                  )}

                  {order.status === 'paid' && (
                    <button onClick={() => handleUpdateStatus('packed')} disabled={isUpdating} className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3">
                      <Box className="w-4 h-4" /> Mark as Packed
                    </button>
                  )}

                  {order.status === 'packed' && (
                    <button onClick={() => handleUpdateStatus('shipped')} disabled={isUpdating} className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3">
                      <Truck className="w-4 h-4" /> Mark as Shipped
                    </button>
                  )}

                  {order.status === 'shipped' && (
                    <button onClick={() => handleUpdateStatus('delivered')} disabled={isUpdating} className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 flex items-center justify-center gap-3">
                      <CheckCircle className="w-4 h-4" /> Mark as Delivered
                    </button>
                  )}

                  <button type="button" onClick={onClose} className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-white dark:bg-[#1a222c] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm">
                    Close Record
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disapproval Modal - Elegant Overlay */}
      {showDisapproveDialog && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowDisapproveDialog(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#1a222c] rounded-[40px] shadow-2xl overflow-hidden border border-red-500/20 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-red-50/50 dark:bg-red-500/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Disapprove Order</h3>
                  <p className="text-[10px] text-red-600/60 font-black uppercase tracking-widest mt-0.5">Payment Verification Issue</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest block">Reason for Disapproval</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. The amount shown in screenshot does not match the order total."
                  className="w-full h-32 px-5 py-4 rounded-[24px] bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 text-gray-900 dark:text-white text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">
                  This message will be translated and sent to the customer automatically.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowDisapproveDialog(false)}
                  className="px-6 py-4 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (reason.trim()) {
                      handleUpdateStatus('disapproved', reason);
                      setShowDisapproveDialog(false);
                    } else {
                      alert("Please provide a reason for disapproval.");
                    }
                  }}
                  disabled={!reason.trim() || isUpdating}
                  className="px-6 py-4 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all disabled:opacity-50"
                >
                  Confirm & Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowDeleteDialog(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#1a222c] rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-red-50/50 dark:bg-red-500/5">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-600">
                   <Trash2 className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Delete Order</h3>
                   <p className="text-[10px] text-red-600/60 font-black uppercase tracking-widest mt-0.5">Permanent Action</p>
                 </div>
               </div>
            </div>
            <div className="p-8 space-y-6">
               <p className="text-sm font-bold text-gray-600 dark:text-gray-400">
                 Are you sure you want to completely delete order <span className="font-black text-gray-900 dark:text-white">{order.po_number}</span>? This will remove all associated payment screenshots and data.
               </p>
               <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setShowDeleteDialog(false)} className="px-6 py-4 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
                    Cancel
                  </button>
                  <button onClick={handleDeleteOrder} disabled={isUpdating} className="px-6 py-4 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center">
                    Delete Data
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

const OrdersTab: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchOrders = async (background = false) => {
    try {
      if (!background) setIsLoading(true);
      const data = await (salesAPI as any).getOrders(activeFilter);
      setOrders(data);
      setSelectedOrder((prev) => {
        if (!prev) return prev;
        return data.find((o: Order) => o.id === prev.id) || prev;
      });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      if (!background) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [activeFilter]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <div className="w-12 h-12 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin mb-6" />
        <p className="text-gray-400 font-black uppercase tracking-[0.2em] text-[10px]">Processing Database...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-6 px-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em]">Operational Flow</h3>
        </div>

        <div className="flex items-center bg-gray-100/50 dark:bg-black/20 p-1.5 rounded-2xl border border-gray-100 dark:border-white/5 backdrop-blur-md">
            {[
              { id: 'all', label: 'All', icon: <Filter className="w-3 h-3" /> },
              { id: 'pending_payment', label: 'Pending', icon: <Calendar className="w-3 h-3" /> },
              { id: 'paid', label: 'Paid', icon: <CheckCircle2 className="w-3 h-3" /> },
              { id: 'packed', label: 'Packed', icon: <Box className="w-3 h-3" /> },
              { id: 'shipped', label: 'Shipping', icon: <Truck className="w-3 h-3" /> },
              { id: 'delivered', label: 'Delivered', icon: <CheckCircle className="w-3 h-3" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeFilter === tab.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                    : 'text-gray-500 hover:bg-gray-200/50 dark:hover:bg-white/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {orders.map((order) => (
          <div 
            key={order.id} 
            onClick={() => setSelectedOrder(order)}
            className="group bg-white dark:bg-[#1a222c] rounded-[32px] border border-gray-100 dark:border-white/5 p-6 shadow-sm hover:shadow-2xl hover:shadow-blue-600/10 hover:border-blue-500/30 transition-all cursor-pointer relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-6"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
            
            <div className="flex items-center gap-6 flex-1 w-full sm:w-auto">
              <div className="relative shrink-0 overflow-hidden shadow-lg w-16 h-16 rounded-2xl bg-gray-50 dark:bg-black/20">
                <img 
                  src={(order.photo_urls && order.photo_urls.length > 0) ? order.photo_urls[0] : '/placeholder-product.png'} 
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-base truncate">{order.po_number}</h3>
                  <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase border ${
                    order.status === 'paid' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 
                    order.status === 'pending_payment' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 
                    order.status === 'shipped' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                    'bg-gray-500/10 text-gray-600 border-gray-500/20'
                  }`}>
                    {order.status.replace('_', ' ')}
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                   <p className="text-xs text-gray-500 dark:text-gray-400 font-bold truncate">{order.product_name}</p>
                   <div className="w-1 h-1 rounded-full bg-gray-200 dark:bg-white/10" />
                   <p className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest">
                      {order.quantity} Units | TG-{order.telegram_peer_id}
                   </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-10">
              <div className="flex flex-col items-end gap-1">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Grand Total</p>
                 <p className="text-xl font-black text-blue-600 dark:text-blue-400">
                   ${order.total_price.toLocaleString()}
                 </p>
              </div>

              <div className="hidden sm:flex flex-col items-end gap-1 px-8 border-l border-gray-100 dark:border-white/5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Auth Date</p>
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {new Date(order.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110 transition-all">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="text-center py-20 text-gray-400 font-bold uppercase tracking-widest text-xs">
            No orders found for this status
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => setSelectedOrder(null)} 
          onStatusUpdate={() => fetchOrders(true)}
        />
      )}
    </div>
  );
};

export default OrdersTab;
