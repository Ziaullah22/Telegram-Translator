import React, { useState, useEffect } from 'react';
import { 
  Plus, Package, Layers, DollarSign, Edit2, Trash2, 
  Search, ShoppingBag, AlertCircle, Info, PackageCheck, PackageX, Hash,
  ShoppingCart, CreditCard
} from 'lucide-react';
import { productsAPI } from '../../services/api';
import type { Product } from '../../types';
import ProductModal from './ProductModal';
import ProductDetailsModal from './ProductDetailsModal';
import ConfirmModal from '../Common/ConfirmModal';
import OrdersTab from './OrdersTab';
import SettingsTab from './SettingsTab';


const ProductsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders' | 'settings'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ... (rest of the vars)
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: '',
    type: 'warning',
    onConfirm: () => {}
  });

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const data = await productsAPI.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = (product: Product) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Product?',
      description: `Are you sure you want to delete "${product.name}"? This will remove it from the catalog and the Assistant will no longer suggest it.`,
      confirmText: 'Delete Product',
      type: 'danger',
      onConfirm: async () => {
        try {
          await productsAPI.deleteProduct(product.id);
          fetchProducts();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          alert('Failed to delete product.');
        }
      }
    });
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalStock = products.reduce((acc, p) => acc + p.stock_quantity, 0);
  const outOfStock = products.filter(p => p.stock_quantity === 0).length;
  const totalValue = products.reduce((acc, p) => acc + (p.price * p.stock_quantity), 0);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0f172a] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                <ShoppingBag className="w-5 h-5 text-white" />
              </span>
              Store Manager
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">
              Manage inventory, view orders, and configure automated sales.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'catalog' && (
              <button
                onClick={() => { setSelectedProduct(null); setShowModal(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/25 font-bold text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Product
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-gray-200 dark:border-white/10">
          {[
            { id: 'catalog', label: 'Product Catalog', icon: <Package className="w-4 h-4" /> },
            { id: 'orders', label: 'Order Managment', icon: <ShoppingCart className="w-4 h-4" /> },
            { id: 'settings', label: 'Sales Settings', icon: <CreditCard className="w-4 h-4" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'catalog' ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
              {[
                { label: 'Products', value: products.length, icon: <Package className="w-5 h-5" />, color: 'blue' },
                { label: 'Total Stock', value: totalStock, icon: <Layers className="w-5 h-5" />, color: 'indigo' },
                { label: 'Out of Stock', value: outOfStock, icon: <AlertCircle className="w-5 h-5" />, color: 'rose' },
                { label: 'Inventory Value', value: `$${totalValue.toLocaleString()}`, icon: <DollarSign className="w-5 h-5" />, color: 'green' },
              ].map((stat, i) => (
                <div key={i} className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className={`p-2 rounded-xl border border-${stat.color}-500/20 bg-${stat.color}-500/10 text-${stat.color}-500`}>
                            {stat.icon}
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
                    </div>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">{stat.value}</p>
                </div>
              ))}
            </div>


            {/* Content */}
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Inventory List</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm font-medium outline-none focus:border-blue-500 transition-all w-64 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5">
                    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading products...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/5 p-20 text-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500 border border-blue-500/20">
                    <Package className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">No products found</h3>
                  <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">Start building your catalog to enable auto-detection in chat.</p>
                  <button
                    onClick={() => { setSelectedProduct(null); setShowModal(true); }}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20"
                  >
                    <Plus className="w-4 h-4" /> Add First Product
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map(product => (
                    <div 
                      key={product.id} 
                      onClick={() => setViewProduct(product)}
                      className="group bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer"
                    >
                      <div className="aspect-video relative overflow-hidden bg-gray-100 dark:bg-black/20">
                        {product.photo_urls && product.photo_urls.length > 0 ? (
                          <img src={product.photo_urls[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : product.photo_url ? (
                          <img src={product.photo_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-700">
                            <ShoppingBag className="w-12 h-12" />
                          </div>
                        )}
                        <div className="absolute top-4 left-4">
                          {product.stock_quantity > 0 ? (
                            <div className="bg-green-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                              <PackageCheck className="w-3.5 h-3.5" /> In Stock: {product.stock_quantity}
                            </div>
                          ) : (
                            <div className="bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                              <PackageX className="w-3.5 h-3.5" /> Out of Stock
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-6 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight truncate">{product.name}</h3>
                            <p className="text-xl font-black text-blue-600 mt-1">${product.price.toLocaleString()}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); setShowModal(true); }}
                              className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-blue-500 transition-all border border-transparent hover:border-blue-500/20"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete(product); }}
                              className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-rose-500 transition-all border border-transparent hover:border-rose-500/20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed h-10">
                          {product.description || 'No description provided.'}
                        </p>

                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                          {product.keywords?.map((k, i) => (
                            <span key={i} className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 rounded-lg">
                              #{k}
                            </span>
                          ))}
                          {(!product.keywords || product.keywords.length === 0) && (
                            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">No keywords</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'orders' ? (
           <div className="animate-fade-in">
              <OrdersTab />
           </div>
        ) : (
           <div className="animate-fade-in">
              <SettingsTab />
           </div>
        )}
      </div>

      <ProductModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchProducts}
        product={selectedProduct}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        type={confirmConfig.type}
      />
      <ProductDetailsModal
        isOpen={!!viewProduct}
        onClose={() => setViewProduct(null)}
        product={viewProduct}
      />
    </div>
  );
};

export default ProductsPage;
