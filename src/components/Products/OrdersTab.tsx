import React, { useState, useEffect } from 'react';
import { Package, Calendar, User, ShoppingCart, CheckCircle, Clock } from 'lucide-react';
import { salesAPI } from '../../services/api';
import type { Order } from '../../types';

const OrdersTab: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading orders...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/5 p-20 text-center">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500 border border-blue-500/20">
          <ShoppingCart className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">No orders yet</h3>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">When customers place orders via the Assistant, they will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-600 border border-blue-500/20">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">{order.po_number}</h3>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      order.status === 'confirmed' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 
                      order.status === 'paid' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
                      'bg-gray-500/10 text-gray-600 border border-gray-500/20'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">{order.product_name} × {order.quantity}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Amount</p>
                  <p className="text-lg font-black text-blue-600">${order.total_price.toLocaleString()}</p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer ID</p>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">TG-{order.telegram_peer_id}</p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</p>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   {order.status === 'confirmed' ? (
                     <div className="flex items-center gap-1 text-amber-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase">Pending Payment</span>
                     </div>
                   ) : (
                      <div className="flex items-center gap-1 text-green-500">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase">Completed</span>
                      </div>
                   )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrdersTab;
