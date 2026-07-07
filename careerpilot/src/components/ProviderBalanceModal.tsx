import React, { useEffect, useState } from 'react';
import { Coins, AlertCircle, CheckCircle2, ExternalLink, RefreshCw, X } from 'lucide-react';
import { ProviderBalance } from '../types';

interface ProviderBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProviderBalanceModal({ isOpen, onClose }: ProviderBalanceModalProps) {
  const [balances, setBalances] = useState<ProviderBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');

  const fetchBalances = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/provider-balances');
      if (!res.ok) throw new Error('无法连接至供应商审计网关');
      const data = await res.json();
      setBalances(data.providers || []);
      setSummary(data.summary || '');
    } catch (err: any) {
      setError(err.message || '获取额度状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBalances();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
      <div className="bg-white border border-slate-250 shadow-2xl rounded-2xl max-w-2xl w-full p-6 relative flex flex-col max-h-[85vh] animate-fade-in text-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5 text-slate-800">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800">求职 Agent 供应商算力网关</h3>
              <p className="text-xs text-slate-500">实时审计多路 LLM/Search 供应商的余额与安全调用水位</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBalances}
              disabled={loading}
              className="p-1.5 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
              title="刷新额度"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          {summary && (
            <div className="p-3 bg-sky-500/5 text-sky-700 rounded-lg text-xs flex items-start gap-2 border border-sky-500/10">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-sky-600" />
              <span>{summary}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/5 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-500/10">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
              <p className="text-xs text-slate-500">正在与供应商安全通信，拉取授权额度...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {balances.map((prov) => {
                const isLow = prov.percent_remaining < 30;
                const progressColor = isLow ? 'bg-rose-500' : 'bg-emerald-500';
                const textColor = isLow ? 'text-rose-600' : 'text-emerald-600';

                return (
                  <div
                    key={prov.provider}
                    className="border border-slate-200 rounded-xl p-4 bg-white/45 flex flex-col justify-between hover:border-slate-300 hover:bg-white/60 transition-all shadow-sm"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-bold text-sm text-slate-800 block">{prov.label}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 inline-block mt-1 uppercase font-mono border border-slate-200">
                            {prov.source === 'live' ? '⚡️ 实时对接' : '📁 缓存预算'}
                          </span>
                        </div>
                        {prov.configured ? (
                          <span className="text-[10px] text-emerald-600 bg-emerald-500/5 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 已授权
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 bg-amber-500/5 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold">
                            未配置秘钥
                          </span>
                        )}
                      </div>

                      {/* Gauge bar */}
                      <div className="space-y-1.5 mt-3">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-slate-500">安全水位</span>
                          <span className={`font-bold ${textColor}`}>{prov.percent_remaining}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${prov.percent_remaining}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-150 text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px]">剩余余额</span>
                          <span className="font-bold text-slate-800">{prov.balance_label}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">大约可用频次</span>
                          <span className="font-bold text-slate-800">{prov.remaining_label}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-150 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 italic font-mono">{prov.unit_label}</span>
                      <a
                        href={prov.docs}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-sky-600 hover:text-sky-700 flex items-center gap-0.5"
                      >
                        文档 <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>

                    {prov.issues && prov.issues.length > 0 && (
                      <div className="mt-2 text-[10px] text-amber-700 bg-amber-500/5 p-2 rounded border border-amber-500/10">
                        {prov.issues.map((iss, i) => <p key={i}>{iss}</p>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-4 mt-4 flex justify-between items-center text-[10px] text-slate-500">
          <span>🔒 供应商数据传输遵循加密协议，不会泄露任何 API Keys。</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-lg text-xs transition-colors"
          >
            完成审计
          </button>
        </div>
      </div>
    </div>
  );
}
