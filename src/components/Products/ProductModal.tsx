import React, { useState, useEffect } from 'react';
import { X, Package, Upload, Loader2, AlertCircle } from 'lucide-react';
import { productsAPI } from '../../services/api';
import type { Product } from '../../types';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product?: Product | null;
}

const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose, onSuccess, product }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [keywords, setKeywords] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [retainedPhotoUrls, setRetainedPhotoUrls] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(product.price);
      setStock(product.stock_quantity);
      setKeywords(product.keywords?.join(', ') || '');
      setImages([]);
      const urls = product.photo_urls && product.photo_urls.length > 0
        ? [...product.photo_urls]
        : (product.photo_url ? [product.photo_url] : []);
      setRetainedPhotoUrls(urls);
      setImagePreviews(urls);
    } else {
      setName('');
      setDescription('');
      setPrice(0);
      setStock(0);
      setKeywords('');
      setImages([]);
      setImagePreviews([]);
      setRetainedPhotoUrls([]);
    }
    setError(null);
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setImages(prev => [...prev, ...newFiles]);

      const newPreviews = newFiles.map(file => URL.createObjectURL(file));
      setImagePreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removePhoto = (index: number) => {
    if (index < retainedPhotoUrls.length) {
      const newRetained = [...retainedPhotoUrls];
      newRetained.splice(index, 1);
      setRetainedPhotoUrls(newRetained);
    } else {
      const newFileIndex = index - retainedPhotoUrls.length;
      const newImages = [...images];
      newImages.splice(newFileIndex, 1);
      setImages(newImages);
    }

    const newPreviews = [...imagePreviews];
    newPreviews.splice(index, 1);
    setImagePreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      formData.append('price', price.toString());
      formData.append('stock_quantity', stock.toString());

      const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k);
      formData.append('keywords', JSON.stringify(keywordArray));

      images.forEach(img => {
        formData.append('files', img);
      });

      if (product) {
        formData.append('retained_photo_urls', JSON.stringify(retainedPhotoUrls));
        await productsAPI.updateProduct(product.id, formData);
      } else {
        await productsAPI.createProduct(formData);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save product:', err);
      setError(err.response?.data?.detail || 'Failed to save product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
                  {product ? 'Edit Product' : 'Add New Product'}
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  {product ? 'Update inventory details' : 'Build your catalog'}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 dark:bg-[#111827]">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm">
              <div className="p-8 space-y-8">
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 animate-shake">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-bold">{error}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      1. Product Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Slim Leather Case"
                      className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      2. Keywords (Auto-detection)
                    </label>
                    <input
                      type="text"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="e.g. case, cover, slim"
                      className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      3. Price (USD)
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</div>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={price}
                        onChange={(e) => setPrice(parseFloat(e.target.value))}
                        className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      4. Stock Quantity
                    </label>
                    <input
                      type="number"
                      required
                      value={stock}
                      onChange={(e) => setStock(parseInt(e.target.value))}
                      className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    5. Product Description
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter product details..."
                    className="w-full bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-white focus:border-blue-500 transition-all outline-none resize-none"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" /> Product Photos
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative group aspect-square rounded-2xl overflow-hidden border border-gray-100 dark:border-white/10">
                        <img src={preview} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                            className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform shadow-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div
                      onClick={() => document.getElementById('product-image-upload')?.click()}
                      className="aspect-square rounded-2xl bg-gray-50 dark:bg-black/20 border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-blue-500/50 transition-all overflow-hidden flex flex-col items-center justify-center gap-2 cursor-pointer group"
                    >
                      <Upload className="w-6 h-6 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center px-2">Add Photo</p>
                    </div>
                  </div>

                  <input
                    id="product-image-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] transition-all bg-white dark:bg-[#1a222c] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !name}
                  className="flex-[2] px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    product ? 'Update product' : 'Save product'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
