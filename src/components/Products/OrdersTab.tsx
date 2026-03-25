import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Package, Calendar, User, ShoppingCart, X, ArrowRight,
  ChevronLeft, ChevronRight, Layers, Hash
} from 'lucide-react';
import { salesAPI } from '../../services/api';
import type { Order } from '../../types';
import ConfirmModal from '../Modals/ConfirmModal';

const OrderDetailModal: React.FC<{
  order: Order;
  onClose: () => void;
  onStatusUpdate: () => void;
}> = ({ order, onClose, onStatusUpdate }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);

  const handleMarkAsPaid = async () => {
    setIsUpdating(true);
    try {
      await (salesAPI as any).updateOrderStatus(order.id, 'paid');
      onStatusUpdate();
      onClose();
    } catch (err) {
      alert('Failed to update order status');
    } finally {
      setIsUpdating(false);
      setShowConfirm(false);
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

  // We use createPortal to ensure the fixed modal is relative to the viewport,
  // bypassing any stacking contexts (like animations) in the parent components.
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-[73px] z-[10000] flex items-center justify-center p-0">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      
      <div className="relative w-full h-full flex flex-col bg-white dark:bg-[#1a222c] overflow-hidden animate-fade-in">
        {/* Header - Matching ProductDetailsModal exactly */}
        <div className="border-b border-blue-100 dark:border-white/5 bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
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
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Content - Matching ProductDetailsModal exactly */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 dark:bg-[#111827]">
          <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
            
            {/* 1. Image Slider View (Matching Product Template) */}
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

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10 bg-black/30 backdrop-blur-md px-3 py-2 rounded-full">
                      {photos.map((_, idx) => (
                        <button 
                          key={idx}
                          onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                          className={`w-2 h-2 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/80'}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 2. Dual Column Info Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] rounded-[32px] p-10 border border-gray-100 dark:border-white/5 shadow-sm space-y-10">
                {/* Product/Description Section */}
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

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Product Details
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[16px] whitespace-pre-wrap">
                    {order.product_description || 'No detailed specifications provided for this order.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="w-4 h-4" /> Customer Profile
                  </h3>
                  <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-6 border border-gray-100 dark:border-white/5 flex items-center gap-5">
                    <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-black">
                      {order.customer_name?.[0].toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900 dark:text-white">{order.customer_name || 'Anonymous User'}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {order.customer_username && (
                          <span className="text-xs font-bold text-blue-600">@{order.customer_username}</span>
                        )}
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">ID: TG-{order.telegram_peer_id}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100 dark:bg-white/5" />

                {/* Delivery Section */}
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
                    {order.delivery_instructions && (
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Special Instructions</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white italic">"{order.delivery_instructions}"</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar Info Section */}
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
                           order.status === 'paid' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                         }`}>
                           {order.status}
                         </span>
                       </div>
                       <div className="flex items-center justify-between text-xs font-bold">
                         <span className="text-gray-400 uppercase tracking-widest">Date</span>
                         <span className="text-gray-700 dark:text-gray-300">{new Date(order.created_at).toLocaleDateString()}</span>
                       </div>
                    </div>
                  </div>

                  {order.status !== 'paid' && (
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={isUpdating}
                      className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 disabled:opacity-50"
                    >
                      {isUpdating ? 'Updating...' : 'Verify & Mark as Paid'}
                    </button>
                  )}
                </div>

                <ConfirmModal
                  isOpen={showConfirm}
                  onClose={() => setShowConfirm(false)}
                  onConfirm={handleMarkAsPaid}
                  title="Confirm Payment Verification"
                  message="Are you sure you want to mark this order as PAID? This will send an automated confirmation message to the customer on Telegram."
                  confirmText="Verify & Mark Paid"
                  type="info"
                />


                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-6 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] transition-all bg-white dark:bg-[#1a222c] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm"
                >
                  Close Record
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const OrdersTab: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const data = await salesAPI.getOrders();
      setOrders(data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-pulse">
        <div className="w-12 h-12 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin mb-6 shadow-2xl shadow-blue-600/20" />
        <p className="text-gray-400 font-black uppercase tracking-[0.2em] text-[10px]">Processing Database...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1a222c] rounded-[40px] border-2 border-dashed border-gray-100 dark:border-white/5 p-24 text-center group hover:border-blue-500/20 transition-all">
        <div className="w-24 h-24 bg-blue-600/5 rounded-3xl flex items-center justify-center mx-auto mb-8 text-blue-600 border border-blue-600/10 group-hover:scale-110 transition-transform shadow-inner">
          <ShoppingCart className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-3 uppercase tracking-tight">Financial Void Detected</h3>
        <p className="text-gray-400 text-sm max-w-sm mx-auto font-bold uppercase tracking-widest leading-relaxed">System is synchronized but no organic transaction data exists at this moment.</p>
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
                  <div className={`w-1.5 h-1.5 rounded-full ${order.status === 'paid' ? 'bg-green-500' : 'bg-amber-500'}`} />
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
      </div>

      {selectedOrder && (
        <OrderDetailModal 
          order={selectedOrder} 
          onClose={() => setSelectedOrder(null)} 
          onStatusUpdate={fetchOrders}
        />
      )}
    </div>
  );
};

export default OrdersTab;
