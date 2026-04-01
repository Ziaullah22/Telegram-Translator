import React, { useState, useEffect } from 'react';
import { Beaker, TrendingUp, Users, CheckCircle, Save, Info, AlertCircle } from 'lucide-react';
import { salesAPI } from '../../services/api';

const ABTestingTab: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const [testName, setTestName] = useState('Purchase Pitch Test');
    const [variantA, setVariantA] = useState('');
    const [variantB, setVariantB] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [stats, setStats] = useState({
        participants: 0,
        conversions: 0,
        variantAParticipants: 0,
        variantAConversions: 0,
        variantBParticipants: 0,
        variantBConversions: 0
    });

    const fetchABTests = async () => {
        try {
            setIsLoading(true);
            const response = await salesAPI.getABTests();
            if (response && response.length > 0) {
                const test = response[0];
                setTestName(test.name);
                setVariantA(test.variant_a_text);
                setVariantB(test.variant_b_text);
                setIsActive(test.is_active);

                // Use exact per-variant data from backend
                setStats({
                    participants: test.total_participants || 0,
                    conversions: test.total_conversions || 0,
                    variantAParticipants: test.variant_a_participants || 0,
                    variantAConversions: test.variant_a_conversions || 0,
                    variantBParticipants: test.variant_b_participants || 0,
                    variantBConversions: test.variant_b_conversions || 0
                });
            }
        } catch (error) {
            console.error('Failed to fetch A/B tests:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchABTests();
    }, []);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await salesAPI.updateABTest({
                name: testName,
                variant_a_text: variantA,
                variant_b_text: variantB,
                is_active: isActive
            });
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
            fetchABTests(); // Refresh stats
        } catch (error) {
            console.error('Failed to save A/B test:', error);
            alert('Failed to save A/B test settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const getCR = (conv: number, part: number) => {
        if (!part) return 0;
        return ((conv / part) * 100).toFixed(1);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-100 dark:border-white/5">
                <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Loading Research Lab...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
            {/* Header / Intro */}
            <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8 transition-all hover:shadow-xl hover:shadow-blue-500/5">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-500/20 shadow-inner">
                        <Beaker className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">A/B Traffic Testing</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Test two different sales pitches to see which one converts more customers.</p>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50/30 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-500/20 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                        <span className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                            {isActive ? 'Experiment Running' : 'Experiment Paused'}
                        </span>
                    </div>
                    <button 
                        onClick={() => setIsActive(!isActive)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            isActive ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                        }`}
                    >
                        {isActive ? 'Stop Test' : 'Start Test'}
                    </button>
                </div>
            </div>

            {/* Test Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Variant A */}
                <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8 transition-all hover:shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-blue-500/30">A</span>
                        <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Pitch Variant A</h4>
                    </div>
                    <textarea
                        value={variantA}
                        onChange={(e) => setVariantA(e.target.value)}
                        placeholder="e.g. 'Limited time offer! Buy now and save 20%.'"
                        className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all min-h-[160px] text-gray-900 dark:text-white leading-relaxed"
                    />
                </div>

                {/* Variant B */}
                <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8 transition-all hover:shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-indigo-500/30">B</span>
                        <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Pitch Variant B</h4>
                    </div>
                    <textarea
                        value={variantB}
                        onChange={(e) => setVariantB(e.target.value)}
                        placeholder="e.g. 'Premium quality guaranteed. Order yours before stock runs out!'"
                        className="w-full bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-2xl p-6 text-sm font-medium outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all min-h-[160px] text-gray-900 dark:text-white leading-relaxed"
                    />
                </div>
            </div>

            {/* Quick Analytics Preview */}
            <div className="bg-white dark:bg-[#1e293b] rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden p-8">
                <div className="flex items-center gap-3 mb-8">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Live Conversion Data</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   {/* Progress Bars */}
                   <div className="space-y-6">
                       <div className="space-y-2">
                           <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-1">
                               <span className="text-gray-400">Variant A Conversion</span>
                               <span className="text-blue-500">{getCR(stats.variantAConversions, stats.variantAParticipants)}%</span>
                           </div>
                           <div className="h-3 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                               <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${getCR(stats.variantAConversions, stats.variantAParticipants)}%` }}></div>
                           </div>
                       </div>
                       <div className="space-y-2">
                           <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-1">
                               <span className="text-gray-400">Variant B Conversion</span>
                               <span className="text-indigo-500">{getCR(stats.variantBConversions, stats.variantBParticipants)}%</span>
                           </div>
                           <div className="h-3 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                               <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${getCR(stats.variantBConversions, stats.variantBParticipants)}%` }}></div>
                           </div>
                       </div>
                   </div>

                   {/* Stats Grid */}
                   <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                           <div className="flex items-center gap-2 mb-1">
                               <Users className="w-3 h-3 text-gray-400" />
                               <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Participants</span>
                           </div>
                           <p className="text-xl font-black text-gray-900 dark:text-white">{stats.participants}</p>
                       </div>
                       <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                           <div className="flex items-center gap-2 mb-1">
                               <CheckCircle className="w-3 h-3 text-green-500" />
                               <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Sales</span>
                           </div>
                           <p className="text-xl font-black text-gray-900 dark:text-white">{stats.conversions}</p>
                       </div>
                   </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 pb-12">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-[32px] font-black uppercase tracking-[0.2em] text-xs transition-all shadow-2xl shadow-blue-600/30 active:scale-[0.98] disabled:opacity-50"
                >
                    {isSaving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : showSuccess ? (
                        <CheckCircle className="w-6 h-6" />
                    ) : (
                        <Save className="w-6 h-6" />
                    )}
                    {isSaving ? 'Launching Experiment...' : showSuccess ? 'Test Configured Successfully!' : 'Save & Update Experiment'}
                </button>
            </div>
        </div>
    );
};

export default ABTestingTab;
