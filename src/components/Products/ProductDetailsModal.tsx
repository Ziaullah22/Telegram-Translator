import React, { useState } from 'react';
import { X, Package, Layers, Hash, PackageCheck, PackageX, ChevronLeft, ChevronRight, Image as ImageIcon, Truck, MapPin } from 'lucide-react';
import type { Product } from '../../types';

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  allProducts: Product[];
}

const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ isOpen, onClose, product, allProducts }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!isOpen || !product) return null;

  const upsellProduct = product.upsell_product_id ? allProducts.find(p => p.id === product.upsell_product_id) : null;

  const photos = product.photo_urls && product.photo_urls.length > 0 
    ? product.photo_urls 
    : (product.photo_url ? [product.photo_url] : []);

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % photos.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[73px] z-[10000] flex items-center justify-center p-0">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      
      <div className="relative w-full h-full flex flex-col bg-white dark:bg-[#1a222c] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="border-b border-blue-100 dark:border-white/5 bg-[#f0f9ff] dark:bg-[#0f172a] z-20 shrink-0 shadow-sm transition-colors">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                <Package className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-lg font-black text-gray-900 dark:text-white leading-none uppercase tracking-tight">
                  Product Details
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Inventory & Catalog View
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button 
                onClick={onClose} 
                className="w-10 h-10 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all text-gray-400 hover:text-red-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 dark:bg-transparent">
          <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
            
            {/* Image Gallery */}
            <div className="bg-white dark:bg-[#1e293b] rounded-[32px] p-2 border border-gray-100 dark:border-white/5 shadow-sm">
              <div className="h-[300px] md:h-[400px] relative rounded-[28px] bg-gray-100 dark:bg-black/30 overflow-hidden group flex items-center justify-center">
                {photos.length > 0 ? (
                  <>
                    <img 
                      src={photos[currentImageIndex]} 
                      alt={`${product.name} - ${currentImageIndex + 1}`} 
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
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <div className="w-16 h-16 bg-white dark:bg-black/20 rounded-2xl flex items-center justify-center mb-4 border border-gray-200 dark:border-white/10">
                      <ImageIcon className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-center">No images available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Product Details Card - Split Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] rounded-[32px] p-10 border border-gray-100 dark:border-white/5 shadow-sm space-y-8">
                <div className="space-y-2">
                  <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                    {product.name}
                  </h1>
                  <div className="flex items-center gap-2">
                    {product.stock_quantity > 0 ? (
                      <div className="bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-green-500/20">
                        <PackageCheck className="w-3.5 h-3.5" /> In Stock: {product.stock_quantity}
                      </div>
                    ) : (
                      <div className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-rose-500/20">
                        <PackageX className="w-3.5 h-3.5" /> Out of Stock
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-px w-full bg-gray-100 dark:bg-white/5" />

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Description
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[16px] whitespace-pre-wrap">
                    {product.description || 'No description provided for this product.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-lg shadow-blue-600/20 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Retail Price</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black">${product.price.toLocaleString()}</span>
                    <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">/ unit</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1e293b] rounded-[32px] p-8 border border-gray-100 dark:border-white/5 shadow-sm space-y-6">
                  {upsellProduct && (
                    <div className="space-y-4 pb-6 border-b border-gray-100 dark:border-white/5">
                      <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Package className="w-4 h-4 text-orange-500" /> Recommended Upsell
                      </h3>
                      <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-2xl border border-gray-100 dark:border-white/10 group cursor-default">
                        <p className="text-sm font-black text-gray-900 dark:text-white truncate">{upsellProduct.name}</p>
                        <p className="text-lg font-black text-orange-500 mt-1">${upsellProduct.price.toLocaleString()}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pb-6 border-b border-gray-100 dark:border-white/5">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Delivery Mode
                    </h3>
                    <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-2xl border border-gray-100 dark:border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                          {product.delivery_mode === 'mailing' ? <Truck className="w-4 h-4" /> : 
                           product.delivery_mode === 'hand_to_hand' ? <MapPin className="w-4 h-4" /> : 
                           <Package className="w-4 h-4" />}
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">
                          {product.delivery_mode === 'both' ? 'Both (Mailing & Hand-to-Hand)' : 
                           product.delivery_mode === 'mailing' ? 'Mailing Only' : 
                           product.delivery_mode === 'hand_to_hand' ? 'Hand-to-Hand Only' : 
                           'Standard Delivery'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Hash className="w-4 h-4" /> Keywords
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {product.keywords?.map((k, i) => (
                        <span key={i} className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-gray-400 rounded-xl border border-gray-200 dark:border-white/10">
                          #{k}
                        </span>
                      ))}
                      {(!product.keywords || product.keywords.length === 0) && (
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">None</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProductDetailsModal;
