import React from 'react';
import { EvalReport } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, Shield, ExternalLink, RefreshCw } from 'lucide-react';

interface QualityGateReportProps {
  onTriggerEval: () => Promise<void>;
  evalReport: EvalReport | null;
  loading: boolean;
}

export default function QualityGateReport({
  onTriggerEval,
  evalReport,
  loading
}: QualityGateReportProps) {
  const gateColor = evalReport?.gate === 'PASS' ? 'text-emerald-600' : evalReport?.gate === 'WARN' ? 'text-amber-600' : 'text-rose-600';
  const gateBg = evalReport?.gate === 'PASS' ? 'bg-emerald-500/5' : evalReport?.gate === 'WARN' ? 'bg-amber-500/5' : 'bg-rose-500/5';
  const gateBorder = evalReport?.gate === 'PASS' ? 'border-emerald-500/20' : evalReport?.gate === 'WARN' ? 'border-amber-500/20' : 'border-rose-500/20';

  return (
    <div className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-2xl p-6 space-y-5 text-slate-850">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm md:text-base">QualityGate 投递链路安全合规评测</h4>
            <p className="text-xs text-slate-500">大模型审计、证据完整度及虚假成分排查关卡</p>
          </div>
        </div>

        <button
          onClick={onTriggerEval}
          disabled={loading}
          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {evalReport ? '重新评测' : '运行评测'}
        </button>
      </div>

      {evalReport ? (
        <div className="space-y-4 animate-fade-in">
          {/* Summary bar */}
          <div className={`border p-4 rounded-xl ${gateBg} ${gateBorder} flex flex-col md:flex-row gap-4 justify-between items-center text-center md:text-left`}>
            <div className="flex items-center gap-3 max-md:flex-col">
              <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <span className={`text-xl font-extrabold ${gateColor}`}>{evalReport.score}</span>
              </div>
              <div>
                <h5 className="font-bold text-slate-800 text-sm">审计判定：
                  <span className={`${gateColor} uppercase font-extrabold font-mono ml-1`}>{evalReport.gate}</span>
                </h5>
                <p className="text-xs text-slate-500 mt-1">
                  共通过了 {evalReport.passed} 项验证，包含 {evalReport.warnings} 个警告风险项。
                </p>
              </div>
            </div>

            <a
              href="/api/evals/active/report.html"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-750 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 shadow-sm transition-all active:scale-95"
            >
              打开完整 HTML 审计报告 <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
            </a>
          </div>

          {/* Checklist items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evalReport.items.map((item, i) => {
              const itemColor = item.status === 'PASS' ? 'text-emerald-600' : item.status === 'WARN' ? 'text-amber-600' : 'text-rose-600';
              const ItemIcon = item.status === 'PASS' ? CheckCircle2 : item.status === 'WARN' ? AlertTriangle : XCircle;

              return (
                <div key={i} className="p-3 bg-white/40 border border-slate-200 rounded-xl flex gap-3 hover:border-slate-350 transition-colors shadow-sm">
                  <ItemIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${itemColor}`} />
                  <div>
                    <h6 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      {item.check_name}
                      <span className={`text-[9px] font-bold uppercase ${itemColor}`}>{item.status}</span>
                    </h6>
                    <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-slate-500 text-xs">
          💡 暂未生成评测报告。请点击“运行评测”触发 QualityGate 多级合规判定。
        </div>
      )}
    </div>
  );
}
